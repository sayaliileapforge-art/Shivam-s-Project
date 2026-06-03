"""
AI Image Processing Service — FastAPI entry point.

Runs on port 8001 (separate from the main Node/Express backend on port 5000).
The Express backend proxies  /api/ai/*  →  http://localhost:8001/api/ai/*
so the frontend never needs to know about the Python service directly.

Usage:
    pip install -r requirements.txt
    python main.py
      or
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""

import os
import threading
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.image_processing import router as img_router

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Enterprise SaaS — AI Image Processing",
    version="1.0.0",
    description="Handles auto-crop, background removal, barcode generation and bulk image processing.",
)

# ── CORS ───────────────────────────────────────────────────────────────────────
# Allow the Express backend (proxy) and the Vite dev server.
ALLOWED_ORIGINS = os.environ.get(
    "AI_CORS_ORIGINS",
    "http://localhost:5000,http://localhost:5173,http://localhost:5174",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # locked down in production via env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(img_router, prefix="/api/ai", tags=["Image Processing"])


# ── Startup: pre-warm rembg / InsightFace sessions ───────────────────────────
@app.on_event("startup")
async def startup_event():
    """
    Download / initialise the rembg U2Net model in a background thread so the
    very first photo upload responds quickly instead of waiting for a cold
    model download (≈ 180 MB on first run, instant on subsequent starts).
    """
    def _warm():
        try:
            from services.photo_editor import init_sessions
            init_sessions()
            print("[AI Service] OK rembg / InsightFace sessions ready")
        except Exception as exc:
            print(f"[AI Service] WARN Pre-warm failed - will init on first request: {exc}")
    threading.Thread(target=_warm, daemon=True).start()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-image-processing"}


# ── Dev entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("AI_PORT", 8001))
    # reload=False: on Windows, uvicorn's WatchFiles reload triggers
    # "Terminate batch job (Y/N)?" which kills the concurrently process group.
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
