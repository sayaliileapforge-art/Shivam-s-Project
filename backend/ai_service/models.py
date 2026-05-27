"""
Pydantic request / response models for the AI image service.
"""

from typing import Optional, List
from pydantic import BaseModel, Field


# ── Shared ─────────────────────────────────────────────────────────────────────

class ProcessedImage(BaseModel):
    """Single processed image result returned to the caller."""
    success: bool
    filename: str
    data_url: Optional[str] = None   # base64 data URL (data:image/png;base64,…)
    error: Optional[str] = None


class BulkProcessResult(BaseModel):
    """Aggregated result for bulk operations."""
    total: int
    processed: int
    failed: int
    results: List[ProcessedImage]


# ── Auto-Crop ──────────────────────────────────────────────────────────────────

class AutoCropRequest(BaseModel):
    aspect_ratio: str = Field(
        "1:1",
        description="Target aspect ratio. One of: '1:1', '3:4', '2:3', 'passport' (35x45mm), 'id_card' (54x86mm)",
    )
    padding_pct: float = Field(
        0.15,
        description="Fraction of face bounding-box height to add as padding around the face.",
        ge=0.0,
        le=1.0,
    )


# ── Background Removal ────────────────────────────────────────────────────────

class BgRemoveRequest(BaseModel):
    bg_color: str = Field(
        "transparent",
        description="Background replacement. One of: 'transparent', 'white', 'black', or a hex colour '#rrggbb'.",
    )
    model_name: str = Field(
        "u2net_human_seg",
        description="rembg model. 'u2net_human_seg' is best for portrait photos.",
    )


# ── Barcode ────────────────────────────────────────────────────────────────────

class BarcodeItem(BaseModel):
    record_id: str
    value: str
    label: Optional[str] = None


class BarcodeRequest(BaseModel):
    items: List[BarcodeItem]
    barcode_type: str = Field(
        "code128",
        description="'code128', 'qr', or 'ean13'.",
    )
    width: int = Field(300, ge=50, le=1000)
    height: int = Field(100, ge=30, le=500)


class BarcodeResult(BaseModel):
    record_id: str
    success: bool
    data_url: Optional[str] = None
    error: Optional[str] = None


class BarcodeResponse(BaseModel):
    total: int
    processed: int
    failed: int
    results: List[BarcodeResult]
