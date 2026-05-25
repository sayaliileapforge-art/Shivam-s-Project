import { API_BASE as API_ROOT, resolveProfileImageUrl } from './apiService';
import type { ProjectTemplate } from './projectStore';

export interface TemplateRecord {
  _id: string;
  productId: string;
  projectId?: string;
  createdBy?: string;
  isGlobal?: boolean;
  templateName: string;
  description?: string;
  category: 'Business' | 'Wedding' | 'Minimal' | 'Corporate' | 'Festival' | 'Other';
  previewImageUrl?: string;
  preview_image?: string;
  imageUrl?: string;
  designFileUrl?: string;
  designData: Record<string, any>;
  isActive: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const TEMPLATE_API_BASE = `${API_ROOT}/templates`;

// ── Module-level in-memory cache ─────────────────────────────────────────────
// Survives component unmount/remount and navigation.
const CACHE_TTL = 5 * 60_000;          // 5 minutes — in-memory / sessionStorage
const LS_CACHE_TTL = 30 * 60_000;      // 30 minutes — localStorage (persistent across sessions)
const SESSION_CACHE_KEY = 'tg_gallery_cache_v3';
const LS_CACHE_KEY      = 'tg_gallery_ls_v3';
const LS_PROJECT_PREFIX = 'tg_proj_v3_';

interface CacheEntry { data: TemplateRecord[]; fetchedAt: number }

let _galleryCache: CacheEntry | null = null;
const _projectCache = new Map<string, CacheEntry>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeReadStorage(storage: Storage, key: string, ttl: number): TemplateRecord[] | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: TemplateRecord[]; fetchedAt: number };
    if (Date.now() - parsed.fetchedAt < ttl) return parsed.data;
    return null;
  } catch { return null; }
}

function safeWriteStorage(storage: Storage, key: string, data: TemplateRecord[]): void {
  try {
    storage.setItem(key, JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch { /* quota exceeded – ignore */ }
}

/** Persist gallery list to sessionStorage (hot-reload) and localStorage (cross-session). */
function writeSessionCache(data: TemplateRecord[]): void {
  safeWriteStorage(sessionStorage, SESSION_CACHE_KEY, data);
  safeWriteStorage(localStorage,   LS_CACHE_KEY,      data);
}

function readSessionCache(): TemplateRecord[] | null {
  return safeReadStorage(sessionStorage, SESSION_CACHE_KEY, CACHE_TTL);
}

function readLocalStorageCache(): TemplateRecord[] | null {
  return safeReadStorage(localStorage, LS_CACHE_KEY, LS_CACHE_TTL);
}

/** Return cached gallery data if still fresh, or null if stale/missing.
 *  Priority: memory → sessionStorage → localStorage */
export function getGalleryCacheData(): TemplateRecord[] | null {
  if (_galleryCache && Date.now() - _galleryCache.fetchedAt < CACHE_TTL) {
    return _galleryCache.data;
  }
  // sessionStorage — survives hot-reloads within the same tab
  const session = readSessionCache();
  if (session) {
    _galleryCache = { data: session, fetchedAt: Date.now() };
    return session;
  }
  // localStorage — survives across tabs and browser restarts (30 min TTL)
  const ls = readLocalStorageCache();
  if (ls) {
    _galleryCache = { data: ls, fetchedAt: Date.now() };
    safeWriteStorage(sessionStorage, SESSION_CACHE_KEY, ls); // re-populate sessionStorage
    return ls;
  }
  return null;
}

/** Return cached per-project template list if still fresh, or null.
 *  Priority: memory → localStorage */
export function getProjectTemplateCacheData(projectId: string): TemplateRecord[] | null {
  const entry = _projectCache.get(projectId);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL) return entry.data;
  // localStorage fallback so data survives page refresh
  const ls = safeReadStorage(localStorage, `${LS_PROJECT_PREFIX}${projectId}`, LS_CACHE_TTL);
  if (ls) {
    _projectCache.set(projectId, { data: ls, fetchedAt: Date.now() });
    return ls;
  }
  return null;
}

/** Wipe all template list caches (call after create/update/delete). */
export function invalidateTemplateCache(projectId?: string): void {
  _galleryCache = null;
  try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LS_CACHE_KEY); } catch { /* ignore */ }
  if (projectId) {
    _projectCache.delete(projectId);
    try { localStorage.removeItem(`${LS_PROJECT_PREFIX}${projectId}`); } catch { /* ignore */ }
  } else {
    _projectCache.clear();
    // Remove all per-project localStorage keys
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(LS_PROJECT_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }
}

/** Populate the per-project cache (call after a successful fetch). */
export function setProjectTemplateCacheData(projectId: string, data: TemplateRecord[]): void {
  _projectCache.set(projectId, { data, fetchedAt: Date.now() });
  safeWriteStorage(localStorage, `${LS_PROJECT_PREFIX}${projectId}`, data);
}

export function generatePreview(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

type ResolveTemplatePreviewOptions = {
  fallbackToPlaceholder?: boolean;
};

export function resolveTemplatePreview(
  template: Pick<TemplateRecord, 'preview_image' | 'previewImageUrl'> | null | undefined,
  options: ResolveTemplatePreviewOptions = {}
): string {
  const fallbackToPlaceholder = options.fallbackToPlaceholder ?? true;
  const raw = String(template?.preview_image || template?.previewImageUrl || '').trim();

  if (!raw) {
    return fallbackToPlaceholder ? '/placeholder.png' : '';
  }

  // Reject corrupt data URIs like "data:," or "data:J,1".
  if (/^data:/i.test(raw) && !/^data:image\//i.test(raw)) {
    return fallbackToPlaceholder ? '/placeholder.png' : '';
  }

  if (/^(data:image\/|blob:|https?:\/\/)/i.test(raw)) {
    return raw;
  }

  const resolved = resolveProfileImageUrl(raw);
  if (resolved) return resolved;

  return fallbackToPlaceholder ? '/placeholder.png' : '';
}

type TemplateSaveInput = {
  /** Use projectId for templates that belong to a project (preferred). */
  projectId?: string;
  /** Legacy: product-scoped template ID. Kept for backward compatibility. */
  productId?: string;
  templateName: string;
  userId?: string;
  description?: string;
  category?: TemplateRecord['category'];
  designFileUrl?: string;
  designData?: Record<string, any>;
  tags?: string[];
  isActive?: boolean;
  preview_image?: string;
  previewCanvas?: HTMLCanvasElement;
  isGlobal?: boolean;
  isPublic?: boolean;
};

type TemplateUploadInput = {
  productId: string;
  title: string;
  userId?: string;
  description?: string;
  category?: TemplateRecord['category'];
  designData?: Record<string, any>;
  tags?: string[];
  isActive?: boolean;
  imageFile: File;
};

function resolvePreviewForSave(input: TemplateSaveInput): string {
  if (input.preview_image) return input.preview_image;
  if (input.previewCanvas) return generatePreview(input.previewCanvas);
  return '';
}

async function handleResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let json: { success?: boolean; data?: T; error?: string; message?: string } = {};

  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(raw || `Request failed with status ${response.status}`);
    }
  }

  if (!response.ok || json.success === false) {
    throw new Error(json.error || json.message || `Request failed with status ${response.status}`);
  }

  return json.data as T;
}

export async function getTemplatesByProductId(productId: string, params?: { category?: string; search?: string }): Promise<TemplateRecord[]> {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.search) query.set('search', params.search);
  const queryString = query.toString();

  const requestUrl = `${TEMPLATE_API_BASE}/product/${productId}${queryString ? `?${queryString}` : ''}`;
  const response = await fetch(requestUrl);
  const payload = await handleResponse<TemplateRecord[]>(response);

  console.info('[templateApi] /api/templates response', {
    url: requestUrl,
    status: response.status,
    count: Array.isArray(payload) ? payload.length : 0,
  });

  return payload;
}

export async function getTemplates(params?: { productId?: string; signal?: AbortSignal }): Promise<TemplateRecord[]> {
  const query = new URLSearchParams();
  if (params?.productId) query.set('productId', params.productId);
  const requestUrl = `${TEMPLATE_API_BASE}${query.toString() ? `?${query}` : ''}`;

  // Use module-level cache for the unfiltered gallery list
  if (!params?.productId) {
    const cached = getGalleryCacheData();
    if (cached) return cached;
  }

  const response = await fetch(requestUrl, { signal: params?.signal });
  const payload = await handleResponse<TemplateRecord[]>(response);
  console.info('[templateApi] GET templates', {
    url: requestUrl,
    status: response.status,
    count: Array.isArray(payload) ? payload.length : 0,
  });

  // Store in cache
  if (!params?.productId) {
    _galleryCache = { data: payload, fetchedAt: Date.now() };
    writeSessionCache(payload);
  }

  return payload;
}

export async function getTemplateById(templateId: string, options?: { timeoutMs?: number }): Promise<TemplateRecord> {
  const requestUrl = `${TEMPLATE_API_BASE}/${templateId}`;
  const signal = options?.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
  const response = await fetch(requestUrl, { signal });
  console.info('[templateApi] GET template by id', { url: requestUrl, status: response.status });
  return handleResponse<TemplateRecord>(response);
}

export async function createTemplate(input: TemplateSaveInput): Promise<TemplateRecord> {
  const preview = resolvePreviewForSave(input);
  const response = await fetch(TEMPLATE_API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      preview_image: preview,
      previewImageUrl: preview,
    }),
  });

  const result = await handleResponse<TemplateRecord>(response);
  // Prefer projectId for targeted invalidation; fall back to legacy productId logic.
  const cacheKey = input.projectId
    ?? (input.productId?.length === 24 ? undefined : input.productId);
  invalidateTemplateCache(cacheKey);
  return result;
}

export async function createTemplateWithImage(input: TemplateUploadInput): Promise<TemplateRecord> {
  const formData = new FormData();
  formData.append('image', input.imageFile);
  formData.append('productId', input.productId);
  formData.append('title', input.title);
  if (input.userId) formData.append('userId', input.userId);
  if (input.description) formData.append('description', input.description);
  if (input.category) formData.append('category', input.category);
  if (input.designData) formData.append('designData', JSON.stringify(input.designData));
  if (input.tags) formData.append('tags', JSON.stringify(input.tags));
  if (typeof input.isActive === 'boolean') formData.append('isActive', String(input.isActive));

  const response = await fetch(TEMPLATE_API_BASE, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<TemplateRecord>(response);
}

export async function updateTemplate(templateId: string, input: Partial<TemplateSaveInput>): Promise<TemplateRecord> {
  const preview = resolvePreviewForSave(input as TemplateSaveInput);
  const response = await fetch(`${TEMPLATE_API_BASE}/${templateId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      ...(preview ? { preview_image: preview, previewImageUrl: preview } : {}),
    }),
  });

  const result = await handleResponse<TemplateRecord>(response);
  // Invalidate the cache so ProjectDetail picks up the updated thumbnail/canvasJSON
  // when the user navigates back from Designer Studio.
  const cacheKey = input.projectId
    ?? (input.productId?.length === 24 ? undefined : input.productId);
  invalidateTemplateCache(cacheKey);
  return result;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const response = await fetch(`${TEMPLATE_API_BASE}/${templateId}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(response);
  invalidateTemplateCache();
}

export async function saveSelectedTemplate(input: {
  userId?: string;
  productId: string;
  templateId: string;
  action: 'customize' | 'direct_order';
  metadata?: Record<string, any>;
}): Promise<{ _id: string }> {
  const response = await fetch(`${TEMPLATE_API_BASE}/selection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<{ _id: string }>(response);
}

/**
 * Migrate localStorage project templates to MongoDB
 * This syncs locally-stored templates to the backend for persistence
 */
export async function migrateProjectTemplatesToDatabase(projectId: string, templates: any[]): Promise<{
  saved: Array<{ _id: string; templateName: string }>;
  errors: Array<{ templateName: string; error: string }>;
}> {
  console.log('[templateApi:migration] Starting migration', {
    projectId,
    count: templates.length,
  });

  const response = await fetch(`${TEMPLATE_API_BASE}/migration/sync-project-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      templates: templates.map(t => ({
        id: t.id,
        templateName: t.templateName,
        templateType: t.templateType,
        canvas: t.canvas,
        margin: t.margin,
        thumbnail: t.thumbnail,
        isPublic: t.isPublic,
        applicableFor: t.applicableFor,
      })),
    }),
  });

  const result = await handleResponse<{
    saved: Array<{ _id: string; templateName: string }>;
    errors: Array<{ templateName: string; error: string }>;
  }>(response);

  console.log('[templateApi:migration] Migration complete', {
    saved: result.saved.length,
    errors: result.errors.length,
  });

  return result;
}

// ── Local cache helpers ───────────────────────────────────────────────────────

const LOCAL_CACHE_PREFIX = 'template_cache_';

export function readTemplateFromLocalCache(id: string): TemplateRecord | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_PREFIX + id);
    return raw ? (JSON.parse(raw) as TemplateRecord) : null;
  } catch {
    return null;
  }
}

export function writeTemplateToLocalCache(id: string, record: TemplateRecord): void {
  try {
    localStorage.setItem(LOCAL_CACHE_PREFIX + id, JSON.stringify(record));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

export async function uploadTemplatePreview(templateId: string, dataUrl: string): Promise<string> {
  try {
    const response = await fetch(`${TEMPLATE_API_BASE}/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_image: dataUrl, previewImageUrl: dataUrl }),
    });
    if (!response.ok) return dataUrl;
    const json = await response.json().catch(() => ({}));
    return (json?.data?.preview_image || json?.data?.previewImageUrl || dataUrl) as string;
  } catch {
    return dataUrl;
  }
}

export function mapTemplateRecordToProjectTemplate(t: TemplateRecord): Omit<ProjectTemplate, 'createdAt'> {
  const dd = t.designData as Record<string, any> | undefined;
  const canvasW = dd?.width ?? dd?.canvas?.width ?? 800;
  const canvasH = dd?.height ?? dd?.canvas?.height ?? 600;
  return {
    id: t._id,
    remoteId: t._id,
    projectId: t.projectId ?? '',
    templateName: t.templateName,
    templateType: (dd?.templateType ?? 'custom') as ProjectTemplate['templateType'],
    canvas: { width: Number(canvasW), height: Number(canvasH) },
    margin: dd?.margin ?? { top: 0, left: 0, right: 0, bottom: 0 },
    applicableFor: dd?.applicableFor ?? '',
    canvasJSON: dd?.canvasJSON ?? dd?.canvasJson ?? undefined,
    thumbnail: t.preview_image || t.previewImageUrl || undefined,
    isPublic: t.isGlobal ?? false,
  };
}
