# -*- coding: utf-8 -*-
"""
Barcode / QR-code generation service.

Supported types:
  "code128"  → linear Code128 barcode  (python-barcode)
  "qr"       → QR code                 (qrcode)
  "ean13"    → EAN-13 barcode          (python-barcode, requires exactly 12 digits)
"""

from __future__ import annotations

import io
import re
from typing import Optional

from PIL import Image, ImageDraw, ImageFont


# ── Code128 / EAN-13 via python-barcode ───────────────────────────────────────
try:
    import barcode as _bc
    from barcode.writer import ImageWriter as _ImageWriter
    _BARCODE_LIB = True
except ImportError:
    _BARCODE_LIB = False

# ── QR via qrcode ─────────────────────────────────────────────────────────────
try:
    import qrcode as _qrcode
    _QR_LIB = True
except ImportError:
    _QR_LIB = False


def _canvas_barcode_fallback(value: str, width: int, height: int) -> bytes:
    """Minimal canvas-drawn barcode when python-barcode is unavailable."""
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    chars = list(value)
    slot_w = max(1, (width - 8) // max(len(chars) * 3, 1))
    x = 4
    for ch in chars:
        code = ord(ch)
        for i, on in enumerate([1, 0, 1]):
            w = slot_w * (2 if (on and ((code >> i) & 1)) else 1)
            if on:
                draw.rectangle([x, 4, x + w - 1, height - 12], fill="black")
            x += w + 1
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    label = value[:32]
    draw.text((4, height - 11), label, fill="black", font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_barcode_image(
    value: str,
    barcode_type: str = "code128",
    width: int = 300,
    height: int = 100,
) -> bytes:
    """
    Generate a barcode/QR image and return PNG bytes.

    Parameters
    ----------
    value         The data to encode.
    barcode_type  'code128' | 'qr' | 'ean13'
    width / height  Output image size in pixels.

    Returns
    -------
    PNG bytes.
    """
    value = str(value).strip()
    if not value:
        raise ValueError("value must not be empty")

    # ── QR code ───────────────────────────────────────────────────────────────
    if barcode_type == "qr":
        if not _QR_LIB:
            # Fallback: encode QR as barcode-style strip
            return _canvas_barcode_fallback(f"QR:{value}", width, height)
        qr = _qrcode.QRCode(
            version=None,
            error_correction=_qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(value)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        # Resize to requested dimensions
        img = img.resize((width, width), Image.LANCZOS)  # QR is square
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    # ── Code128 / EAN-13 ──────────────────────────────────────────────────────
    if not _BARCODE_LIB:
        return _canvas_barcode_fallback(value, width, height)

    try:
        bc_type = "ean13" if barcode_type == "ean13" else "code128"

        # EAN-13 needs exactly 12 digits (check digit auto-added)
        if bc_type == "ean13":
            digits = re.sub(r"\D", "", value)
            if len(digits) < 12:
                digits = digits.zfill(12)
            value = digits[:12]

        options = {
            "module_width": 0.2,
            "module_height": max(5.0, height / 20.0),
            "quiet_zone": 2.0,
            "font_size": 8,
            "text_distance": 4.0,
            "background": "white",
            "foreground": "black",
            "write_text": True,
            "dpi": 200,
        }

        bc_class = _bc.get_barcode_class(bc_type)
        bc_obj = bc_class(value, writer=_ImageWriter())
        buf = io.BytesIO()
        bc_obj.write(buf, options=options)
        buf.seek(0)

        img = Image.open(buf).convert("RGB")
        img = img.resize((width, height), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()

    except Exception as e:
        # Any error → canvas fallback
        return _canvas_barcode_fallback(value, width, height)
