# -*- coding: utf-8 -*-
"""
Background removal service using rembg.

Supports:
  - Transparent output (RGBA PNG)
  - Solid colour replacement (white / black / custom hex)
  - Hair-edge preservation via u2net_human_seg or isnet-general-use
"""

from __future__ import annotations

import io
import os
import threading
from typing import Optional, Tuple

from PIL import Image

# rembg is optional; fall back to a colour-threshold approach if unavailable.
try:
    from rembg import remove as _rembg_remove, new_session as _new_session
    _REMBG_AVAILABLE = True
except ImportError:
    _REMBG_AVAILABLE = False

# ── Thread-local session cache ────────────────────────────────────────────────
# Each worker thread gets its OWN rembg/ONNX session so there is zero shared
# mutable state between concurrent inferences.  The global dict was safe for
# reads but rembg's ONNX Runtime session internally caches computation graphs
# and buffers that are NOT designed for simultaneous multi-thread use; sharing
# one session across 8-30 threads caused ONNX to deadlock / stall.
_thread_local = threading.local()

# Hard cap on concurrent rembg inferences.  rembg/ONNX uses its own internal
# thread pool (usually cpu_count threads).  Running N_WORKERS concurrent
# inferences each spawning cpu_count ONNX threads = N_WORKERS × cpu_count
# OS threads → severe context-switch overhead and apparent "stuck" behaviour.
# Limiting to min(4, cpu_count) gives each inference enough CPU without
# oversubscribing the machine.
_N_REMBG = max(2, min(4, os.cpu_count() or 4))
_REMBG_SEMAPHORE = threading.Semaphore(_N_REMBG)

# Maximum image dimension (px) for rembg inference.
# U2Net runs at 320 px internally; 320 px input avoids a wasted PIL resize
# step inside rembg and cuts per-call memory by ~2.4× vs the old 512 px.
_INFERENCE_MAX_DIM = 320


def _get_session(model_name: str):
    """Return (and lazily create) a per-thread rembg session."""
    if not _REMBG_AVAILABLE:
        return None
    if not hasattr(_thread_local, "sessions"):
        _thread_local.sessions = {}
    if model_name not in _thread_local.sessions:
        _thread_local.sessions[model_name] = _new_session(model_name)
    return _thread_local.sessions[model_name]


def _parse_hex_color(hex_str: str) -> Tuple[int, int, int, int]:
    """Parse '#rrggbb' or '#rrggbbaa' into (r, g, b, a) tuple."""
    h = hex_str.lstrip("#")
    if len(h) == 6:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return r, g, b, 255
    elif len(h) == 8:
        r, g, b, a = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16)
        return r, g, b, a
    raise ValueError(f"Invalid hex color: {hex_str!r}")


def _rembg_with_upscaled_alpha(
    infer_img: Image.Image,
    original_img: Image.Image,
    session,
) -> Image.Image:
    """
    Run rembg on `infer_img` (possibly downscaled) then upscale the resulting
    alpha mask back to `original_img.size` for full-resolution compositing.

    The RGB channels of the output come from `original_img` so full photo
    detail is preserved even when the model ran on a smaller input.
    """
    rgba_small = _rembg_remove(infer_img, session=session)
    if not isinstance(rgba_small, Image.Image):
        rgba_small = Image.open(io.BytesIO(rgba_small)).convert("RGBA")
    else:
        rgba_small = rgba_small.convert("RGBA")

    # No upscaling needed when inference ran at original resolution
    if rgba_small.size == original_img.size:
        return rgba_small

    # Upscale only the alpha channel to preserve smooth edges
    a_ch = rgba_small.split()[3]
    a_full = a_ch.resize(original_img.size, Image.LANCZOS)

    # Composite with original full-resolution colour channels
    r_ch, g_ch, b_ch, _ = original_img.convert("RGBA").split()
    return Image.merge("RGBA", (r_ch, g_ch, b_ch, a_full))


def _grabcut_bg_remove(pil_img: Image.Image) -> Image.Image:
    """
    GrabCut-based background removal using OpenCV.
    Assumes the subject is in the central area of the image.
    Used only when rembg is not installed.
    """
    import numpy as np
    import cv2
    bgr = cv2.cvtColor(np.array(pil_img.convert("RGB")), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]

    # Work at ≤512 for speed
    scale = min(1.0, 512.0 / max(h, w))
    ww, wh = max(1, int(w * scale)), max(1, int(h * scale))
    small = cv2.resize(bgr, (ww, wh), cv2.INTER_AREA)

    mx, my = int(ww * 0.08), int(wh * 0.05)
    rect = (mx, my, ww - 2 * mx, wh - 2 * my)

    mask_gc = np.zeros((wh, ww), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(small, mask_gc, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    except Exception:
        mask_gc[:] = cv2.GC_PR_FGD  # if GrabCut fails, keep everything

    fg = np.where((mask_gc == cv2.GC_FGD) | (mask_gc == cv2.GC_PR_FGD),
                  255, 0).astype(np.uint8)
    fg = cv2.GaussianBlur(fg, (7, 7), 2)
    fg_full = cv2.resize(fg, (w, h), cv2.INTER_LINEAR)

    rgba = np.array(pil_img.convert("RGBA"))
    rgba[:, :, 3] = fg_full
    return Image.fromarray(rgba, "RGBA")


def remove_background(
    image_bytes: bytes,
    bg_color: str = "transparent",
    model_name: str = "u2net_human_seg",
) -> bytes:
    """
    Remove the background of an image and optionally fill it with a solid colour.

    Parameters
    ----------
    image_bytes   Raw image bytes.
    bg_color      'transparent' | 'white' | 'black' | '#rrggbb'
    model_name    rembg model name. 'u2net_human_seg' gives best results for
                  portrait photos with preserved hair edges.

    Returns
    -------
    PNG bytes (RGBA when transparent, RGB otherwise).
    """
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    original_size = pil_img.size  # (width, height)

    # ── Background removal ─────────────────────────────────────────────────────
    if _REMBG_AVAILABLE:
        session = _get_session(model_name)

        # Downscale to _INFERENCE_MAX_DIM (320 px) — rembg U2Net runs inference
        # at 320 px internally anyway, so sending a larger image just adds
        # wasted PIL resize work and extra per-call memory.
        max_dim = max(original_size)
        if max_dim > _INFERENCE_MAX_DIM:
            scale = _INFERENCE_MAX_DIM / max_dim
            infer_w = max(1, round(original_size[0] * scale))
            infer_h = max(1, round(original_size[1] * scale))
            infer_img = pil_img.resize((infer_w, infer_h), Image.LANCZOS)
        else:
            infer_img = pil_img

        # Acquire semaphore BEFORE calling rembg: limits concurrent ONNX
        # inferences to _N_REMBG so each call gets adequate CPU without
        # the thread-explosion that caused the pipeline to stall.
        with _REMBG_SEMAPHORE:
            rgba_img = _rembg_with_upscaled_alpha(infer_img, pil_img, session)
    else:
        rgba_img = _grabcut_bg_remove(pil_img)

    # ── Background fill ────────────────────────────────────────────────────────
    if bg_color == "transparent":
        output = rgba_img
        fmt = "PNG"
    else:
        # Determine fill colour
        if bg_color == "white":
            fill: Tuple[int, int, int, int] = (255, 255, 255, 255)
        elif bg_color == "black":
            fill = (0, 0, 0, 255)
        else:
            try:
                fill = _parse_hex_color(bg_color)
            except ValueError:
                fill = (255, 255, 255, 255)  # fallback to white

        canvas = Image.new("RGBA", rgba_img.size, fill)
        canvas.paste(rgba_img, mask=rgba_img.split()[3])  # use alpha channel as mask
        output = canvas.convert("RGB")
        fmt = "JPEG"

    buf = io.BytesIO()
    if fmt == "PNG":
        output.save(buf, format="PNG", optimize=True)
    else:
        output.save(buf, format="JPEG", quality=92, optimize=True)
    return buf.getvalue()
