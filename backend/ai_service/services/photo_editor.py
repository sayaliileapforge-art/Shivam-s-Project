# -*- coding: utf-8 -*-
"""
AI Photo Studio v7.4 — FastAPI service port
============================================
Ported from v7.4.py (Colab notebook).
Phase 1 (face detect + rembg) is cached in memory (LRU, max 10 sessions).
Phase 2 (all retouching ops) runs on every render request.
"""

from __future__ import annotations
import cv2, numpy as np, io, hashlib, gc, time, warnings
from collections import OrderedDict
from typing import Optional, Dict, Any, Tuple

warnings.filterwarnings("ignore")

try:
    from PIL import Image
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_OK = True
except ImportError:
    INSIGHTFACE_OK = False

try:
    from rembg import remove as rembg_remove, new_session as rembg_session
    REMBG_OK = True
except ImportError:
    REMBG_OK = False

try:
    import mediapipe as mp
    _ = mp.solutions.face_mesh
    MEDIAPIPE_OK = True
except Exception:
    MEDIAPIPE_OK = False

try:
    from gfpgan import GFPGANer
    GFPGAN_OK = True
except ImportError:
    GFPGAN_OK = False

# ── Global singletons (lazy-loaded) ──────────────────────────────────────────
_app = None
_session_std = None
_session_hum = None
_face_mesh = None
_gfpgan_model = None

# Cached Haar cascade classifiers — loaded once, never re-created per image.
# Creating CascadeClassifier from XML on every call was costing ~50-100ms/image.
_haar_default: Optional[Any] = None
_haar_alt2:    Optional[Any] = None

def _get_haar(alt: bool = False) -> Any:
    global _haar_default, _haar_alt2
    if alt:
        if _haar_alt2 is None:
            p = cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml"
            _haar_alt2 = cv2.CascadeClassifier(p)
        return _haar_alt2
    else:
        if _haar_default is None:
            p = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            _haar_default = cv2.CascadeClassifier(p)
        return _haar_default

# ── Phase-1 LRU cache (max 50 entries) ───────────────────────────────────────
_p1_cache: OrderedDict = OrderedDict()
MAX_CACHE = 50

# ── Fast-path flag: set True once all sessions are initialised ───────────────
_sessions_ready: bool = False

GRADIENT_PRESETS = {
    "None": None,
    "🌫 Studio Grey": ("#9E9E9E", "#F5F5F5", "radial"),
    "🌊 Studio Blue": ("#1A237E", "#BBDEFB", "radial"),
    "🌿 Mint": ("#1B5E20", "#E8F5E9", "radial"),
    "🌸 Rose": ("#880E4F", "#FCE4EC", "radial"),
    "☀️ Warm Gold": ("#E65100", "#FFF9C4", "radial"),
    "🌙 Night": ("#0D1B2A", "#1B4F72", "vertical"),
    "🪵 Ivory": ("#5D4037", "#FFF8F0", "radial"),
}

OUTPUT_FORMATS = {
    "1024×1024 (Standard)": (1024, 1024),
    "Passport 35×45mm": (413, 531),
    "Visa 51×51mm": (602, 602),
    "US Passport 2×2in": (600, 600),
    "Web 800×800": (800, 800),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def hex_to_rgb(h: str) -> Tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def init_sessions():
    global _app, _session_std, _session_hum, _face_mesh, _sessions_ready
    if _sessions_ready:
        return  # already initialised — skip the 4 null-checks on every batch image
    if _app is None and INSIGHTFACE_OK:
        try:
            _app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
            _app.prepare(ctx_id=-1, det_size=(640, 640))
        except Exception as e:
            print(f"⚠ InsightFace init: {e}")
    if _session_std is None and REMBG_OK:
        try:
            _session_std = rembg_session("u2net")
        except Exception as e:
            print(f"⚠ rembg std session: {e}")
    if _session_hum is None and REMBG_OK:
        try:
            _session_hum = rembg_session("u2net_human_seg")
        except Exception as e:
            print(f"⚠ rembg hum session: {e}")
    if _face_mesh is None and MEDIAPIPE_OK:
        try:
            _face_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True, max_num_faces=1,
                refine_landmarks=True, min_detection_confidence=0.5)
        except Exception as e:
            print(f"⚠ MediaPipe init: {e}")
    _sessions_ready = True


def load_gfpgan() -> bool:
    global _gfpgan_model
    if not GFPGAN_OK or _gfpgan_model:
        return _gfpgan_model is not None
    try:
        _gfpgan_model = GFPGANer(
            model_path="https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth",
            upscale=1, arch="clean", channel_multiplier=2, bg_upsampler=None)
        return True
    except Exception as e:
        print(f"⚠ GFPGAN load: {e}")
        return False


# ── Face detection helpers ────────────────────────────────────────────────────

class DnnFace:
    def __init__(self, bbox):
        self.bbox = bbox
        x1, y1, x2, y2 = bbox
        fw, fh = x2 - x1, y2 - y1
        self.kps = np.array([
            [x1 + fw * 0.30, y1 + fh * 0.37],
            [x1 + fw * 0.70, y1 + fh * 0.37],
            [x1 + fw * 0.50, y1 + fh * 0.55],
            [x1 + fw * 0.35, y1 + fh * 0.75],
            [x1 + fw * 0.65, y1 + fh * 0.75],
        ], dtype=np.float32)


class HybridFace:
    def __init__(self, insightface_face, roi_x, roi_y):
        self.bbox = insightface_face.bbox.copy().astype(np.float32)
        self.bbox[0] += roi_x; self.bbox[2] += roi_x
        self.bbox[1] += roi_y; self.bbox[3] += roi_y
        self.kps = insightface_face.kps.copy().astype(np.float32)
        self.kps[:, 0] += roi_x
        self.kps[:, 1] += roi_y


def _detect_haar(img_bgr):
    """Haar cascade fallback. Tries progressively more lenient params + histogram eq."""
    gray    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    gray_eq = cv2.equalizeHist(gray)   # helps with low-contrast / backlit shots
    for gray_img in (gray, gray_eq):
        for alt in (False, True):
            try:
                cc = _get_haar(alt)
                # Relax minNeighbors (4 → 2) and minSize (60 → 40) progressively
                for min_n, min_sz in ((4, 60), (3, 50), (2, 40)):
                    faces = cc.detectMultiScale(gray_img, 1.1, min_n, minSize=(min_sz, min_sz))
                    if len(faces) > 0:
                        results = [
                            DnnFace([float(x), float(y), float(x + w), float(y + h)])
                            for (x, y, w, h) in faces
                        ]
                        results.sort(key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)
                        return results
            except Exception:
                continue
    return []


def _fallback_face(img_bgr):
    """
    Portrait-position fallback when all face detectors fail.
    Assumes a standard head-and-shoulders photo: face in the upper-centre region.
    Works well for angled / side-profile / low-quality student photos.
    """
    h, w = img_bgr.shape[:2]
    fw = int(w * 0.50)
    fh = int(min(fw * 1.20, h * 0.45))
    x1 = (w - fw) // 2
    y1 = int(h * 0.04)
    x2 = x1 + fw
    y2 = y1 + fh
    print(f"⚠ No face detected — using portrait-position fallback ({x1},{y1})→({x2},{y2})")
    return [DnnFace([float(x1), float(y1), float(x2), float(y2)])]


def get_faces(img_bgr):
    """
    Detect faces: InsightFace → Haar cascade (lenient) → portrait-position fallback.
    Always returns at least one face so processing never fails on detection alone.
    """
    if _app is not None:
        try:
            faces = _app.get(img_bgr)
            if faces:
                faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
                return faces
        except Exception as e:
            print(f"⚠ InsightFace: {e}")
    haar = _detect_haar(img_bgr)
    if haar:
        return haar
    return _fallback_face(img_bgr)


# ── Alpha matting helpers ─────────────────────────────────────────────────────

def clean_alpha(alpha, crop_bgr):
    """Clean rembg alpha: close holes, guided-filter edges, hard-threshold to remove artifacts."""
    a8 = (alpha * 255).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    a8 = cv2.morphologyEx(a8, cv2.MORPH_CLOSE, k, iterations=3)
    a8 = cv2.morphologyEx(a8, cv2.MORPH_OPEN,  k, iterations=1)
    guide = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.
    af = a8.astype(np.float32) / 255.
    r = 7
    mG  = cv2.boxFilter(guide,       -1, (r, r))
    mA  = cv2.boxFilter(af,          -1, (r, r))
    mGA = cv2.boxFilter(guide * af,  -1, (r, r))
    mGG = cv2.boxFilter(guide * guide, -1, (r, r))
    A = (mGA - mG * mA) / (mGG - mG * mG + 1e-3)
    B = mA - A * mG
    ag = np.clip(cv2.boxFilter(A, -1, (r, r)) * guide + cv2.boxFilter(B, -1, (r, r)), 0, 1)
    res = af.copy()
    res[(af > 0.05) & (af < 0.95)] = ag[(af > 0.05) & (af < 0.95)]
    # Stronger sigmoid: drive semi-transparent fringes to binary (removes artifact ghosting)
    edge_zone = (res > 0.08) & (res < 0.92)
    res[edge_zone] = np.clip((res[edge_zone] - 0.5) * 2.4 + 0.5, 0, 1)
    res[res < 0.08] = 0.0
    res[res > 0.92] = 1.0
    return np.clip(res, 0, 1).astype(np.float32)


def decontaminate_edges(img_rgb, alpha):
    if alpha is None or np.max(alpha) < 0.1:
        return img_rgb
    inner = cv2.erode((alpha > 0.9).astype(np.uint8), np.ones((5, 5)), iterations=2)
    if np.sum(inner) < 100:
        return img_rgb
    fill = np.full_like(img_rgb, cv2.mean(img_rgb, mask=inner)[:3])
    edge = (alpha > 0.05) & (alpha < 0.45)
    res = img_rgb.copy().astype(np.float32)
    res[edge] = img_rgb[edge] * alpha[edge][:, None] + fill[edge] * (1 - alpha[edge][:, None])
    return np.clip(res, 0, 255).astype(np.uint8)


def safe_position_anchor(alpha, headroom, SIZE=1024):
    """Compute (dy, dx) to place subject top at headroom% and center horizontally."""
    coords = np.where(alpha > 0.15)
    if coords[0].size == 0:
        return 0, 0
    top_detected   = int(np.min(coords[0]))
    left_detected  = int(np.min(coords[1]))
    right_detected = int(np.max(coords[1]))
    subject_cx = (left_detected + right_detected) // 2
    target_top = int(SIZE * headroom)
    target_cx  = SIZE // 2
    ady = target_top - top_detected
    adx = target_cx - subject_cx
    max_up = -(target_top // 2)
    if ady < max_up:
        ady = max_up
    return int(ady), int(adx)


def _build_crop_M(ec, ang, cs, face_bbox_y1, padding):
    """
    Build affine crop matrix.
    Eyes at 38% from top — leaves ~15% headroom above the head for ID photos.
    Subject centered horizontally.
    """
    M = cv2.getRotationMatrix2D(ec, ang, 1.0)
    M[0, 2] += cs / 2.0 - ec[0]   # center horizontally
    M[1, 2] += cs * 0.38 - ec[1]  # eyes at 38% from top (head fully visible)
    return M


def _validate_crop(crop_bgr, min_content_ratio=0.30, face_bbox=None, crop_center=None):
    """
    Validate that crop contains sufficient non-white content AND has subject centered.
    
    Args:
        crop_bgr: The cropped image
        min_content_ratio: Minimum non-white pixel ratio (default 0.30)
        face_bbox: Optional (x1, y1, x2, y2) in CROP coordinates for centering check
        crop_center: Optional (cx, cy) - expected center of subject in crop
    
    Returns True if crop is valid (good content ratio AND subject reasonably centered)
    """
    if crop_bgr is None or crop_bgr.shape[0] < 100 or crop_bgr.shape[1] < 100:
        return False
    
    h, w = crop_bgr.shape[:2]
    cs = max(h, w)
    
    # Check for excessive white fill (all channels ≥ 240)
    white_mask = (crop_bgr[:,:,0] >= 240) & (crop_bgr[:,:,1] >= 240) & (crop_bgr[:,:,2] >= 240)
    white_ratio = np.sum(white_mask) / (h * w)
    
    # If >70% is white, it's a failed crop
    if white_ratio > 0.70:
        print(f"⚠ Crop validation: {white_ratio*100:.1f}% white fill — INVALID")
        return False
    
    # Check for minimum colored content
    colored_pixels = 1 - white_ratio
    if colored_pixels < min_content_ratio:
        print(f"⚠ Crop validation: only {colored_pixels*100:.1f}% non-white content — INVALID")
        return False
    
    # Check that colored content is not concentrated on one edge (off-center subject)
    colored_mask = ~white_mask
    col_sum = np.sum(colored_mask, axis=0)  # Sum across rows for each column
    row_sum = np.sum(colored_mask, axis=1)  # Sum across cols for each row
    
    # Find where the main content concentration is
    cs_w = crop_bgr.shape[1]  # Width
    cs_h = crop_bgr.shape[0]  # Height
    third_w = cs_w // 3
    third_h = cs_h // 3
    
    # Check horizontal distribution - content shouldn't be only in first or last third
    left_third = np.sum(col_sum[:third_w])
    right_third = np.sum(col_sum[-third_w:])
    center_third = np.sum(col_sum[third_w:2*third_w])
    total_h = np.sum(col_sum)
    
    if total_h > 100:  # Only check if there's substantial content
        left_ratio = left_third / total_h if total_h > 0 else 0
        right_ratio = right_third / total_h if total_h > 0 else 0
        center_ratio = center_third / total_h if total_h > 0 else 0
        
        # Content should be somewhat distributed - not all on one side
        if (left_ratio > 0.65 or right_ratio > 0.65) and center_ratio < 0.15:
            print(f"⚠ Crop validation: subject off-center horizontally (L={left_ratio:.1%}, C={center_ratio:.1%}, R={right_ratio:.1%}) — INVALID")
            return False
    
    # Check vertical distribution - content shouldn't be only at top or bottom
    top_third = np.sum(row_sum[:third_h])
    bottom_third = np.sum(row_sum[-third_h:])
    middle_third = np.sum(row_sum[third_h:2*third_h])
    total_v = np.sum(row_sum)
    
    if total_v > 100:
        top_ratio = top_third / total_v if total_v > 0 else 0
        bottom_ratio = bottom_third / total_v if total_v > 0 else 0
        middle_ratio = middle_third / total_v if total_v > 0 else 0
        
        # Content should be reasonably distributed vertically
        if (top_ratio > 0.70 or bottom_ratio > 0.50):
            print(f"⚠ Crop validation: subject off-center vertically (T={top_ratio:.1%}, M={middle_ratio:.1%}, B={bottom_ratio:.1%}) — INVALID")
            return False
    
    return True


def _clamp_crop_bounds(img_bgr, M, cs):
    """
    Ensure crop stays within reasonable bounds to avoid excessive white fill.
    
    Strategy: Apply minimal clamping to prevent completely out-of-bounds crops,
    while preserving the rotation-aware centering computed by _build_crop_M.
    
    For affine transforms, overly aggressive clamping breaks subject centering
    and causes half-face crops. Instead, we only prevent extreme cases where
    the entire crop would be outside the image.
    """
    h, w = img_bgr.shape[:2]
    
    # Minimal safety bounds: ensure at least 20% of crop is inside image
    # This prevents completely empty crops while preserving centering
    min_overlap = cs * 0.20
    
    M_adj = M.copy().astype(np.float32)
    
    # Clamp translation to ensure minimal overlap
    # Allow generous margins to preserve centering from _build_crop_M
    M_adj[0, 2] = np.clip(M_adj[0, 2], -cs + min_overlap, w - min_overlap)
    M_adj[1, 2] = np.clip(M_adj[1, 2], -cs + min_overlap, h - min_overlap)
    
    return M_adj


def _extract_crop_simple(img_bgr, face, cs, padding, headroom):
    """
    Simple and direct approach to extract a square crop centered on face.
    
    This approach:
    1. Calculates face center from eye landmarks
    2. Positions crop to keep face centered, clamping to image bounds
    3. Pads with white if crop extends beyond image bounds
    4. Returns the cropped image
    
    This is more reliable than complex affine transformations.
    """
    h, w = img_bgr.shape[:2]
    
    # Get face center from bounding box (more reliable than eye landmarks for centering)
    fx1, fy1, fx2, fy2 = face.bbox
    face_cx = (fx1 + fx2) / 2
    face_cy = (fy1 + fy2) / 2
    
    # Use the provided crop size directly (already calculated as max(bw,bh)*padding)
    crop_size = cs
    
    # Position crop centered on face with headroom
    # 0.45 means face is positioned at 45% from top (leaving space above head)
    crop_top = int(face_cy - crop_size * 0.45)
    crop_left = int(face_cx - crop_size / 2)
    
    # **CRITICAL FIX**: Clamp crop position to keep face centered within image bounds
    # Instead of just clamping the edges, we need to ensure the face stays centered
    # Adjust crop position to maximize visibility while staying in bounds
    if crop_left < 0:
        crop_left = 0
    if crop_left + crop_size > w:
        crop_left = max(0, w - crop_size)
    
    if crop_top < 0:
        crop_top = 0
    if crop_top + crop_size > h:
        crop_top = max(0, h - crop_size)
    
    # Create output canvas with white background
    canvas = np.full((crop_size, crop_size, 3), 255, dtype=np.uint8)
    
    # Define the region from source image that we can actually use
    src_top = crop_top
    src_left = crop_left
    src_bottom = min(h, crop_top + crop_size)
    src_right = min(w, crop_left + crop_size)
    
    # Define where this region maps to in the canvas
    canvas_top = max(0, -crop_top)  # Padding at top if crop_top was negative
    canvas_left = max(0, -crop_left)  # Padding at left if crop_left was negative
    
    src_height = src_bottom - src_top
    src_width = src_right - src_left
    
    # Copy image region to canvas
    if src_height > 0 and src_width > 0:
        canvas[canvas_top:canvas_top + src_height, canvas_left:canvas_left + src_width] = \
            img_bgr[src_top:src_bottom, src_left:src_right]
    
    return canvas


# ── rembg wrapper (3-tier fallback) ──────────────────────────────────────────

def _safe_rembg(rgb_arr, session):
    """3-tier alpha matting fallback."""
    for kwargs in [
        dict(alpha_matting=True, alpha_matting_foreground_threshold=240,
             alpha_matting_background_threshold=10, alpha_matting_erode_size=3),
        dict(alpha_matting=True, alpha_matting_foreground_threshold=220,
             alpha_matting_background_threshold=30, alpha_matting_erode_size=15),
        dict(alpha_matting=False),
    ]:
        try:
            return rembg_remove(rgb_arr, session=session, **kwargs)
        except Exception:
            continue
    raise RuntimeError("All rembg tiers failed")


def _grabcut_alpha(crop_bgr: np.ndarray) -> np.ndarray:
    """
    OpenCV GrabCut fallback when rembg is unavailable.
    Assumes the subject (person) occupies the central ~80 % of the crop.
    Returns a float32 alpha mask in [0, 1].
    """
    h, w = crop_bgr.shape[:2]
    # Work at a capped resolution so GrabCut stays fast (≤512px)
    scale = min(1.0, 512.0 / max(h, w))
    ww, wh = max(1, int(w * scale)), max(1, int(h * scale))
    small = cv2.resize(crop_bgr, (ww, wh), cv2.INTER_AREA)

    # GrabCut rect: subject expected in the central region after face-crop
    mx, my = int(ww * 0.08), int(wh * 0.05)
    rect = (mx, my, ww - 2 * mx, wh - 2 * my)

    mask_gc = np.zeros((wh, ww), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(small, mask_gc, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    except Exception:
        pass

    # GC_FGD=1, GC_PR_FGD=3 are foreground
    fg = np.where((mask_gc == cv2.GC_FGD) | (mask_gc == cv2.GC_PR_FGD),
                  1.0, 0.0).astype(np.float32)

    # Soften edges
    fg = cv2.GaussianBlur(fg, (7, 7), 2)

    # Scale back to original crop size
    alpha = cv2.resize(fg, (w, h), cv2.INTER_LINEAR)
    return np.clip(alpha, 0.0, 1.0).astype(np.float32)


def _run_rembg(crop_bgr):
    """Run rembg on crop, returns (fg_rgb, alpha_float)."""
    if not REMBG_OK or _session_std is None:
        # Fallback: GrabCut-based segmentation (much better than corner-threshold)
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        alpha = _grabcut_alpha(crop_bgr)
        return rgb, alpha

    rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    rgba = _safe_rembg(rgb, _session_std)
    alpha = rgba[:, :, 3].astype(np.float32) / 255.
    # If foreground dominates (plain background), try human-seg session
    if np.mean(alpha) > 0.88 and _session_hum is not None:
        rgba = _safe_rembg(rgb, _session_hum)
        alpha = rgba[:, :, 3].astype(np.float32) / 255.
    return rgba[:, :, :3], alpha


# ── Skin detection ────────────────────────────────────────────────────────────

def landmark_skin_mask(img, landmarks):
    h, w = img.shape[:2]
    mask = np.zeros((h, w), dtype=np.float32)
    if landmarks is None:
        return mask
    oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,
            400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
    l_eye = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7]
    r_eye = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382]
    mouth = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]

    def pts(idx):
        p = [[int(landmarks.landmark[i].x * w), int(landmarks.landmark[i].y * h)]
             for i in idx if i < len(landmarks.landmark)]
        return np.array(p) if len(p) > 3 else None

    fp = pts(oval)
    if fp is not None:
        cv2.fillPoly(mask, [fp], 1.)
        for e in [l_eye, r_eye]:
            ep = pts(e)
            if ep is not None:
                cv2.fillPoly(mask, [ep], 0)
        mp2 = pts(mouth)
        if mp2 is not None:
            cv2.fillPoly(mask, [mp2], 0)
    return cv2.GaussianBlur(mask, (21, 21), 5)


def detect_skin_pixels(img, landmarks=None):
    ycc = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb); _, Cr, Cb = cv2.split(ycc)
    s = ((Cr >= 130) & (Cr <= 178) & (Cb >= 74) & (Cb <= 130)).astype(np.float32)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV); H, S, V = cv2.split(hsv)
    s *= (((H < 25) | (H > 155)) & (S > 10) & (V > 30)).astype(np.float32)
    if landmarks is not None:
        s = s * (landmark_skin_mask(img, landmarks) > 0.25).astype(np.float32)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    s = cv2.morphologyEx(s, cv2.MORPH_OPEN, k, iterations=1)
    s = cv2.morphologyEx(s, cv2.MORPH_CLOSE, k, iterations=2)
    if np.sum(s > 0.3) < 500 and landmarks is not None:
        s = landmark_skin_mask(img, landmarks)
    return cv2.GaussianBlur(s, (15, 15), 4)


# ── SkinFiner retouching ──────────────────────────────────────────────────────

def skinfiner_retouch(img, skin_mask, smooth=0.6, texture=1.0):
    """Frequency-separation skin retouching.
    Smooths low-frequency skin tones while preserving high-frequency texture details.
    smooth capped at 0.45 to prevent plastic/artificial look.
    Blur sigma reduced from 8 → 4 to preserve more skin detail.
    """
    # Hard cap to prevent over-processing. Slider values above 0.45 still look natural.
    smooth = min(float(smooth), 0.45)
    if smooth < 0.01:
        return img
    f = img.astype(np.float32)
    # Frequency separation: low-freq (base) and high-freq (texture/detail)
    low = cv2.GaussianBlur(f, (0, 0), 4)   # was sigma=8, reduced to preserve detail
    high = f - low
    lab = cv2.cvtColor(np.clip(low, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    l, a, b = cv2.split(lab)
    # Edge-aware blend weight: smooth only flat skin areas, preserve edges
    gx = cv2.Sobel(l, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(l, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(gx**2 + gy**2)
    flat = np.clip(1 - grad_mag / (grad_mag.max() + 1e-6), 0, 1)
    flat = cv2.GaussianBlur(flat, (11, 11), 3)
    bw = skin_mask * flat * smooth
    # Blend L channel: multi-scale smooth for natural look
    l_out = l * (1 - bw) + (
        cv2.GaussianBlur(l, (0, 0), 2) * 0.55 +
        cv2.GaussianBlur(l, (0, 0), 4) * 0.30 +
        cv2.GaussianBlur(l, (0, 0), 8) * 0.15
    ) * bw
    # Very mild colour channel smoothing (reduced from 0.4 → 0.25 to preserve skin tone)
    cw = skin_mask * smooth * 0.25
    a_out = a * (1 - cw) + cv2.GaussianBlur(a, (0, 0), 6) * cw
    b_out = b * (1 - cw) + cv2.GaussianBlur(b, (0, 0), 6) * cw
    sm = cv2.cvtColor(cv2.merge([
        np.clip(l_out, 0, 255).astype(np.uint8),
        np.clip(a_out, 0, 255).astype(np.uint8),
        np.clip(b_out, 0, 255).astype(np.uint8)
    ]), cv2.COLOR_LAB2BGR).astype(np.float32)
    blend = np.stack([skin_mask] * 3, axis=2)
    # Always add back the HIGH-FREQUENCY texture layer at full strength (texture=1.0)
    # This ensures pores, micro-details, and natural skin grain are preserved.
    return np.clip((low * (1 - blend) + sm * blend) + high * texture, 0, 255).astype(np.uint8)


# ── Nuclear pop (contrast pop) ────────────────────────────────────────────────

def nuclear_pop(img, it=2):
    """Subtle contrast/presence boost. Coefficient reduced from 0.15 → 0.07
    to prevent midtone brightening and color washout."""
    if it <= 0:
        return img
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    l, a, b = cv2.split(lab)
    l /= 255.
    for _ in range(int(it)):
        l = l + 0.07 * l * (1 - l)  # was 0.15 — halved to prevent color washout
    l = np.clip(l * 255, 0, 255).astype(np.uint8)
    return cv2.cvtColor(cv2.merge([l, a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)


# ── Background & canvas ───────────────────────────────────────────────────────

def make_gradient_bg(size: int, name: str):
    p = GRADIENT_PRESETS.get(name)
    if p is None:
        return None
    c1, c2, d = p
    r1, g1, b1 = hex_to_rgb(c1); r2, g2, b2 = hex_to_rgb(c2)
    if d == "radial":
        y, x = np.ogrid[:size, :size]
        t = np.clip(np.sqrt((x - size/2)**2 + (y - size * .4)**2) / (size * .7), 0, 1)
    elif d == "vertical":
        t = np.tile(np.linspace(0, 1, size).reshape(-1, 1), (1, size))
    else:
        y, x = np.ogrid[:size, :size]
        t = np.clip((x + y) / (2 * size), 0, 1)
    c = np.zeros((size, size, 3), dtype=np.float32)
    c[:, :, 2] = r1 * (1 - t) + r2 * t
    c[:, :, 1] = g1 * (1 - t) + g2 * t
    c[:, :, 0] = b1 * (1 - t) + b2 * t
    return np.clip(c, 0, 255).astype(np.uint8)


def create_canvas(size, bg_color, glow=40, custom_bg=None, texture=0):
    rgb = hex_to_rgb(bg_color)
    canvas = np.full((size, size, 3), rgb, dtype=np.float32)
    if custom_bg is not None:
        bg_r = cv2.resize(custom_bg, (size, size)).astype(np.float32)
        canvas = bg_r
    if texture > 0:
        canvas = np.clip(canvas + np.random.normal(0, texture, (size, size, 1)), 0, 255)
    if glow > 0:
        # Changed: edge-only darkening vignette instead of center-brightening.
        # The old formula added WHITE to the CENTER (where the subject is), causing
        # glow to bleed into subject edges. New formula darkens only the outer 35%
        # of the image, leaving the central subject area completely unaffected.
        y, x = np.ogrid[:size, :size]
        dist = np.sqrt((x - size // 2)**2 + (y - int(size * .4))**2)
        # Only affect pixels beyond 65% of the image radius (edge corners)
        edge_start = size * 0.65
        edge_vig = np.clip((dist - edge_start) / (size * 0.35), 0, 1) ** 2
        darken = edge_vig * (glow / 200.0)  # very subtle max ~50% darkening at corners
        for i in range(3):
            canvas[:, :, i] = np.clip(canvas[:, :, i] * (1.0 - darken), 0, 255)
    return canvas


def composite_shadow(canvas, fg_rgb, alpha, shadow_color, softness, distance):
    # Clamp blur kernel to prevent massive halos (was unbounded; 51*2+1=103px on 1024px image).
    # Hard-cap at 41px kernel which gives a natural soft drop shadow.
    blur = min(max(1, int(softness) * 2 + 1), 41) | 1
    sigma = max(1.0, softness / 3.0)
    # Shadow strength reduced from 0.45 → 0.15 to eliminate the dark circular halo.
    shadow_raw = cv2.GaussianBlur(alpha, (blur, blur), sigma) * 0.15
    sh_v = np.zeros_like(shadow_raw)
    d = max(1, int(distance))
    # Offset shadow so it only appears BEHIND the subject (not centered on it).
    if d < alpha.shape[0] and d < alpha.shape[1]:
        sh_v[d:, d:] = shadow_raw[:-d, :-d]
    # Critical: apply shadow ONLY to background regions (where alpha is low).
    # This prevents the shadow from darkening subject edges and creating halos.
    bg_region = np.clip(1.0 - alpha, 0.0, 1.0)
    sh_v = sh_v * bg_region
    sh_rgb = hex_to_rgb(shadow_color)
    result = np.zeros_like(canvas)
    for i in range(3):
        bg = canvas[:, :, i] * (1 - sh_v) + sh_rgb[i] * sh_v
        result[:, :, i] = fg_rgb[:, :, i] * alpha + bg * (1 - alpha)
    return np.clip(result, 0, 255).astype(np.uint8)


def add_watermark(canvas, text, space=180, angle=30, opacity=0.15):
    if not text:
        return canvas
    wm = np.zeros((2000, 2000, 3), dtype=np.uint8)
    font = cv2.FONT_HERSHEY_DUPLEX
    tw = cv2.getTextSize(text, font, 1., 2)[0][0]
    sx = tw + 160
    for row, y in enumerate(range(0, 2000, space)):
        off = (sx // 2) if row % 2 == 0 else 0
        for x in range(0, 2000, sx):
            cv2.putText(wm, text, (x + off, y), font, 1., (255, 255, 255), 2, cv2.LINE_AA)
    rot = cv2.warpAffine(wm, cv2.getRotationMatrix2D((1000, 1000), angle, 1.), (2000, 2000))[488:1512, 488:1512]
    msk = (cv2.cvtColor(rot, cv2.COLOR_BGR2GRAY) > 0).astype(np.float32) * opacity
    out = canvas.copy()
    for i in range(3):
        out[:, :, i] = canvas[:, :, i] * (1 - msk) + rot[:, :, i] * msk
    return out


# ── Quality presets ──────────────────────────────────────────────────────────

QUALITY_PRESETS = {
    # Minimal processing. Closest to DSLR natural output. Recommended default.
    "Natural": dict(enhance=3.0, exposure=0.0, colorTemp=0.0, sharpness=4.0, skin=2.5,
                    colorGrade="natural", glow=8, shadowSoft=12, shadowDist=6),
    # Moderate studio retouching for professional headshots.
    "Studio":  dict(enhance=5.5, exposure=0.0, colorTemp=0.0, sharpness=5.5, skin=4.5,
                    colorGrade="natural", glow=18, shadowSoft=20, shadowDist=10),
    # Gentle smoothing. Good for soft portraits.
    "Soft":    dict(enhance=4.0, exposure=0.2, colorTemp=0.5, sharpness=3.0, skin=5.5,
                    colorGrade="soft",    glow=12, shadowSoft=15, shadowDist=8),
    # Clean clinical look. For government / official ID documents.
    "Passport": dict(enhance=2.5, exposure=0.0, colorTemp=0.0, sharpness=5.0, skin=1.5,
                     colorGrade="natural", glow=0,  shadowSoft=0,  shadowDist=0),
    # Strict flat-white background, minimal retouching.
    "ID Card":  dict(enhance=2.0, exposure=0.0, colorTemp=0.0, sharpness=4.5, skin=1.0,
                     colorGrade="natural", glow=0,  shadowSoft=0,  shadowDist=0),
}


# ── compute_settings: slider values → full params dict ───────────────────────

def compute_settings(enhance, exposure, color_temp_lv, sharpness_lv, skin_lv,
                     color_grade, crop_mode, padding, headroom,
                     sh_soft, sh_dist, glow, gradient,
                     balance_skin, decontaminate, gfpgan_enable, quality,
                     bg_color="#FFFFFF", shadow_color="#222222", watermark=""):
    e = np.clip(enhance, 0, 10) / 10.
    ex = np.clip(exposure, -5, +5)
    ct = np.clip(color_temp_lv, -5, +5) * 12
    d = np.clip(sharpness_lv, 0, 10) / 10.
    sk = np.clip(skin_lv, 0, 10) / 10.
    brightness = round(float(ex * 8.), 1)
    contrast   = round(float(ex * abs(ex) * 0.9), 1)
    gamma      = round(float(1. - ex * 0.035), 3)
    return dict(
        # Multipliers reduced to prevent compound over-processing:
        # tone_harmony: 0.45 → 0.25, dodge_burn: 0.35 → 0.18, vibrance: 0.36 → 0.20
        tone_harmony=round(e * .25, 3), dodge_burn=round(e * .18, 3),
        clarity=round(e * .35, 3), vibrance=round(e * .20, 3),
        # pop: multiplier 3 → 1.5 (less midtone brightening)
        pop=int(round(e * 1.5)),
        brightness=int(round(brightness)), contrast=int(round(contrast)), gamma=gamma,
        color_temp=int(round(ct)), color_grade=color_grade, auto_wb=False,
        eye_enhance=round(d * .55, 3), eye_sharp=round(.3 + d * 2.5, 3),
        lip_sharp=round(.2 + d * 1.4, 3), sharpness=round(1. + d * .35, 3),
        catchlight=round(d * .45, 3),
        # Skin multipliers reduced: smooth: 0.78 → 0.50, blemish: 0.62 → 0.40
        # glare: 0.48 → 0.28, dark_circles: 0.48 → 0.28, denoise: 0.30 → 0.18
        smooth_skin=round(sk * .50, 3), texture_str=round(1. - sk * .06, 3),
        blemish=round(sk * .40, 3), glare=round(sk * .28, 3),
        dark_circles=round(sk * .28, 3), denoise=round(sk * .18, 3), teeth=round(sk * .22, 3),
        balance_skin=balance_skin, skin_target=135, decontaminate=decontaminate,
        mode=crop_mode, padding=padding, headroom=headroom,
        shadow_soft=sh_soft, shadow_dist=sh_dist, glow=glow,
        gfpgan_enable=gfpgan_enable, gfpgan_strength=.7, quality=quality,
        bg_color=bg_color, shadow_color=shadow_color, gradient=gradient, watermark=watermark,
    )


# ── apply_all_ops (Phase 2 image processing) ─────────────────────────────────

def apply_all_ops(img, skin, landmarks, s):
    """Apply all color / retouching operations. Ported from v7.4."""
    # Color temperature
    ct = s.get("color_temp", 0)
    if ct != 0:
        t = ct / 100.; r = img.astype(np.float32)
        r[:, :, 2] += t * 28; r[:, :, 1] += t * 8; r[:, :, 0] -= t * 20
        img = np.clip(r, 0, 255).astype(np.uint8)

    # Blemish removal
    bl = s.get("blemish", 0)
    if bl > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        blem = np.clip(
            (cv2.GaussianBlur(l, (0, 0), 15) - l) / (cv2.GaussianBlur(l, (0, 0), 15) + 1e-6) * .6 +
            np.clip((a - cv2.GaussianBlur(a, (0, 0), 15)) / 20., 0, 1) * .4,
            0, 1) * skin
        thresh = 0.28 + (1 - bl) * 0.30
        mu8 = ((blem > thresh) * 255).astype(np.uint8)
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mu8 = cv2.morphologyEx(mu8, cv2.MORPH_OPEN, k)
        mu8 = cv2.dilate(mu8, k, iterations=2)
        if mu8.max() > 0:
            img = cv2.inpaint(img, mu8, 4, cv2.INPAINT_TELEA)

    # SkinFiner
    img = skinfiner_retouch(img, skin, s.get("smooth_skin", 0), s.get("texture_str", 1.))

    # Dodge & burn
    db = s.get("dodge_burn", 0)
    if db > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        l = np.clip(l - (l - cv2.GaussianBlur(l, (0, 0), 40)) * skin * db, 0, 255)
        img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Tone harmony
    th = s.get("tone_harmony", 0)
    if th > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        px = skin > 0.5
        if px.sum() > 100:
            ta, tb = np.median(a[px]), np.median(b[px])
            a = np.clip(a + (ta - cv2.GaussianBlur(a, (0, 0), 30)) * skin * th, 0, 255)
            b = np.clip(b + (tb - cv2.GaussianBlur(b, (0, 0), 30)) * skin * th, 0, 255)
            img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Glare reduction
    gr = s.get("glare", 0)
    if gr > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        gm = ((l > 215).astype(np.float32)) * skin
        gm = cv2.GaussianBlur(gm, (21, 21), 7)
        l = l * (1 - gm) + np.where(l > 200, 200 + (l - 200) * (1 - gr * .45), l) * gm
        img = cv2.cvtColor(cv2.merge([np.clip(l, 0, 255).astype(np.uint8),
                                      a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Teeth whitening
    te = s.get("teeth", 0)
    if te > 0 and landmarks:
        MOUTH = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]
        h, w = img.shape[:2]
        pts = [[int(landmarks.landmark[i].x * w), int(landmarks.landmark[i].y * h)]
               for i in MOUTH if i < len(landmarks.landmark)]
        if len(pts) >= 4:
            pts = np.array(pts); msk = np.zeros((h, w), dtype=np.float32)
            cv2.fillPoly(msk, [pts], 1.)
            msk[int(np.mean(pts[:, 1])):, :] *= 0.15
            msk = cv2.GaussianBlur(msk, (11, 11), 3)
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
            l, a, b = cv2.split(lab)
            l = np.clip(l + msk * te * 35, 0, 255)
            a = np.clip(a - msk * te * 8, 0, 255)
            b = np.clip(b - msk * te * 12, 0, 255)
            img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Dark circle removal
    dc = s.get("dark_circles", 0)
    if dc > 0 and landmarks:
        h, w = img.shape[:2]; res2 = img.copy()
        for eye_idx in [[33,7,163,144,145,153,154,155,133], [362,249,390,373,374,380,381,382,263]]:
            xs = [int(landmarks.landmark[i].x * w) for i in eye_idx if i < len(landmarks.landmark)]
            ys = [int(landmarks.landmark[i].y * h) for i in eye_idx if i < len(landmarks.landmark)]
            if len(xs) < 4: continue
            yc = int(np.mean(ys)); x1, x2 = max(0, min(xs) - 4), min(w, max(xs) + 4)
            y1, y2 = yc, min(h, yc + int((max(ys) - min(ys)) * 1.4))
            roi = res2[y1:y2, x1:x2]
            if roi.size == 0: continue
            lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB).astype(np.float32)
            lc, a, b = cv2.split(lab)
            lc = np.clip(lc + dc * 18, 0, 255); b = np.clip(b - dc * 6, 0, 255); a = np.clip(a - dc * 4, 0, 255)
            enh = cv2.cvtColor(cv2.merge([lc.astype(np.uint8), a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)
            cx2, cy2 = (x2 - x1) // 2, (y2 - y1) // 2
            msk = np.zeros((y2 - y1, x2 - x1), dtype=np.float32)
            cv2.ellipse(msk, (cx2, cy2), (max(1, cx2 - 1), max(1, cy2 - 1)), 0, 0, 180, 1, -1)
            msk = cv2.GaussianBlur(msk, (11, 11), 4) * dc; m3 = np.stack([msk] * 3, axis=2)
            res2[y1:y2, x1:x2] = (roi * (1 - m3) + enh * m3).astype(np.uint8)
        img = res2

    # Global sharpness (guided USM)
    sharp = s.get("sharpness", 1.)
    if abs(sharp - 1.) > 0.01:
        guide = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.; r = 4
        for c in range(3):
            ch = img[:, :, c].astype(np.float32) / 255.
            mI = cv2.boxFilter(guide, -1, (r, r)); mp_ = cv2.boxFilter(ch, -1, (r, r))
            mIp = cv2.boxFilter(guide * ch, -1, (r, r)); mII = cv2.boxFilter(guide * guide, -1, (r, r))
            A = (mIp - mI * mp_) / (mII - mI * mI + .01); B = mp_ - A * mI
            sm = np.clip(cv2.boxFilter(A, -1, (r, r)) * guide + cv2.boxFilter(B, -1, (r, r)), 0, 1)
            img[:, :, c] = np.clip((ch * sharp - sm * (sharp - 1)) * 255, 0, 255).astype(np.uint8)

    # Clarity
    cl2 = s.get("clarity", 0)
    if cl2 > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        blur = cv2.GaussianBlur(l, (0, 0), 20)
        mid = 1 - (2 * (l / 255.) - 1)**2
        l = np.clip(l + (l - blur) * cl2 * mid, 0, 255)
        img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Vibrance
    vb = s.get("vibrance", 0)
    if vb > 0:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        h2, sv, v = cv2.split(hsv)
        boost = vb * (1 - sv / 255.) * .6 * (1 - ((h2 < 25) | (h2 > 155)).astype(np.float32) * .35)
        img = cv2.cvtColor(cv2.merge([h2.astype(np.uint8),
                                      np.clip(sv + boost * 255, 0, 255).astype(np.uint8),
                                      v.astype(np.uint8)]), cv2.COLOR_HSV2BGR)

    # Colour grade
    fm = {"warm_natural": "warm", "cool": "soft", "bright": "vivid", "muted": "soft"}
    grade = fm.get(s.get("color_grade", "natural"), s.get("color_grade", "natural"))
    if grade in ["natural", "vivid", "soft", "warm"]:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        if grade == "natural":
            l = np.where(l < 30, l + (30 - l) * .3, l); b = np.where(l > 200, b - 5, b)
        elif grade == "vivid": l = np.clip(l * 1.2 - 10, 0, 255)
        elif grade == "soft":  l = l * .95 + 10
        elif grade == "warm":  a += 5; b -= 5
        img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8), b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Exposure (brightness + contrast + gamma)
    br = s.get("brightness", 0); co = s.get("contrast", 0); ga = s.get("gamma", 1.)
    if co != 0 or br != 0:
        img = cv2.convertScaleAbs(img, alpha=1 + co / 100., beta=br)
    if abs(ga - 1.) > .01:
        t = np.array([((i / 255.) ** (1. / ga)) * 255 for i in range(256)]).astype(np.uint8)
        img = cv2.LUT(img, t)

    # Adaptive denoise
    dn = s.get("denoise", 0)
    if dn > 0:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        lmed = cv2.GaussianBlur(gray, (0, 0), 30)
        nm = np.clip((lmed - gray) / (lmed + 1e-6), 0, 1) * np.clip(1 - skin, 0, 1)
        hp = int(5 + dn * 10)
        den = cv2.fastNlMeansDenoisingColored(img, None, hp, hp, 7, 21)
        m3 = np.stack([nm * dn] * 3, axis=2)
        img = np.clip(img.astype(np.float32) * (1 - m3) + den.astype(np.float32) * m3, 0, 255).astype(np.uint8)

    return img


# ── Phase 1: face detection + background removal (slow, cached) ──────────────

def _p1_cache_key(img_bytes: bytes, mode: str, padding: float, headroom: float, gfpgan: bool) -> str:
    h = hashlib.md5(img_bytes).hexdigest()[:16]
    return f"{h}_{mode}_{round(padding, 1)}_{round(headroom, 2)}_{int(gfpgan)}"


def run_phase1(img_bytes: bytes, settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run Phase 1: face detection + background removal.
    Returns a cache dict or raises ValueError if no face found.
    """
    SIZE = 1024
    init_sessions()

    # Decode
    arr = np.frombuffer(img_bytes, np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Cannot decode image")

    work = img_bgr.copy()
    h, w = work.shape[:2]
    if max(h, w) > 1600:
        s = 1600 / max(h, w)
        work = cv2.resize(work, (int(w * s), int(h * s)), cv2.INTER_AREA)

    # MediaPipe landmarks
    landmarks = None
    if MEDIAPIPE_OK and _face_mesh:
        try:
            res = _face_mesh.process(cv2.cvtColor(work, cv2.COLOR_BGR2RGB))
            if res.multi_face_landmarks:
                landmarks = res.multi_face_landmarks[0]
        except Exception:
            pass

    # Face detection (always returns ≥1 face — falls back to portrait-position guess)
    faces = get_faces(work)
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    mode = settings.get("mode", "manual")
    padding = float(settings.get("padding", 4.5))
    headroom = float(settings.get("headroom", 0.20))

    # Crop sizing: map UI padding (1-9) to a tight head+shoulders multiplier (2.0-3.2x face)
    bw = face.bbox[2] - face.bbox[0]
    bh = face.bbox[3] - face.bbox[1]
    face_size = max(bw, bh)
    padding = float(settings.get("padding", 4.5))
    crop_mult = 2.0 + (min(padding, 9.0) / 9.0) * 1.2   # 2.0 at min, 3.2 at max
    cs = int(face_size * crop_mult)
    cs = min(cs, int(min(work.shape[1], work.shape[0]) * 0.92))
    cs = max(cs, int(face_size * 1.8))

    el, er = face.kps[0], face.kps[1]
    ec  = ((el[0] + er[0]) / 2.0, (el[1] + er[1]) / 2.0)
    ang = np.degrees(np.arctan2(er[1] - el[1], er[0] - el[0]))
    print(f"[PHASE1] {work.shape[1]}x{work.shape[0]} face={face_size:.0f}px crop={cs}x{cs} ang={ang:.1f}")
    M = _build_crop_M(ec, ang, cs, face.bbox[1], padding)
    M = np.float32(M)

    # Apply the affine crop
    crop = cv2.warpAffine(work, M, (cs, cs), borderValue=(255, 255, 255))
    fg_rgb, alp = _run_rembg(crop)
    alp_rs = cv2.resize(alp, (SIZE, SIZE), cv2.INTER_AREA)
    crop_rs = cv2.resize(crop, (SIZE, SIZE), cv2.INTER_LANCZOS4)
    alp_ps = clean_alpha(alp_rs, crop_rs)
    ady, adx = safe_position_anchor(alp_ps, headroom, SIZE)
    alpha_f = cv2.warpAffine(alp_ps, np.float32([[1, 0, adx], [0, 1, ady]]), (SIZE, SIZE), borderValue=0)

    # Face metrics
    x1, y1, x2, y2 = [int(v) for v in face.bbox]
    gray_w = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    patch = gray_w[max(0, y1):min(work.shape[0], y2), max(0, x1):min(work.shape[1], x2)]
    bright = int(patch.mean()) if patch.size > 0 else 0
    mid_x = (x1 + x2) // 2
    try:
        sym = 100 - min(100, abs(
            int(gray_w[y1:y2, x1:mid_x].mean()) - int(gray_w[y1:y2, mid_x:x2].mean())
        ))
    except Exception:
        sym = 80
    tilt = float(np.degrees(np.arctan2(er[1] - el[1], er[0] - el[0])))

    return dict(
        work=work, face=face, landmarks=landmarks,
        alpha=alpha_f, alpha_preshift=alp_ps,
        anchor_dx=adx, anchor_dy=ady,
        crop_M=M, crop_cs=cs, mode="manual",
        _padding=float(settings.get("padding", 4.5)),
        _headroom=float(settings.get("headroom", 0.20)),
        metrics=dict(
            tilt=f"{tilt:+.1f}°",
            brightness=f"{bright}/255",
            symmetry=f"{sym}%",
            quality=f"{min(100, int((bright / 130) * 50 + sym * .5))}/100",
            alert=("⚠️ Tilt >5°" if abs(tilt) > 5 else
                   "⚠️ Under-exposed" if bright < 90 else
                   "⚠️ Over-exposed" if bright > 210 else "✅ Looks good"),
        ),
        orig_size=(w, h),
    )


# ── Phase 2: apply all ops + composite (fast) ────────────────────────────────

def run_phase2(p1: Dict[str, Any], settings: Dict[str, Any]) -> bytes:
    """
    Run Phase 2 using cached Phase 1 results.
    Returns JPEG bytes of the final composited image.
    """
    SIZE = 1024
    face = p1["face"]; landmarks = p1["landmarks"]
    work = p1["work"].copy()

    skin = detect_skin_pixels(work, landmarks)
    work = apply_all_ops(work, skin, landmarks, settings)

    # ── Dynamic composition (padding / headroom) ──────────────────────────────
    # These params can be adjusted without re-running rembg.
    # When they differ from Phase 1 cached values, we approximate by scaling the
    # cached alpha mask so the composition preview updates instantly.
    padding  = float(settings.get("padding",  p1.get("_padding", 4.5)))
    headroom = float(settings.get("headroom", p1.get("_headroom", 0.20)))
    p1_padding  = float(p1.get("_padding",  4.5))
    p1_headroom = float(p1.get("_headroom", 0.20))

    if abs(padding - p1_padding) > 0.09:
        bw = face.bbox[2] - face.bbox[0]; bh = face.bbox[3] - face.bbox[1]
        h, w = work.shape[:2]
        
        # Use simple rectangular cropping with eye-center positioning
        # Try crop with validation when padding changes significantly
        M = None
        for try_padding in [padding, padding * 0.95, padding * 0.9, p1_padding]:
            cs = int(max(bw, bh) * try_padding)
            el, er = face.kps[0], face.kps[1]
            ec = ((el[0]+er[0])/2, (el[1]+er[1])/2)
            ang = np.degrees(np.arctan2(er[1]-el[1], er[0]-el[0]))
            
            M_candidate = _build_crop_M(ec, ang, cs, face.bbox[1], try_padding)
            M_candidate = _clamp_crop_bounds(work, M_candidate, cs)
            M_candidate = np.float32(M_candidate)  # Ensure proper matrix type
            
            # Test the crop
            try:
                test_crop = cv2.warpAffine(work, M_candidate, (cs, cs), borderValue=(255, 255, 255))
                if _validate_crop(test_crop, min_content_ratio=0.25):
                    M = M_candidate
                    break
            except Exception:
                continue
        
        # If validation failed, fall back to p1 padding
        if M is None:
            cs = int(max(bw, bh) * p1_padding)
            el, er = face.kps[0], face.kps[1]
            ec = ((el[0]+er[0])/2, (el[1]+er[1])/2)
            ang = np.degrees(np.arctan2(er[1]-el[1], er[0]-el[0]))
            M = _build_crop_M(ec, ang, cs, face.bbox[1], p1_padding)
            M = _clamp_crop_bounds(work, M, cs)
            M = np.float32(M)  # Ensure proper matrix type

        scale = p1_padding / padding   # < 1 when padding grew (person smaller in frame)
        cx = cy = SIZE // 2
        Msc = np.float32([[scale, 0, cx*(1-scale)], [0, scale, cy*(1-scale)]])
        alp_ps = cv2.warpAffine(p1["alpha_preshift"], Msc, (SIZE, SIZE),
                                flags=cv2.INTER_LINEAR, borderValue=0.0)
    else:
        M, cs  = p1["crop_M"], p1["crop_cs"]
        alp_ps = p1["alpha_preshift"]
        crop_img = None  # Will use M/cs approach below

    if abs(headroom - p1_headroom) > 0.004:
        ady, adx = safe_position_anchor(alp_ps, headroom, SIZE)
    else:
        adx, ady = p1["anchor_dx"], p1["anchor_dy"]

    alpha = cv2.warpAffine(alp_ps, np.float32([[1, 0, adx], [0, 1, ady]]),
                           (SIZE, SIZE), borderValue=0)
    # ── End dynamic composition ───────────────────────────────────────────────

    # Use direct crop if available, otherwise fall back to affine transform
    if crop_img is not None:
        crop_rt = crop_img
    else:
        crop_rt = cv2.warpAffine(work, M, (cs, cs), borderValue=(255, 255, 255))
    
    fg_rgb = cv2.resize(cv2.cvtColor(crop_rt, cv2.COLOR_BGR2RGB), (SIZE, SIZE), cv2.INTER_LANCZOS4)
    if settings.get("decontaminate", True):
        fg_rgb = decontaminate_edges(fg_rgb, alp_ps)
    fg_bgr = cv2.cvtColor(fg_rgb, cv2.COLOR_RGB2BGR)
    fg_bgr = cv2.warpAffine(fg_bgr, np.float32([[1, 0, adx], [0, 1, ady]]),
                            (SIZE, SIZE), borderValue=(0, 0, 0))
    fg_bgr = nuclear_pop(fg_bgr, settings.get("pop", 2))

    # Balance skin
    if settings.get("balance_skin", True):
        skin_fg = detect_skin_pixels(fg_bgr)
        skin_on_subject = skin_fg * np.clip(alpha, 0, 1)
        skin_pixels = skin_on_subject > 0.35
        if np.sum(skin_pixels) > 300:
            gray = cv2.cvtColor(fg_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
            mean_bright = np.mean(gray[skin_pixels])
            fsc = np.clip(settings.get("skin_target", 135) / (mean_bright + 1e-6), 0.88, 1.15)
            if abs(fsc - 1.0) > 0.01:
                m3 = np.stack([skin_on_subject] * 3, axis=2)
                fg_bgr = np.clip(
                    fg_bgr.astype(np.float32) * (1 - m3) +
                    fg_bgr.astype(np.float32) * fsc * m3,
                    0, 255).astype(np.uint8)

    # Background + composite
    grad = make_gradient_bg(SIZE, settings.get("gradient", "None"))
    canvas = create_canvas(
        SIZE, settings.get("bg_color", "#FFFFFF"),
        settings.get("glow", 40),
        grad,
    )
    fg_rgb_out = cv2.cvtColor(fg_bgr, cv2.COLOR_BGR2RGB)
    result = composite_shadow(
        canvas, fg_rgb_out, alpha,
        settings.get("shadow_color", "#222222"),
        settings.get("shadow_soft", 51),
        settings.get("shadow_dist", 15),
    )

    wm = settings.get("watermark", "")
    if wm:
        result = add_watermark(result, wm)

    # ── Output format resize + encode ─────────────────────────────────────────
    quality = int(settings.get("quality", 82))
    fmt = settings.get("format", "1024×1024 (Standard)")
    target_w, target_h = OUTPUT_FORMATS.get(fmt, (SIZE, SIZE))
    if PIL_OK:
        pil = Image.fromarray(result)
        if (target_w, target_h) != (SIZE, SIZE):
            pil = pil.resize((target_w, target_h), Image.LANCZOS)
        buf = io.BytesIO()
        pil.save(buf, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=2)
        return buf.getvalue()
    else:
        if (target_w, target_h) != (SIZE, SIZE):
            result_bgr = cv2.resize(cv2.cvtColor(result, cv2.COLOR_RGB2BGR),
                                    (target_w, target_h), cv2.INTER_LANCZOS4)
        else:
            result_bgr = cv2.cvtColor(result, cv2.COLOR_RGB2BGR)
        _, enc = cv2.imencode(".jpg", result_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return enc.tobytes()


# ── Public API ────────────────────────────────────────────────────────────────

def process_upload(img_bytes: bytes, settings: Dict[str, Any]) -> Tuple[str, Dict]:
    """
    Run Phase 1 on uploaded image bytes.
    Caches result in memory.
    Returns (session_id, metrics_dict).
    """
    global _p1_cache
    cache_key = _p1_cache_key(
        img_bytes,
        settings.get("mode", "manual"),
        float(settings.get("padding", 4.5)),
        float(settings.get("headroom", 0.20)),
        bool(settings.get("gfpgan_enable", False)),
    )

    if cache_key not in _p1_cache:
        p1 = run_phase1(img_bytes, settings)
        _p1_cache[cache_key] = p1
        # LRU eviction
        if len(_p1_cache) > MAX_CACHE:
            _p1_cache.popitem(last=False)
            gc.collect()
    else:
        _p1_cache.move_to_end(cache_key)

    return cache_key, _p1_cache[cache_key]["metrics"]


def render_preview(session_id: str, settings: Dict[str, Any]) -> bytes:
    """
    Run Phase 2 with given settings using cached Phase 1.
    Returns JPEG bytes.
    """
    if session_id not in _p1_cache:
        raise KeyError(f"Session '{session_id}' not found. Re-upload the image.")
    _p1_cache.move_to_end(session_id)
    return run_phase2(_p1_cache[session_id], settings)


def full_process(img_bytes: bytes, settings: Dict[str, Any]) -> bytes:
    """Run Phase 1 + Phase 2 in one call. Caches Phase 1."""
    session_id, _ = process_upload(img_bytes, settings)
    return render_preview(session_id, settings)


# ── Fast batch path ───────────────────────────────────────────────────────────
# KEY INSIGHT: crop to BS×BS IMMEDIATELY after face detection, then do
# every subsequent operation (rembg, skin-detect, all blurs, composite) on
# the small 512×512 image.  The old code ran all ops on the full 1200px image
# then cropped — that was 5-6× more pixels than necessary.
#
# Additional skips vs full_process:
#   • fastNlMeansDenoisingColored  (200-500 ms/image)
#   • cv2.inpaint for blemish      (100-400 ms/image when triggered)
#   • landmark-based teeth / dark-circle ops (no MediaPipe in batch)
# Combined, this gives ≈5-8× speedup vs full_process.

BATCH_SIZE = 512   # all processing happens at this resolution

def full_process_fast(img_bytes: bytes, settings: Dict[str, Any]) -> bytes:
    """
    Optimised batch path.
    Crops to 512×512 immediately after face detection so every subsequent
    operation — rembg, clean_alpha, skin-detect, all blurs, composite — runs
    on only 512×512 pixels.  Final output is upsampled to the requested size
    at JPEG encode time.  Phase 1 result is NOT cached (batch images are
    each unique).
    """
    BS = BATCH_SIZE
    init_sessions()

    # ── Decode ───────────────────────────────────────────────────────────────
    arr = np.frombuffer(img_bytes, np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Cannot decode image")

    h, w = img_bgr.shape[:2]
    if max(h, w) > 1200:
        sc = 1200 / max(h, w)
        img_bgr = cv2.resize(img_bgr, (int(w * sc), int(h * sc)), cv2.INTER_AREA)

    # ── Face detection — always returns ≥1 face via portrait-position fallback ──
    faces = get_faces(img_bgr)
    face    = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
    padding  = float(settings.get("padding", 4.5))
    headroom = float(settings.get("headroom", 0.20))

    # Crop sizing: same formula as run_phase1 for consistent batch output
    bw = face.bbox[2] - face.bbox[0]
    bh = face.bbox[3] - face.bbox[1]
    face_size = max(bw, bh)
    crop_mult = 2.0 + (min(padding, 9.0) / 9.0) * 1.2
    cs = int(face_size * crop_mult)
    cs = min(cs, int(min(w, h) * 0.92))
    cs = max(cs, int(face_size * 1.8))

    el, er = face.kps[0], face.kps[1]
    ec  = ((el[0] + er[0]) / 2.0, (el[1] + er[1]) / 2.0)
    ang = np.degrees(np.arctan2(er[1] - el[1], er[0] - el[0]))
    print(f"[BATCH] {w}x{h} face={face_size:.0f}px crop={cs}x{cs} ang={ang:.1f}")
    M = _build_crop_M(ec, ang, cs, face.bbox[1], padding)
    M = _clamp_crop_bounds(img_bgr, M, cs)
    M = np.float32(M)
    crop_full = cv2.warpAffine(img_bgr, M, (cs, cs), borderValue=(255, 255, 255))
    
    # ── Crop → resize to BS×BS immediately ───────────────────────────────────
    # Everything from this point operates on the small BS×BS image.
    img = cv2.resize(crop_full, (BS, BS), cv2.INTER_AREA)   # ← the working image

    # ── Background removal on BS×BS ──────────────────────────────────────────
    _fg_rgb, alp = _run_rembg(img)
    alp_ps  = clean_alpha(alp, img)
    ady, adx = safe_position_anchor(alp_ps, headroom, BS)

    # ── Skin detection on BS×BS ──────────────────────────────────────────────
    s    = settings
    skin = detect_skin_pixels(img, None)   # no landmarks — ~3× faster

    # ── Retouching ops — all run on BS×BS img ────────────────────────────────

    # Color temperature
    ct = s.get("color_temp", 0)
    if ct != 0:
        t = ct / 100.
        r = img.astype(np.float32)
        r[:,:,2] += t*28; r[:,:,1] += t*8; r[:,:,0] -= t*20
        img = np.clip(r, 0, 255).astype(np.uint8)

    # SkinFiner smoothing
    img = skinfiner_retouch(img, skin, s.get("smooth_skin", 0), s.get("texture_str", 1.))

    # Dodge & burn
    db = s.get("dodge_burn", 0)
    if db > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        l = np.clip(l - (l - cv2.GaussianBlur(l, (0,0), 40)) * skin * db, 0, 255)
        img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                      b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Tone harmony
    th = s.get("tone_harmony", 0)
    if th > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        px = skin > 0.5
        if px.sum() > 100:
            ta, tb = np.median(a[px]), np.median(b[px])
            a = np.clip(a + (ta - cv2.GaussianBlur(a, (0,0), 30)) * skin * th, 0, 255)
            b = np.clip(b + (tb - cv2.GaussianBlur(b, (0,0), 30)) * skin * th, 0, 255)
            img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                          b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Glare reduction
    gr = s.get("glare", 0)
    if gr > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        gm = cv2.GaussianBlur(((l > 215).astype(np.float32)) * skin, (21,21), 7)
        l  = l*(1-gm) + np.where(l>200, 200+(l-200)*(1-gr*.45), l)*gm
        img = cv2.cvtColor(cv2.merge([np.clip(l,0,255).astype(np.uint8),
                                      a.astype(np.uint8), b.astype(np.uint8)]),
                           cv2.COLOR_LAB2BGR)

    # Sharpness (simple USM — avoids expensive guided-filter)
    sharp = s.get("sharpness", 1.)
    if abs(sharp - 1.) > 0.01:
        img = cv2.addWeighted(img, sharp, cv2.GaussianBlur(img, (0,0), 3), 1.-sharp, 0)

    # Clarity
    cl2 = s.get("clarity", 0)
    if cl2 > 0:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        blur = cv2.GaussianBlur(l, (0,0), 20)
        mid  = 1 - (2*(l/255.)-1)**2
        l = np.clip(l + (l-blur)*cl2*mid, 0, 255)
        img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                      b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Vibrance
    vb = s.get("vibrance", 0)
    if vb > 0:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
        h2, sv, v = cv2.split(hsv)
        boost = vb*(1-sv/255.)*.6*(1-((h2<25)|(h2>155)).astype(np.float32)*.35)
        img = cv2.cvtColor(cv2.merge([h2.astype(np.uint8),
                                      np.clip(sv+boost*255,0,255).astype(np.uint8),
                                      v.astype(np.uint8)]), cv2.COLOR_HSV2BGR)

    # Colour grade
    fm    = {"warm_natural":"warm","cool":"soft","bright":"vivid","muted":"soft"}
    grade = fm.get(s.get("color_grade","natural"), s.get("color_grade","natural"))
    if grade in ["natural","vivid","soft","warm"]:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        if   grade == "natural": l = np.where(l<30, l+(30-l)*.3, l); b = np.where(l>200, b-5, b)
        elif grade == "vivid":   l = np.clip(l*1.2-10, 0, 255)
        elif grade == "soft":    l = l*.95+10
        elif grade == "warm":    a += 5; b -= 5
        img = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                      b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Exposure
    br = s.get("brightness",0); co = s.get("contrast",0); ga = s.get("gamma",1.)
    if co != 0 or br != 0:
        img = cv2.convertScaleAbs(img, alpha=1+co/100., beta=br)
    if abs(ga-1.) > .01:
        lut = np.array([((i/255.)**(1./ga))*255 for i in range(256)]).astype(np.uint8)
        img = cv2.LUT(img, lut)

    # ── Anchor shift: move subject to headroom position ───────────────────────
    # (No re-crop needed — img is already the face crop processed at BS×BS.)
    shift_M = np.float32([[1,0,adx],[0,1,ady]])
    fg_bgr  = cv2.warpAffine(img, shift_M, (BS,BS), borderValue=(0,0,0))
    alpha   = cv2.warpAffine(alp_ps, shift_M, (BS,BS), borderValue=0)

    # ── Post-composite ops ────────────────────────────────────────────────────
    fg_bgr = nuclear_pop(fg_bgr, s.get("pop", 2))

    if s.get("balance_skin", True):
        skin_fg = detect_skin_pixels(fg_bgr)
        son     = skin_fg * np.clip(alpha, 0, 1)
        sp      = son > 0.35
        if np.sum(sp) > 100:
            mean_br = np.mean(cv2.cvtColor(fg_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)[sp])
            fsc = np.clip(s.get("skin_target",135) / (mean_br+1e-6), 0.88, 1.15)
            if abs(fsc-1.) > 0.01:
                m3 = np.stack([son]*3, axis=2)
                fg_bgr = np.clip(fg_bgr.astype(np.float32)*(1-m3) +
                                 fg_bgr.astype(np.float32)*fsc*m3, 0,255).astype(np.uint8)

    # ── Background + composite ────────────────────────────────────────────────
    grad   = make_gradient_bg(BS, s.get("gradient","None"))
    canvas = create_canvas(BS, s.get("bg_color","#FFFFFF"), s.get("glow",40), grad)
    result = composite_shadow(canvas, cv2.cvtColor(fg_bgr, cv2.COLOR_BGR2RGB), alpha,
                              s.get("shadow_color","#222222"),
                              s.get("shadow_soft",51), s.get("shadow_dist",15))

    wm = s.get("watermark","")
    if wm:
        result = add_watermark(result, wm)

    # ── Upsample to requested output size ────────────────────────────────────
    out_wh = OUTPUT_FORMATS.get(s.get("format", s.get("output_format", "1024\u00d71024 (Standard)")), (1024, 1024))
    if result.shape[1] != out_wh[0] or result.shape[0] != out_wh[1]:
        result = cv2.resize(result, out_wh, cv2.INTER_LANCZOS4)

    # ── JPEG encode ──────────────────────────────────────────────────────────
    quality = int(s.get("quality", 82))
    if PIL_OK:
        buf = io.BytesIO()
        Image.fromarray(result).save(buf, "JPEG", quality=quality,
                                     optimize=True, progressive=True, subsampling=2)
        return buf.getvalue()
    _, enc = cv2.imencode(".jpg", cv2.cvtColor(result, cv2.COLOR_RGB2BGR),
                          [cv2.IMWRITE_JPEG_QUALITY, quality])
    return enc.tobytes()

    # ── Apply ops: SKIP denoise (very slow) and SKIP inpaint blemish ─────────
    s = settings

    # Color temperature
    ct = s.get("color_temp", 0)
    if ct != 0:
        t = ct / 100.; r = work.astype(np.float32)
        r[:, :, 2] += t * 28; r[:, :, 1] += t * 8; r[:, :, 0] -= t * 20
        work = np.clip(r, 0, 255).astype(np.uint8)

    # SkinFiner (frequency-separation smoothing)
    work = skinfiner_retouch(work, skin, s.get("smooth_skin", 0), s.get("texture_str", 1.))

    # Dodge & burn
    db = s.get("dodge_burn", 0)
    if db > 0:
        lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        l = np.clip(l - (l - cv2.GaussianBlur(l, (0, 0), 40)) * skin * db, 0, 255)
        work = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                       b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Tone harmony
    th = s.get("tone_harmony", 0)
    if th > 0:
        lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        px = skin > 0.5
        if px.sum() > 100:
            ta, tb = np.median(a[px]), np.median(b[px])
            a = np.clip(a + (ta - cv2.GaussianBlur(a, (0, 0), 30)) * skin * th, 0, 255)
            b = np.clip(b + (tb - cv2.GaussianBlur(b, (0, 0), 30)) * skin * th, 0, 255)
            work = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                           b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Glare reduction
    gr = s.get("glare", 0)
    if gr > 0:
        lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        gm = ((l > 215).astype(np.float32)) * skin
        gm = cv2.GaussianBlur(gm, (21, 21), 7)
        l = l * (1 - gm) + np.where(l > 200, 200 + (l - 200) * (1 - gr * .45), l) * gm
        work = cv2.cvtColor(cv2.merge([np.clip(l, 0, 255).astype(np.uint8),
                                       a.astype(np.uint8), b.astype(np.uint8)]),
                            cv2.COLOR_LAB2BGR)

    # Global sharpness (simple USM — faster than guided filter for batch)
    sharp = s.get("sharpness", 1.)
    if abs(sharp - 1.) > 0.01:
        blurred = cv2.GaussianBlur(work, (0, 0), 3)
        work = cv2.addWeighted(work, sharp, blurred, 1.0 - sharp, 0)

    # Clarity (local contrast)
    cl2 = s.get("clarity", 0)
    if cl2 > 0:
        lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        blur = cv2.GaussianBlur(l, (0, 0), 20)
        mid  = 1 - (2 * (l / 255.) - 1) ** 2
        l = np.clip(l + (l - blur) * cl2 * mid, 0, 255)
        work = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                       b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Vibrance
    vb = s.get("vibrance", 0)
    if vb > 0:
        hsv = cv2.cvtColor(work, cv2.COLOR_BGR2HSV).astype(np.float32)
        h2, sv, v = cv2.split(hsv)
        boost = vb * (1 - sv / 255.) * .6 * (
            1 - ((h2 < 25) | (h2 > 155)).astype(np.float32) * .35)
        work = cv2.cvtColor(cv2.merge([h2.astype(np.uint8),
                                       np.clip(sv + boost * 255, 0, 255).astype(np.uint8),
                                       v.astype(np.uint8)]), cv2.COLOR_HSV2BGR)

    # Colour grade
    fm = {"warm_natural": "warm", "cool": "soft", "bright": "vivid", "muted": "soft"}
    grade = fm.get(s.get("color_grade", "natural"), s.get("color_grade", "natural"))
    if grade in ["natural", "vivid", "soft", "warm"]:
        lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB).astype(np.float32)
        l, a, b = cv2.split(lab)
        if grade == "natural":
            l = np.where(l < 30, l + (30 - l) * .3, l); b = np.where(l > 200, b - 5, b)
        elif grade == "vivid": l = np.clip(l * 1.2 - 10, 0, 255)
        elif grade == "soft":  l = l * .95 + 10
        elif grade == "warm":  a += 5; b -= 5
        work = cv2.cvtColor(cv2.merge([l.astype(np.uint8), a.astype(np.uint8),
                                       b.astype(np.uint8)]), cv2.COLOR_LAB2BGR)

    # Exposure
    br = s.get("brightness", 0); co = s.get("contrast", 0); ga = s.get("gamma", 1.)
    if co != 0 or br != 0:
        work = cv2.convertScaleAbs(work, alpha=1 + co / 100., beta=br)
    if abs(ga - 1.) > .01:
        lut = np.array([((i / 255.) ** (1. / ga)) * 255
                        for i in range(256)]).astype(np.uint8)
        work = cv2.LUT(work, lut)

    # ── Re-crop processed image → BS×BS foreground ───────────────────────────
    crop_rt = cv2.warpAffine(work, M, (cs, cs), borderValue=(255, 255, 255))
    fg_bgr  = cv2.resize(crop_rt, (BS, BS), cv2.INTER_AREA)

    # Shift foreground to match alpha anchor
    fg_bgr = cv2.warpAffine(fg_bgr,
                             np.float32([[1, 0, adx], [0, 1, ady]]),
                             (BS, BS), borderValue=(0, 0, 0))

    # Nuclear pop (contrast boost)
    fg_bgr = nuclear_pop(fg_bgr, s.get("pop", 2))

    # Balance skin brightness
    if s.get("balance_skin", True):
        skin_fg = detect_skin_pixels(fg_bgr)
        skin_on_subject = skin_fg * np.clip(alpha, 0, 1)
        skin_pixels = skin_on_subject > 0.35
        if np.sum(skin_pixels) > 100:
            gray_fg = cv2.cvtColor(fg_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
            mean_bright = np.mean(gray_fg[skin_pixels])
            fsc = np.clip(s.get("skin_target", 135) / (mean_bright + 1e-6), 0.88, 1.15)
            if abs(fsc - 1.0) > 0.01:
                m3 = np.stack([skin_on_subject] * 3, axis=2)
                fg_bgr = np.clip(
                    fg_bgr.astype(np.float32) * (1 - m3) +
                    fg_bgr.astype(np.float32) * fsc * m3, 0, 255).astype(np.uint8)

    # ── Background + composite (at BS×BS) ────────────────────────────────────
    grad   = make_gradient_bg(BS, s.get("gradient", "None"))
    canvas = create_canvas(BS, s.get("bg_color", "#FFFFFF"), s.get("glow", 40), grad)
    fg_rgb_out = cv2.cvtColor(fg_bgr, cv2.COLOR_BGR2RGB)
    result = composite_shadow(canvas, fg_rgb_out, alpha,
                              s.get("shadow_color", "#222222"),
                              s.get("shadow_soft", 51),
                              s.get("shadow_dist", 15))

    # Watermark
    wm = s.get("watermark", "")
    if wm:
        result = add_watermark(result, wm)

    # ── Upsample to requested output size ────────────────────────────────────
    out_wh = OUTPUT_FORMATS.get(s.get("output_format", "1024×1024 (Standard)"), (1024, 1024))
    if result.shape[1] != out_wh[0] or result.shape[0] != out_wh[1]:
        result = cv2.resize(result, out_wh, cv2.INTER_LANCZOS4)

    # ── JPEG encode ──────────────────────────────────────────────────────────
    quality = int(s.get("quality", 82))
    if PIL_OK:
        pil = Image.fromarray(result)
        buf = io.BytesIO()
        pil.save(buf, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=2)
        return buf.getvalue()
    else:
        _, enc = cv2.imencode(".jpg", cv2.cvtColor(result, cv2.COLOR_RGB2BGR),
                              [cv2.IMWRITE_JPEG_QUALITY, quality])
        return enc.tobytes()

