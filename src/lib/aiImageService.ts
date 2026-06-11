/**
 * AI Image Processing Service — TypeScript client
 *
 * Wraps all calls to the Python FastAPI service (proxied through the
 * Express backend at  /api/ai/*  →  http://localhost:8001/api/ai/* ).
 *
 * All functions return plain data objects; error handling is done by
 * throwing descriptive Error instances so callers can surface them in
 * toast notifications.
 */

import { API_BASE } from './apiService';

// The AI service is proxied through the Express backend so the frontend
// only ever calls /api/ai/* (same origin in both dev and production).
const AI_BASE = `${API_BASE}/ai`;

// ── Types ──────────────────────────────────────────────────────────────────────

export type BgColor = 'transparent' | 'white' | 'black' | string; // string = hex

export type AspectRatio = '1:1' | '3:4' | '2:3' | 'passport' | 'id_card' | string;

export interface ProcessedImageResult {
  success: boolean;
  filename: string;
  data_url?: string;
  error?: string;
}

export interface BulkProcessResult {
  total: number;
  processed: number;
  failed: number;
  results: ProcessedImageResult[];
}

export interface BarcodeItem {
  record_id: string;
  value: string;
  label?: string;
}

export interface BarcodeResult {
  record_id: string;
  success: boolean;
  data_url?: string;
  error?: string;
}

export interface BarcodeResponse {
  total: number;
  processed: number;
  failed: number;
  results: BarcodeResult[];
}

export type BarcodeType = 'code128' | 'qr' | 'ean13';

export interface AIServiceHealth {
  status: string;
  mediapipe: boolean;
  rembg: boolean;
  barcode_lib: boolean;
  qr_lib: boolean;
}

// ── Progress callback ──────────────────────────────────────────────────────────

export type ProgressCallback = (done: number, total: number) => void;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Images per HTTP request to the AI service.
 *  5 images per batch: server semaphore throttles ONNX to 2–4 concurrent
 *  inferences per request, so a batch of 5 completes in ~10–25 s on CPU.
 *  Smaller batches also mean the progress bar advances more frequently. */
const BG_BATCH_SIZE = 5;

/** How many batch HTTP requests run concurrently.
 *  2 keeps both HTTP connections busy and the server's CPU semaphore
 *  (2–4 slots) saturated without flooding it. */
const BG_PARALLEL_BATCHES = 2;

/** Maximum image dimension (px) sent to the AI service.
 *  rembg U2Net runs inference at 320 px internally, so 500 px is more than
 *  enough for the mask and cuts upload payload ~6× vs the original 1200 px. */
const AI_MAX_DIM = 500;

/** Convert a data URL to a File object. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], filename, { type: mime });
}

/** Fetch a remote image URL and return a File. */
async function urlToFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

/** Convert any image source (data URL, blob URL, relative path, absolute URL) to a File. */
export async function imageSourceToFile(src: string, filename: string): Promise<File> {
  if (src.startsWith('data:')) return dataUrlToFile(src, filename);
  return urlToFile(src, filename);
}

/**
 * Compress and resize an image for AI upload.
 * - Downscales to AI_MAX_DIM if larger (preserves aspect ratio).
 * - Re-encodes as JPEG at 0.88 quality (or PNG for transparent filenames).
 * - Reduces upload payload size significantly for high-res photos.
 */
async function compressImageForAI(src: string, filename: string): Promise<File> {
  // Fetch the image as a data URL or blob first
  let objectUrl: string | null = null;
  try {
    let dataUrl: string;
    if (src.startsWith('data:')) {
      dataUrl = src;
    } else {
      const res = await fetch(src, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to fetch image: ${src}`);
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      dataUrl = objectUrl;
    }

    return await new Promise<File>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');

        if (maxDim <= AI_MAX_DIM) {
          // Already small enough — return as-is without re-encoding
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        } else {
          const scale = AI_MAX_DIM / maxDim;
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas 2D not available')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const isPng = filename.toLowerCase().endsWith('.png');
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            resolve(new File([blob], filename, { type: isPng ? 'image/png' : 'image/jpeg' }));
          },
          isPng ? 'image/png' : 'image/jpeg',
          isPng ? undefined : 0.88,
        );
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`));
      img.src = dataUrl;
    });
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI service returned non-JSON response (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

// ── Health check ────────────────────────────────────────────────────────────────

export async function checkAIServiceHealth(): Promise<AIServiceHealth> {
  const res = await fetch(`${AI_BASE}/health`);
  if (!res.ok) throw new Error('AI service is not reachable. Is the Python service running?');
  return res.json();
}

// ── Auto-Crop ──────────────────────────────────────────────────────────────────

/**
 * Smart-crop a single image to the target aspect ratio using face detection.
 */
export async function autoCropSingle(
  imageSrc: string,
  filename: string,
  aspectRatio: AspectRatio = '1:1',
  paddingPct = 0.15,
): Promise<ProcessedImageResult> {
  const file = await imageSourceToFile(imageSrc, filename);
  const fd = new FormData();
  fd.append('image', file);
  fd.append('aspect_ratio', aspectRatio);
  fd.append('padding_pct', String(paddingPct));

  const res = await fetch(`${AI_BASE}/auto-crop`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Auto-crop failed');
  return json as ProcessedImageResult;
}

/**
 * Smart-crop multiple images in a single round-trip.
 * onProgress(done, total) is called after each image is collected.
 */
export async function autoCropBulk(
  images: Array<{ src: string; filename: string }>,
  aspectRatio: AspectRatio = '1:1',
  paddingPct = 0.15,
  onProgress?: ProgressCallback,
): Promise<BulkProcessResult> {
  const files = await Promise.all(
    images.map(async ({ src, filename }, i) => {
      const f = await imageSourceToFile(src, filename);
      onProgress?.(i + 1, images.length);
      return f;
    })
  );

  const fd = new FormData();
  files.forEach((f) => fd.append('images', f));
  fd.append('aspect_ratio', aspectRatio);
  fd.append('padding_pct', String(paddingPct));

  const res = await fetch(`${AI_BASE}/auto-crop/bulk`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Bulk auto-crop failed');
  return json as BulkProcessResult;
}

// ── Background Removal ────────────────────────────────────────────────────────

export async function removeBgSingle(
  imageSrc: string,
  filename: string,
  bgColor: BgColor = 'transparent',
  modelName = 'u2net_human_seg',
): Promise<ProcessedImageResult> {
  const file = await compressImageForAI(imageSrc, filename);
  const fd = new FormData();
  fd.append('image', file);
  fd.append('bg_color', bgColor);
  fd.append('model_name', modelName);

  const res = await fetch(`${AI_BASE}/remove-bg`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Background removal failed');
  return json as ProcessedImageResult;
}

/**
 * Remove backgrounds from multiple images using concurrent batched HTTP requests.
 *
 * Key design decisions:
 *   - Images are compressed in small groups (COMPRESS_CONCURRENCY = 4) just
 *     before they are uploaded rather than all up-front.  Pre-compressing all
 *     282 images fills the browser heap with ~50–100 MB of PNG Blob data and
 *     can trigger a GC pause that freezes the UI.
 *   - BG_BATCH_SIZE = 5: smaller batches mean the server semaphore throttles
 *     only 5 concurrent ONNX calls per request (not 10–20), and the progress
 *     bar advances every ~5 images for a responsive feel.
 *   - BG_PARALLEL_BATCHES = 2: two concurrent HTTP requests keeps the server
 *     busy without overwhelming its CPU semaphore (_N_REMBG = 2–4 slots).
 *   - Each fetch has a hard 8-minute AbortController timeout so a hung server
 *     request never blocks the pipeline indefinitely.
 *   - Results preserve insertion order regardless of which batch finishes first.
 */

/** Max simultaneous canvas compress operations (browser-side). */
const COMPRESS_CONCURRENCY = 4;

/** Per-batch HTTP request timeout (ms).  5 images × 10 s each (worst case) = 50 s
 *  plus network overhead — 8 min is a safe ceiling that still lets a truly
 *  hung request be detected and marked as failed. */
const BATCH_FETCH_TIMEOUT_MS = 8 * 60 * 1000;

export async function removeBgBulk(
  images: Array<{ src: string; filename: string }>,
  bgColor: BgColor = 'transparent',
  modelName = 'u2net_human_seg',
  onProgress?: ProgressCallback,
  onPrepare?: ProgressCallback,
): Promise<BulkProcessResult> {
  const total = images.length;
  const orderedResults: ProcessedImageResult[] = new Array(total);
  let totalProcessed = 0;
  let totalFailed = 0;
  let completedImages = 0;
  let preparedCount = 0;

  /**
   * Compress a single-batch slice of images (COMPRESS_CONCURRENCY at once)
   * and fire the HTTP request.  Images are compressed immediately before
   * upload and the File objects are released once the request completes so
   * the browser heap never holds more than 2×BG_BATCH_SIZE images at once.
   */
  const executeBatch = async (
    batch: { startIdx: number; items: Array<{ src: string; filename: string }> },
  ): Promise<void> => {
    // Compress images in this batch with a sliding window of COMPRESS_CONCURRENCY
    const files: File[] = new Array(batch.items.length);
    for (let ci = 0; ci < batch.items.length; ci += COMPRESS_CONCURRENCY) {
      const slice = batch.items.slice(ci, ci + COMPRESS_CONCURRENCY);
      const compressed = await Promise.all(
        slice.map(({ src, filename }) => compressImageForAI(src, filename)),
      );
      compressed.forEach((f, j) => { files[ci + j] = f; });
      preparedCount += slice.length;
      onPrepare?.(Math.min(preparedCount, total), total);
    }

    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    fd.append('bg_color', bgColor);
    fd.append('model_name', modelName);

    // Abort the request if the server doesn't respond within the timeout so
    // a single stuck batch doesn't freeze the entire pipeline forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BATCH_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`${AI_BASE}/remove-bg/bulk`, {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      });
      const json = await parseJsonOrThrow(res);

      if (res.ok) {
        const batchResult = json as BulkProcessResult;
        batchResult.results.forEach((r, k) => {
          orderedResults[batch.startIdx + k] = r;
        });
        totalProcessed += batchResult.processed;
        totalFailed   += batchResult.failed;
      } else {
        const errMsg = (json as any).detail ?? (json as any).error ?? 'Server error';
        batch.items.forEach(({ filename }, k) => {
          orderedResults[batch.startIdx + k] = { success: false, filename, error: errMsg };
        });
        totalFailed += batch.items.length;
      }
    } catch (err: any) {
      // Timeout or network error — mark all images in this batch as failed
      // and continue so the rest of the pipeline is not blocked.
      const errMsg = err?.name === 'AbortError'
        ? 'Request timed out — server may be overloaded'
        : (err?.message ?? 'Network error');
      batch.items.forEach(({ filename }, k) => {
        orderedResults[batch.startIdx + k] = { success: false, filename, error: errMsg };
      });
      totalFailed += batch.items.length;
    } finally {
      clearTimeout(timer);
    }

    completedImages += batch.items.length;
    onProgress?.(Math.min(completedImages, total), total);
  };

  // Split into indexed batches
  const batches: Array<{ startIdx: number; items: Array<{ src: string; filename: string }> }> = [];
  for (let i = 0; i < total; i += BG_BATCH_SIZE) {
    batches.push({ startIdx: i, items: images.slice(i, i + BG_BATCH_SIZE) });
  }

  // Run BG_PARALLEL_BATCHES concurrently, then advance the sliding window.
  // This keeps 2 HTTP requests in flight at all times without pre-loading
  // all 282 compressed files into memory.
  for (let i = 0; i < batches.length; i += BG_PARALLEL_BATCHES) {
    const group = batches.slice(i, i + BG_PARALLEL_BATCHES);
    await Promise.all(group.map(executeBatch));
  }

  return {
    total,
    processed: totalProcessed,
    failed: totalFailed,
    results: orderedResults.filter(Boolean) as ProcessedImageResult[],
  };
}

// ── Barcode Generation ────────────────────────────────────────────────────────

export async function generateBarcodes(
  items: BarcodeItem[],
  barcodeType: BarcodeType = 'code128',
  width = 300,
  height = 100,
): Promise<BarcodeResponse> {
  const fd = new FormData();
  fd.append('items', JSON.stringify(items));
  fd.append('barcode_type', barcodeType);
  fd.append('width', String(width));
  fd.append('height', String(height));

  const res = await fetch(`${AI_BASE}/barcode`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Barcode generation failed');
  return json as BarcodeResponse;
}


// ════════════════════════════════════════════════════════════════════════════
// AI PHOTO STUDIO (v7.4 port)
// ════════════════════════════════════════════════════════════════════════════

/** All settings passed to the photo editor (mirrors v7.4 sliders). */
export interface PhotoEditorSettings {
  enhance: number;        // 0–10, default 5
  exposure: number;       // -5 to +5, default 0
  colorTemp: number;      // -5 to +5, default 0
  sharpness: number;      // 0–10, default 5
  skin: number;           // 0–10, default 5
  colorGrade: string;     // natural | vivid | soft | warm
  cropMode: string;       // manual | smart_scale | strict
  padding: number;        // 2.5–7, default 4.5
  headroom: number;       // 0.05–0.45, default 0.20
  bgColor: string;        // hex, default #FFFFFF
  shadowColor: string;    // hex, default #222222
  gradient: string;       // preset name, default None
  glow: number;           // 0–100, default 40
  shadowSoft: number;     // 1–101, default 51
  shadowDist: number;     // 0–50, default 15
  format: string;         // output format preset
  jpegQuality: number;    // 60–98, default 82
  watermark: string;      // optional text
  balanceSkin: boolean;
  cleanHair: boolean;
  gfpgan: boolean;
}

export interface PhotoEditorUploadResult {
  success: boolean;
  session_id: string;
  preview: string;          // base64 JPEG data URL
  metrics?: Record<string, string>;
  error?: string;
}

export interface PhotoEditorRenderResult {
  success: boolean;
  data_url?: string;
  error?: string;
}

export interface PhotoEditorBatchResult {
  total: number;
  processed: number;
  failed: number;
  results: Array<{ success: boolean; filename: string; data_url?: string; error?: string }>;
}

/**
 * Upload image to Phase 1 (face detect + background remove).
 * Pass either a `file` (File object) or an `imageUrl` string.
 * When `imageUrl` is provided the Python service fetches the image server-side,
 * which avoids browser CORS restrictions on fetch().
 */
export async function photoEditorUpload(
  file: File | null,
  opts: { mode?: string; padding?: number; headroom?: number; gfpgan?: boolean; imageUrl?: string } = {},
): Promise<PhotoEditorUploadResult> {
  const fd = new FormData();
  if (file) fd.append('image', file);
  if (opts.imageUrl) fd.append('image_url', opts.imageUrl);
  if (opts.mode)     fd.append('mode', opts.mode);
  if (opts.padding !== undefined) fd.append('padding', String(opts.padding));
  if (opts.headroom !== undefined) fd.append('headroom', String(opts.headroom));
  if (opts.gfpgan !== undefined) fd.append('gfpgan', String(opts.gfpgan));

  const res = await fetch(`${AI_BASE}/photo-edit/upload`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) {
    return { success: false, session_id: '', preview: '', error: json.detail ?? json.error ?? 'Upload failed' };
  }
  return json as PhotoEditorUploadResult;
}

/**
 * Fast Phase 2 render — returns updated preview with current slider settings.
 * Requires a valid session_id from `photoEditorUpload`.
 */
export async function photoEditorRender(
  sessionId: string,
  settings: PhotoEditorSettings,
): Promise<PhotoEditorRenderResult> {
  const fd = new FormData();
  fd.append('session_id', sessionId);
  fd.append('enhance', String(settings.enhance));
  fd.append('exposure', String(settings.exposure));
  fd.append('color_temp', String(settings.colorTemp));
  fd.append('sharpness', String(settings.sharpness));
  fd.append('skin', String(settings.skin));
  fd.append('color_grade', settings.colorGrade);
  fd.append('crop_mode', settings.cropMode);
  fd.append('padding', String(settings.padding));
  fd.append('headroom', String(settings.headroom));
  fd.append('bg_color', settings.bgColor);
  fd.append('shadow_color', settings.shadowColor);
  fd.append('gradient', settings.gradient);
  fd.append('glow', String(settings.glow));
  fd.append('shadow_soft', String(settings.shadowSoft));
  fd.append('shadow_dist', String(settings.shadowDist));
  fd.append('jpeg_quality', String(settings.jpegQuality));
  fd.append('watermark', settings.watermark);
  fd.append('balance_skin', String(settings.balanceSkin));
  fd.append('clean_hair', String(settings.cleanHair));
  fd.append('gfpgan', String(settings.gfpgan));
  fd.append('format', settings.format);

  const res = await fetch(`${AI_BASE}/photo-edit/render`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) {
    return { success: false, error: json.detail ?? json.error ?? 'Render failed' };
  }
  return json as PhotoEditorRenderResult;
}

/**
 * Batch-process multiple images with the same settings.
 * Returns one JPEG per record.
 */
export async function photoEditorBatch(
  files: Array<File | null>,
  settings: PhotoEditorSettings,
  imageUrls?: Array<string | undefined>,
): Promise<PhotoEditorBatchResult> {
  const fd = new FormData();
  // Append files and URLs separately — each group is ordered independently.
  // IMPORTANT: Do NOT mix them in one loop; that causes duplicate entries.
  files.forEach((f) => { if (f) fd.append('images', f); });
  if (imageUrls) imageUrls.forEach((u) => { if (u) fd.append('image_urls', u); });
  fd.append('enhance', String(settings.enhance));
  fd.append('exposure', String(settings.exposure));
  fd.append('color_temp', String(settings.colorTemp));
  fd.append('sharpness', String(settings.sharpness));
  fd.append('skin', String(settings.skin));
  fd.append('color_grade', settings.colorGrade);
  fd.append('crop_mode', settings.cropMode);
  fd.append('padding', String(settings.padding));
  fd.append('headroom', String(settings.headroom));
  fd.append('bg_color', settings.bgColor);
  fd.append('shadow_color', settings.shadowColor);
  fd.append('gradient', settings.gradient);
  fd.append('glow', String(settings.glow));
  fd.append('shadow_soft', String(settings.shadowSoft));
  fd.append('shadow_dist', String(settings.shadowDist));
  fd.append('jpeg_quality', String(settings.jpegQuality));
  fd.append('watermark', settings.watermark);
  fd.append('balance_skin', String(settings.balanceSkin));
  fd.append('clean_hair', String(settings.cleanHair));
  fd.append('gfpgan', String(settings.gfpgan));
  fd.append('format', settings.format);

  const res = await fetch(`${AI_BASE}/photo-edit/batch`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Batch failed');
  return json as PhotoEditorBatchResult;
}

// ── Async Batch (non-blocking with polling progress) ──────────────────────────

export interface BatchAsyncStartResult {
  task_id: string;
  total: number;
}

export interface BatchTaskResult {
  index: number;
  name: string;
  data_url: string;
}

export interface BatchTaskError {
  index: number;
  name: string;
  error: string;
}

export interface BatchTaskStatus {
  task_id: string;
  status: 'running' | 'done';
  total: number;
  completed: number;
  success: number;
  failed: number;
  current: string;
  eta_seconds: number | null;
  results: BatchTaskResult[];
  errors: BatchTaskError[];
  done: boolean;
}

/**
 * Start an async batch processing job.
 * Returns immediately with {task_id, total}.
 * Poll `photoEditorBatchStatus` every ~1 s until `done === true`.
 *
 * All images must be reachable absolute URLs (the Python service fetches them
 * server-side). Convert data:/blob: images to server URLs with `uploadImages`
 * before calling this function.
 */
export async function photoEditorBatchStart(
  imageUrls: string[],
  studentNames: string[],
  settings: PhotoEditorSettings,
): Promise<BatchAsyncStartResult> {
  const fd = new FormData();
  fd.append('image_urls', JSON.stringify(imageUrls));
  fd.append('student_names', JSON.stringify(studentNames));
  fd.append('enhance', String(settings.enhance));
  fd.append('exposure', String(settings.exposure));
  fd.append('color_temp', String(settings.colorTemp));
  fd.append('sharpness', String(settings.sharpness));
  fd.append('skin', String(settings.skin));
  fd.append('color_grade', settings.colorGrade);
  fd.append('crop_mode', settings.cropMode);
  fd.append('padding', String(settings.padding));
  fd.append('headroom', String(settings.headroom));
  fd.append('bg_color', settings.bgColor);
  fd.append('shadow_color', settings.shadowColor);
  fd.append('gradient', settings.gradient);
  fd.append('glow', String(settings.glow));
  fd.append('shadow_soft', String(settings.shadowSoft));
  fd.append('shadow_dist', String(settings.shadowDist));
  fd.append('jpeg_quality', String(settings.jpegQuality));
  fd.append('watermark', settings.watermark);
  fd.append('balance_skin', String(settings.balanceSkin));
  fd.append('clean_hair', String(settings.cleanHair));
  fd.append('gfpgan', String(settings.gfpgan));
  fd.append('format', settings.format);

  const res = await fetch(`${AI_BASE}/photo-edit/batch-async`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Failed to start batch');
  return json as BatchAsyncStartResult;
}

/** Poll the status of a running async batch task. */
export async function photoEditorBatchStatus(taskId: string): Promise<BatchTaskStatus> {
  const res = await fetch(`${AI_BASE}/photo-edit/batch-status/${encodeURIComponent(taskId)}`);
  const json = await parseJsonOrThrow(res);
  if (!res.ok) {
    // Preserve the HTTP status on the error so the poller can tell a transient
    // "service restarting" (503) from a terminal "task gone" (404): the AI
    // service keeps its tasks in memory, so a 404 after a restart is unrecoverable
    // while a 503 just means we should keep waiting.
    const err = new Error(json.detail ?? json.error ?? 'Failed to get batch status') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as BatchTaskStatus;
}

/** Clean up a completed batch task on the server to free memory. */
export async function photoEditorBatchDelete(taskId: string): Promise<void> {
  await fetch(`${AI_BASE}/photo-edit/batch-task/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
}

