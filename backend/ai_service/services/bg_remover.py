"""
Background removal service using rembg.

Supports:
  - Transparent output (RGBA PNG)
  - Solid colour replacement (white / black / custom hex)
  - Hair-edge preservation via u2net_human_seg or isnet-general-use
"""

from __future__ import annotations

import io
from typing import Optional, Tuple

from PIL import Image

# rembg is optional; fall back to a colour-threshold approach if unavailable.
try:
    from rembg import remove as _rembg_remove, new_session as _new_session
    _REMBG_AVAILABLE = True
except ImportError:
    _REMBG_AVAILABLE = False

# Cache sessions so we don't reload the model on every request.
_sessions: dict[str, object] = {}


def _get_session(model_name: str):
    if not _REMBG_AVAILABLE:
        return None
    if model_name not in _sessions:
        _sessions[model_name] = _new_session(model_name)
    return _sessions[model_name]


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


def _threshold_bg_remove(pil_img: Image.Image) -> Image.Image:
    """
    Simple colour-threshold background removal (corner-sample strategy).
    Used only when rembg is not installed.
    """
    import numpy as np
    img = pil_img.convert("RGBA")
    data = np.array(img, dtype=np.int32)

    # Sample four corners and average
    corners = [
        data[0, 0, :3],
        data[0, -1, :3],
        data[-1, 0, :3],
        data[-1, -1, :3],
    ]
    bg = np.mean(corners, axis=0).astype(int)

    diff = np.abs(data[:, :, :3] - bg).sum(axis=2)
    mask = diff < 60          # pixels similar to corner colour → transparent
    data[mask, 3] = 0
    return Image.fromarray(data.astype(np.uint8), "RGBA")


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

    # ── Background removal ─────────────────────────────────────────────────────
    if _REMBG_AVAILABLE:
        session = _get_session(model_name)
        rgba_img = _rembg_remove(pil_img, session=session)
        if not isinstance(rgba_img, Image.Image):
            rgba_img = Image.open(io.BytesIO(rgba_img)).convert("RGBA")
        else:
            rgba_img = rgba_img.convert("RGBA")
    else:
        rgba_img = _threshold_bg_remove(pil_img)

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
