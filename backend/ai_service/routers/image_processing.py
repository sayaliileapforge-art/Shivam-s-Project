"""
Image Processing Router
=======================
All AI image-processing endpoints.

POST /api/ai/auto-crop                        — single image smart crop
POST /api/ai/auto-crop/bulk                   — bulk smart crop
POST /api/ai/remove-bg                        — single background removal
POST /api/ai/remove-bg/bulk                   — bulk background removal
POST /api/ai/barcode                          — barcode / QR generation
POST /api/ai/photo-edit/batch-async           — start async batch (returns task_id)
GET  /api/ai/photo-edit/batch-status/{id}     — poll batch progress
DELETE /api/ai/photo-edit/batch-task/{id}     — clean up a finished task
GET  /api/ai/health                           — quick liveness check
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from models import BarcodeItem, BarcodeRequest, BarcodeResponse, BarcodeResult
from services.auto_crop import crop_image
from services.bg_remover import remove_background
from services.barcode_gen import generate_barcode_image

router = APIRouter()

# Dedicated thread pool for CPU-bound batch photo processing.
# Workers = _N_REMBG (from bg_remover) so the pool size matches the semaphore;
# extra queued tasks wait in asyncio rather than spinning up idle OS threads.
_N_WORKERS = max(2, min(4, (os.cpu_count() or 4)))
_BATCH_POOL = ThreadPoolExecutor(max_workers=max(8, (os.cpu_count() or 4) * 2))

# ── Helpers ───────────────────────────────────────────────────────────────────

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}
MAX_FILE_SIZE = 15 * 1024 * 1024   # 15 MB


def _to_data_url(png_bytes: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(png_bytes).decode()}"


def _mime_for_bytes(data: bytes) -> str:
    """Guess MIME type from magic bytes."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"\x89PNG":
        return "image/png"
    return "image/png"


async def _read_and_validate(file: UploadFile) -> bytes:
    if file.content_type and file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(ALLOWED_MIME)}",
        )
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file.filename}. Max size is 15 MB.",
        )
    return data


# ── Auto-Crop ──────────────────────────────────────────────────────────────────

@router.post("/auto-crop", summary="AI Auto-Crop (single image)")
async def auto_crop_single(
    image: UploadFile = File(..., description="Source image file"),
    aspect_ratio: str = Form("1:1", description="Target aspect ratio: 1:1 | 3:4 | 2:3 | passport | id_card"),
    padding_pct: float = Form(0.15, description="Padding around detected face (0–1)"),
):
    """Detect face / person and crop to the desired aspect ratio."""
    data = await _read_and_validate(image)
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, crop_image, data, aspect_ratio, padding_pct
        )
        mime = _mime_for_bytes(result)
        return JSONResponse({
            "success": True,
            "filename": image.filename,
            "data_url": _to_data_url(result, mime),
        })
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/auto-crop/bulk", summary="AI Auto-Crop (bulk)")
async def auto_crop_bulk(
    images: List[UploadFile] = File(...),
    aspect_ratio: str = Form("1:1"),
    padding_pct: float = Form(0.15),
):
    """Process up to 500 images concurrently."""
    if len(images) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 images per bulk request.")

    async def process_one(file: UploadFile):
        try:
            data = await _read_and_validate(file)
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, crop_image, data, aspect_ratio, padding_pct
            )
            mime = _mime_for_bytes(result)
            return {
                "success": True,
                "filename": file.filename,
                "data_url": _to_data_url(result, mime),
            }
        except Exception as exc:
            return {"success": False, "filename": file.filename, "error": str(exc)}

    results = await asyncio.gather(*[process_one(f) for f in images])
    failed = sum(1 for r in results if not r["success"])
    return JSONResponse({
        "total": len(images),
        "processed": len(images) - failed,
        "failed": failed,
        "results": results,
    })


# ── Background Removal ────────────────────────────────────────────────────────

@router.post("/remove-bg", summary="AI Background Removal (single image)")
async def remove_bg_single(
    image: UploadFile = File(...),
    bg_color: str = Form("transparent", description="transparent | white | black | #rrggbb"),
    model_name: str = Form("u2net_human_seg"),
):
    """Remove background and optionally replace with a solid colour."""
    data = await _read_and_validate(image)
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _BATCH_POOL, remove_background, data, bg_color, model_name
        )
        is_png = bg_color == "transparent"
        mime = "image/png" if is_png else "image/jpeg"
        return JSONResponse({
            "success": True,
            "filename": image.filename,
            "data_url": _to_data_url(result, mime),
        })
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/remove-bg/bulk", summary="AI Background Removal (bulk)")
async def remove_bg_bulk(
    images: List[UploadFile] = File(...),
    bg_color: str = Form("transparent"),
    model_name: str = Form("u2net_human_seg"),
):
    if len(images) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 images per bulk request.")

    # Limit how many rembg inferences run at the same time within one request.
    # Without this cap, asyncio.gather fires ALL images simultaneously into the
    # thread pool; combined with the global threading.Semaphore in bg_remover
    # the excess coroutines just queue, but flooding the pool with hundreds of
    # run_in_executor() calls wastes event-loop scheduling overhead.
    _sem = asyncio.Semaphore(_N_WORKERS)

    async def process_one(file: UploadFile):
        async with _sem:
            try:
                data = await _read_and_validate(file)
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    _BATCH_POOL, remove_background, data, bg_color, model_name
                )
                is_png = bg_color == "transparent"
                mime = "image/png" if is_png else "image/jpeg"
                return {
                    "success": True,
                    "filename": file.filename,
                    "data_url": _to_data_url(result, mime),
                }
            except Exception as exc:
                return {"success": False, "filename": file.filename, "error": str(exc)}

    results = await asyncio.gather(*[process_one(f) for f in images])
    failed = sum(1 for r in results if not r["success"])
    return JSONResponse({
        "total": len(images),
        "processed": len(images) - failed,
        "failed": failed,
        "results": results,
    })


# ── Barcode Generation ────────────────────────────────────────────────────────

@router.post("/barcode", summary="Generate barcodes / QR codes for student records")
async def generate_barcodes(
    items: str = Form(..., description="JSON array of {record_id, value, label?}"),
    barcode_type: str = Form("code128", description="code128 | qr | ean13"),
    width: int = Form(300),
    height: int = Form(100),
):
    """
    Accepts a JSON-encoded array of student records and returns a barcode image
    (as base64 data URL) for each.
    """
    try:
        raw_items: list = json.loads(items)
    except Exception:
        raise HTTPException(status_code=400, detail="'items' must be a valid JSON array.")

    if not isinstance(raw_items, list) or len(raw_items) == 0:
        raise HTTPException(status_code=400, detail="'items' must be a non-empty JSON array.")

    if len(raw_items) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 records per request.")

    async def process_one(item: dict):
        record_id = str(item.get("record_id", ""))
        value = str(item.get("value", record_id)).strip()
        if not value:
            return BarcodeResult(
                record_id=record_id, success=False, error="Empty value — skipped"
            )
        try:
            loop = asyncio.get_event_loop()
            img_bytes = await loop.run_in_executor(
                None, generate_barcode_image, value, barcode_type, width, height
            )
            return BarcodeResult(
                record_id=record_id,
                success=True,
                data_url=_to_data_url(img_bytes, "image/png"),
            )
        except Exception as exc:
            return BarcodeResult(record_id=record_id, success=False, error=str(exc))

    results = await asyncio.gather(*[process_one(item) for item in raw_items])
    failed = sum(1 for r in results if not r.success)
    return BarcodeResponse(
        total=len(raw_items),
        processed=len(raw_items) - failed,
        failed=failed,
        results=list(results),
    )


# ── AI Photo Studio (v7.4 port) ───────────────────────────────────────────────

from services.photo_editor import (
    compute_settings, process_upload, render_preview, full_process, full_process_fast,
    GRADIENT_PRESETS, OUTPUT_FORMATS,
    INSIGHTFACE_OK, REMBG_OK, MEDIAPIPE_OK, GFPGAN_OK,
    init_sessions,
)


@router.post("/photo-edit/upload", summary="Upload image for Phase 1 (face detect + bg remove)")
async def photo_edit_upload(
    image:     Optional[UploadFile] = File(None),
    image_url: Optional[str]        = Form(None),
    mode:      str                  = Form("manual"),
    padding:   float                = Form(4.5),
    headroom:  float                = Form(0.20),
    gfpgan:    bool                 = Form(False),
):
    """
    Run Phase 1 (face detection + background removal).
    Accepts either a file upload (`image`) or a URL (`image_url`).
    When `image_url` is provided the service fetches the image server-side,
    avoiding browser CORS restrictions on programmatic fetch().
    """
    # ── Obtain raw image bytes ────────────────────────────────────────────────
    if image_url and image_url.strip():
        try:
            req = urllib.request.Request(
                image_url.strip(),
                headers={"User-Agent": "Mozilla/5.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Could not fetch image_url: {exc}")
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="Image from URL exceeds 15 MB limit.")
    elif image is not None:
        data = await _read_and_validate(image)
    else:
        raise HTTPException(status_code=422, detail="Provide either 'image' (file) or 'image_url'.")

    try:
        # Use the same defaults as the frontend DEFAULT_SETTINGS so the initial
        # Phase 1 preview matches what the sliders show before any adjustment.
        init_settings = compute_settings(
            enhance=3.0, exposure=0, color_temp_lv=0, sharpness_lv=4.0, skin_lv=2.5,
            color_grade="natural", crop_mode=mode,
            padding=padding, headroom=headroom,
            sh_soft=12, sh_dist=6, glow=8, gradient="None",
            balance_skin=True, decontaminate=True, gfpgan_enable=gfpgan, quality=88,
        )
        loop = asyncio.get_event_loop()
        session_id, metrics = await loop.run_in_executor(
            None, process_upload, data, init_settings
        )
        # Render default preview
        preview_bytes = await loop.run_in_executor(
            None, render_preview, session_id, init_settings
        )
        return JSONResponse({
            "success": True,
            "session_id": session_id,
            "metrics": metrics,
            "preview": _to_data_url(preview_bytes, "image/jpeg"),
        })
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/photo-edit/render", summary="Phase 2: render with current slider settings")
async def photo_edit_render(
    session_id:   str   = Form(...),
    enhance:      float = Form(5.0),
    exposure:     float = Form(0.0),
    color_temp:   float = Form(0.0),
    sharpness:    float = Form(5.0),
    skin:         float = Form(5.0),
    color_grade:  str   = Form("natural"),
    crop_mode:    str   = Form("manual"),
    padding:      float = Form(4.5),
    headroom:     float = Form(0.20),
    bg_color:     str   = Form("#FFFFFF"),
    shadow_color: str   = Form("#222222"),
    gradient:     str   = Form("None"),
    glow:         int   = Form(40),
    shadow_soft:  int   = Form(51),
    shadow_dist:  int   = Form(15),
    jpeg_quality: int   = Form(82),
    watermark:    str   = Form(""),
    balance_skin: bool  = Form(True),
    clean_hair:   bool  = Form(True),
    gfpgan:       bool  = Form(False),
    format:       str   = Form("1024\u00d71024 (Standard)"),
):
    """Fast Phase 2 render using cached Phase 1 data. Runs in ~0.1–0.5s."""
    settings = compute_settings(
        enhance=enhance, exposure=exposure, color_temp_lv=color_temp,
        sharpness_lv=sharpness, skin_lv=skin,
        color_grade=color_grade, crop_mode=crop_mode,
        padding=padding, headroom=headroom,
        sh_soft=shadow_soft, sh_dist=shadow_dist, glow=glow, gradient=gradient,
        balance_skin=balance_skin, decontaminate=clean_hair, gfpgan_enable=gfpgan,
        quality=jpeg_quality, bg_color=bg_color, shadow_color=shadow_color,
        watermark=watermark,
    )
    settings["format"] = format
    try:
        loop = asyncio.get_event_loop()
        result_bytes = await loop.run_in_executor(
            None, render_preview, session_id, settings
        )
        return JSONResponse({
            "success": True,
            "data_url": _to_data_url(result_bytes, "image/jpeg"),
        })
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/photo-edit/batch", summary="Batch process multiple images with current settings")
async def photo_edit_batch(
    images:       Optional[List[UploadFile]] = File(None),
    image_urls:   Optional[List[str]]        = Form(None),
    enhance:      float = Form(5.0),
    exposure:     float = Form(0.0),
    color_temp:   float = Form(0.0),
    sharpness:    float = Form(5.0),
    skin:         float = Form(5.0),
    color_grade:  str   = Form("natural"),
    crop_mode:    str   = Form("manual"),
    padding:      float = Form(4.5),
    headroom:     float = Form(0.20),
    bg_color:     str   = Form("#FFFFFF"),
    shadow_color: str   = Form("#222222"),
    gradient:     str   = Form("None"),
    glow:         int   = Form(40),
    shadow_soft:  int   = Form(51),
    shadow_dist:  int   = Form(15),
    jpeg_quality: int   = Form(82),
    watermark:    str   = Form(""),
    balance_skin: bool  = Form(True),
    clean_hair:   bool  = Form(True),
    gfpgan:       bool  = Form(False),
    format:       str   = Form("1024×1024 (Standard)"),
):
    """Process up to 200 images with the same settings. Accepts files, URLs, or a mix."""
    # Build a flat list of (source_label, bytes_or_url) items
    items: list[dict] = []
    if images:
        for f in images:
            items.append({"type": "file", "file": f})
    if image_urls:
        for u in image_urls:
            if u and u.strip():
                items.append({"type": "url", "url": u.strip()})

    if not items:
        raise HTTPException(status_code=422, detail="Provide 'images' files and/or 'image_urls'.")
    if len(items) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 images per batch.")

    settings = compute_settings(
        enhance=enhance, exposure=exposure, color_temp_lv=color_temp,
        sharpness_lv=sharpness, skin_lv=skin,
        color_grade=color_grade, crop_mode=crop_mode,
        padding=padding, headroom=headroom,
        sh_soft=shadow_soft, sh_dist=shadow_dist, glow=glow, gradient=gradient,
        balance_skin=balance_skin, decontaminate=clean_hair, gfpgan_enable=gfpgan,
        quality=jpeg_quality, bg_color=bg_color, shadow_color=shadow_color,
        watermark=watermark,
    )
    settings["format"] = format

    _sem = asyncio.Semaphore(max(2, min(4, (os.cpu_count() or 4))))

    async def process_one(item: dict):
        label = item.get("file", {}).filename if item["type"] == "file" else item.get("url", "url")
        async with _sem:
            try:
                if item["type"] == "file":
                    data = await _read_and_validate(item["file"])
                else:
                    def _fetch_url():
                        req = urllib.request.Request(item["url"], headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(req, timeout=30) as resp:
                            return resp.read()
                    loop = asyncio.get_event_loop()
                    data = await loop.run_in_executor(_BATCH_POOL, _fetch_url)
                loop = asyncio.get_event_loop()
                result_bytes = await loop.run_in_executor(_BATCH_POOL, full_process_fast, data, settings)
                return {
                    "success": True,
                    "filename": label,
                    "data_url": _to_data_url(result_bytes, "image/jpeg"),
                }
            except Exception as exc:
                return {"success": False, "filename": label, "error": str(exc)}

    results = await asyncio.gather(*[process_one(item) for item in items])
    failed = sum(1 for r in results if not r["success"])
    return JSONResponse({
        "total": len(items),
        "processed": len(items) - failed,
        "failed": failed,
        "results": results,
    })


# ── Async Batch Processing with real-time progress ────────────────────────────
# Two-step approach:
#   1. POST /photo-edit/batch-async   → starts background task, returns task_id
#   2. GET  /photo-edit/batch-status/{task_id}  → poll for progress / results
# This lets the frontend display per-image progress, ETA and partial results
# without waiting for the entire batch to complete before receiving anything.

_batch_tasks: Dict[str, Dict[str, Any]] = {}
_TASK_EXPIRY_SECONDS = 900  # 15 min — clean up old completed tasks


def _cleanup_old_tasks() -> None:
    """Evict tasks older than _TASK_EXPIRY_SECONDS to prevent unbounded growth."""
    cutoff = time.monotonic() - _TASK_EXPIRY_SECONDS
    expired = [k for k, v in _batch_tasks.items() if v.get("_monotonic_start", 0) < cutoff]
    for k in expired:
        del _batch_tasks[k]


async def _run_batch_task(
    task_id: str,
    url_items: List[Dict[str, Any]],  # [{index, url, name}]
    settings: Dict[str, Any],
) -> None:
    """Background coroutine: processes each URL and updates task state in-place."""
    task = _batch_tasks.get(task_id)
    if task is None:
        return

    loop = asyncio.get_event_loop()
    # Limit true CPU concurrency: rembg + InsightFace are both memory-heavy.
    # Allow at most cpu_count concurrent inferences so the system doesn't OOM.
    cpu = os.cpu_count() or 2
    sem = asyncio.Semaphore(max(2, min(cpu, 4)))
    elapsed_times: List[float] = []

    async def process_one(item: Dict[str, Any]) -> None:
        name = item.get("name", f"Image {item['index'] + 1}")
        url  = item["url"]
        task["current"] = name

        t0 = time.monotonic()
        async with sem:
            try:
                def _fetch_and_process() -> bytes:
                    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req, timeout=45) as resp:
                        data = resp.read()
                    if len(data) > MAX_FILE_SIZE:
                        raise ValueError("Image exceeds 15 MB limit")
                    return full_process_fast(data, settings)

                result_bytes = await loop.run_in_executor(_BATCH_POOL, _fetch_and_process)
                task["results"].append({
                    "index": item["index"],
                    "name": name,
                    "data_url": _to_data_url(result_bytes, "image/jpeg"),
                })
                task["success"] += 1
            except Exception as exc:
                task["errors"].append({
                    "index": item["index"],
                    "name": name,
                    "error": str(exc),
                })
                task["failed"] += 1

        elapsed_times.append(time.monotonic() - t0)
        task["completed"] += 1

        # Running ETA: average time per image × remaining images ÷ concurrency slots
        if elapsed_times:
            avg = sum(elapsed_times) / len(elapsed_times)
            remaining = task["total"] - task["completed"]
            effective_concurrency = max(2, min(cpu, 4))
            task["eta_seconds"] = round(remaining * avg / effective_concurrency, 1)

    await asyncio.gather(*[process_one(item) for item in url_items])

    task["done"] = True
    task["status"] = "done"
    task["current"] = ""
    task["eta_seconds"] = 0


@router.post("/photo-edit/batch-async", summary="Start async batch (returns task_id for polling)")
async def photo_edit_batch_async(
    image_urls:   str   = Form(..., description="JSON array of absolute image URLs"),
    student_names: str  = Form("[]", description="JSON array of student names (for progress display)"),
    enhance:      float = Form(5.0),
    exposure:     float = Form(0.0),
    color_temp:   float = Form(0.0),
    sharpness:    float = Form(5.0),
    skin:         float = Form(5.0),
    color_grade:  str   = Form("natural"),
    crop_mode:    str   = Form("manual"),
    padding:      float = Form(4.5),
    headroom:     float = Form(0.20),
    bg_color:     str   = Form("#FFFFFF"),
    shadow_color: str   = Form("#222222"),
    gradient:     str   = Form("None"),
    glow:         int   = Form(40),
    shadow_soft:  int   = Form(51),
    shadow_dist:  int   = Form(15),
    jpeg_quality: int   = Form(82),
    watermark:    str   = Form(""),
    balance_skin: bool  = Form(True),
    clean_hair:   bool  = Form(True),
    gfpgan:       bool  = Form(False),
    format:       str   = Form("1024×1024 (Standard)"),
):
    """
    Start asynchronous batch processing.

    Returns immediately with {task_id, total}.
    Poll GET /photo-edit/batch-status/{task_id} every ~1 s for progress.
    """
    try:
        urls: List[str] = json.loads(image_urls)
    except Exception:
        raise HTTPException(status_code=400, detail="'image_urls' must be a valid JSON array.")
    try:
        names: List[str] = json.loads(student_names)
    except Exception:
        names = []

    if not urls:
        raise HTTPException(status_code=422, detail="'image_urls' must not be empty.")
    if len(urls) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 images per async batch.")

    settings = compute_settings(
        enhance=enhance, exposure=exposure, color_temp_lv=color_temp,
        sharpness_lv=sharpness, skin_lv=skin,
        color_grade=color_grade, crop_mode=crop_mode,
        padding=padding, headroom=headroom,
        sh_soft=shadow_soft, sh_dist=shadow_dist, glow=glow, gradient=gradient,
        balance_skin=balance_skin, decontaminate=clean_hair, gfpgan_enable=gfpgan,
        quality=jpeg_quality, bg_color=bg_color, shadow_color=shadow_color,
        watermark=watermark,
    )
    settings["format"] = format

    _cleanup_old_tasks()

    task_id = str(uuid.uuid4())
    _batch_tasks[task_id] = {
        "task_id":         task_id,
        "status":          "running",
        "total":           len(urls),
        "completed":       0,
        "success":         0,
        "failed":          0,
        "current":         "",
        "results":         [],     # [{index, name, data_url}]
        "errors":          [],     # [{index, name, error}]
        "done":            False,
        "eta_seconds":     None,
        "_monotonic_start": time.monotonic(),
    }

    url_items = [
        {"index": i, "url": u, "name": names[i] if i < len(names) else f"Image {i + 1}"}
        for i, u in enumerate(urls)
    ]

    asyncio.create_task(_run_batch_task(task_id, url_items, settings))

    return JSONResponse({"task_id": task_id, "total": len(urls)})


@router.get("/photo-edit/batch-status/{task_id}", summary="Poll async batch progress")
async def photo_edit_batch_status(task_id: str):
    """
    Returns the current state of an async batch task.

    Fields:
      status      — "running" | "done"
      total       — total images in batch
      completed   — images finished (success + failed)
      success     — successfully processed count
      failed      — failed count
      current     — name of the image currently being processed
      eta_seconds — estimated seconds remaining (null until first image completes)
      results     — [{index, name, data_url}] — grows as images complete
      errors      — [{index, name, error}]
      done        — true when all images have been processed
    """
    task = _batch_tasks.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found or expired (>15 min).")
    # Return a safe copy without the internal monotonic timestamp
    return JSONResponse({k: v for k, v in task.items() if not k.startswith("_")})


@router.delete("/photo-edit/batch-task/{task_id}", summary="Clean up a completed batch task")
async def photo_edit_batch_task_delete(task_id: str):
    """Free memory held by a finished batch task."""
    if task_id in _batch_tasks:
        del _batch_tasks[task_id]
    return {"deleted": task_id}


# ── Health ─────────────────────────────────────────────────────────────────────

@router.get("/health", summary="AI service health check")
async def health():
    from services import auto_crop, bg_remover, barcode_gen
    return {
        "status": "ok",
        "mediapipe": auto_crop._USE_MEDIAPIPE,
        "rembg": bg_remover._REMBG_AVAILABLE,
        "barcode_lib": barcode_gen._BARCODE_LIB,
        "qr_lib": barcode_gen._QR_LIB,
        "photo_editor": {
            "insightface": INSIGHTFACE_OK,
            "rembg": REMBG_OK,
            "mediapipe": MEDIAPIPE_OK,
            "gfpgan": GFPGAN_OK,
        },
    }
