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
  const file = await imageSourceToFile(imageSrc, filename);
  const fd = new FormData();
  fd.append('image', file);
  fd.append('bg_color', bgColor);
  fd.append('model_name', modelName);

  const res = await fetch(`${AI_BASE}/remove-bg`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Background removal failed');
  return json as ProcessedImageResult;
}

export async function removeBgBulk(
  images: Array<{ src: string; filename: string }>,
  bgColor: BgColor = 'transparent',
  modelName = 'u2net_human_seg',
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
  fd.append('bg_color', bgColor);
  fd.append('model_name', modelName);

  const res = await fetch(`${AI_BASE}/remove-bg/bulk`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Bulk background removal failed');
  return json as BulkProcessResult;
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

  const res = await fetch(`${AI_BASE}/photo-edit/batch`, { method: 'POST', body: fd });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Batch failed');
  return json as PhotoEditorBatchResult;
}

