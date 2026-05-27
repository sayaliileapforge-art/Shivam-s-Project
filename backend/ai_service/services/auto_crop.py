"""
Auto-crop service.

Strategy (in order of availability):
  1. MediaPipe Face Detection  → tight face + padding, then letterbox to target ratio
  2. OpenCV Haar Cascade fallback
  3. Centre-crop fallback (no face found)

Aspect ratio presets
--------------------
  "1:1"      → square (student photos)
  "3:4"      → portrait (passport-style)
  "2:3"      → portrait (standard photo)
  "passport" → 35×45 mm ratio  ≈  7:9
  "id_card"  → 54×86 mm ID card photo region  ≈  3:4
"""

from __future__ import annotations

import io
import math
from typing import Tuple, Optional

import cv2
import numpy as np
from PIL import Image

# ── Try to import MediaPipe (optional; falls back to OpenCV) ──────────────────
try:
    import mediapipe as mp
    _mp_face = mp.solutions.face_detection.FaceDetection(
        model_selection=1,
        min_detection_confidence=0.45,
    )
    _USE_MEDIAPIPE = True
except Exception:
    _mp_face = None
    _USE_MEDIAPIPE = False

# ── OpenCV Haar cascade ───────────────────────────────────────────────────────
import os as _os
_HAAR_PATH = _os.path.join(
    _os.path.dirname(cv2.__file__),
    "data", "haarcascade_frontalface_default.xml",
)
_haar_cascade = cv2.CascadeClassifier(_HAAR_PATH) if _os.path.exists(_HAAR_PATH) else None

# ── Ratio map ─────────────────────────────────────────────────────────────────
_RATIO_MAP: dict[str, Tuple[float, float]] = {
    "1:1":      (1.0,  1.0),
    "3:4":      (3.0,  4.0),
    "2:3":      (2.0,  3.0),
    "passport": (35.0, 45.0),
    "id_card":  (54.0, 86.0),
}


def _parse_ratio(ratio_str: str) -> Tuple[float, float]:
    if ratio_str in _RATIO_MAP:
        return _RATIO_MAP[ratio_str]
    try:
        w, h = ratio_str.split(":")
        return float(w), float(h)
    except Exception:
        return 1.0, 1.0


def _detect_face_mediapipe(rgb: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """Return (x, y, w, h) of the best face bounding box, or None."""
    if not _USE_MEDIAPIPE or _mp_face is None:
        return None
    results = _mp_face.process(rgb)
    if not results.detections:
        return None
    det = results.detections[0]
    bb = det.location_data.relative_bounding_box
    ih, iw = rgb.shape[:2]
    x = max(0, int(bb.xmin * iw))
    y = max(0, int(bb.ymin * ih))
    w = min(int(bb.width * iw), iw - x)
    h = min(int(bb.height * ih), ih - y)
    return x, y, w, h


def _detect_face_opencv(gray: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    """Return (x, y, w, h) of the best face bounding box using Haar cascade."""
    if _haar_cascade is None:
        return None
    faces = _haar_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
    )
    if not len(faces):
        return None
    # Pick largest face
    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    x, y, w, h = faces[0]
    return int(x), int(y), int(w), int(h)


def _expand_to_ratio(
    cx: float, cy: float,
    face_h: float,
    target_w: float, target_h: float,
    img_w: int, img_h: int,
    padding_pct: float,
) -> Tuple[int, int, int, int]:
    """
    Compute a crop rectangle centred on (cx, cy) with enough height to
    enclose `face_h * (1 + padding_pct)` and matching the target aspect ratio.
    """
    crop_h = face_h * (1.0 + padding_pct * 2)
    crop_w = crop_h * (target_w / target_h)

    # Ensure face fits; expand if needed
    x1 = int(cx - crop_w / 2)
    y1 = int(cy - crop_h * 0.45)   # more headroom above than below
    x2 = int(x1 + crop_w)
    y2 = int(y1 + crop_h)

    # Clamp to image bounds
    if x1 < 0:
        x2 -= x1; x1 = 0
    if y1 < 0:
        y2 -= y1; y1 = 0
    if x2 > img_w:
        x1 -= x2 - img_w; x2 = img_w
    if y2 > img_h:
        y1 -= y2 - img_h; y2 = img_h
    x1 = max(0, x1); y1 = max(0, y1)

    return x1, y1, x2, y2


def crop_image(
    image_bytes: bytes,
    aspect_ratio: str = "1:1",
    padding_pct: float = 0.15,
) -> bytes:
    """
    Detect face / person and smart-crop to the desired aspect ratio.

    Parameters
    ----------
    image_bytes   Raw bytes of the source image (JPEG / PNG / WEBP …)
    aspect_ratio  Target crop ratio string (e.g. "1:1", "3:4", "passport")
    padding_pct   Extra space to add around the detected face (fraction of face height)

    Returns
    -------
    PNG bytes of the cropped image.
    """
    pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_np = np.array(pil_img)
    ih, iw = img_np.shape[:2]

    target_w, target_h = _parse_ratio(aspect_ratio)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    rgb  = img_np  # already RGB

    # ── Face detection ─────────────────────────────────────────────────────────
    bbox = _detect_face_mediapipe(rgb) or _detect_face_opencv(gray)

    if bbox:
        fx, fy, fw, fh = bbox
        cx = fx + fw / 2.0
        cy = fy + fh / 2.0
        x1, y1, x2, y2 = _expand_to_ratio(cx, cy, fh, target_w, target_h, iw, ih, padding_pct)
    else:
        # Centre-crop fallback
        if target_w / target_h >= iw / ih:
            crop_w = iw
            crop_h = int(iw * (target_h / target_w))
        else:
            crop_h = ih
            crop_w = int(ih * (target_w / target_h))
        x1 = (iw - crop_w) // 2
        y1 = (ih - crop_h) // 2
        x2 = x1 + crop_w
        y2 = y1 + crop_h

    cropped = pil_img.crop((x1, y1, x2, y2))

    # ── Final resize to standard sizes ────────────────────────────────────────
    # Upscale small crops to at least 600 px on the long edge for quality.
    max_dim = max(cropped.size)
    if max_dim < 600:
        scale  = 600 / max_dim
        new_sz = (int(cropped.size[0] * scale), int(cropped.size[1] * scale))
        cropped = cropped.resize(new_sz, Image.LANCZOS)

    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=92, optimize=True)
    return buf.getvalue()
