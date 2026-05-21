/**
 * API Service Layer
 * Handles all communication with the backend MongoDB API
 * Falls back to localStorage if API unavailable
 */

function getApiBaseEnv(): string | undefined {
  const env = (import.meta as any).env as Record<string, string | boolean | undefined>;
  const value = env.VITE_API_BASE_URL || env.VITE_API_URL;
  return typeof value === 'string' ? value.trim() : undefined;
}

function resolveApiBase(): string {
  const raw = getApiBaseEnv();
  if (!raw) return '/api';

  const normalized = raw.replace(/\/$/, '');
  if (normalized.endsWith('/api')) {
    return normalized;
  }
  return `${normalized}/api`;
}

function resolveBackendOrigin(): string {
  const raw = getApiBaseEnv();
  if (!raw) {
    // No env var set: use the current page's origin so that the Render proxy
    // routes (/uploads/*, /api/*) or the Vite dev-server proxy handle requests.
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).origin;
    } catch {
      return '';
    }
  }

  // Relative path (e.g. "/api") – same-origin deployment or proxied via render.yaml.
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export const BACKEND_ORIGIN = resolveBackendOrigin();

/** Resolves the origin that serves /uploads/ assets.
 * Priority: VITE_UPLOADS_BASE_URL > empty string (relative, proxied by Vite).
 * Returning '' means all /uploads/* requests use a relative path, which the
 * Vite dev-server proxy silently forwards to the real file server — no CORS.
 */
function resolveUploadsOrigin(): string {
  const env = (import.meta as any).env as Record<string, string | boolean | undefined>;
  const raw = typeof env.VITE_UPLOADS_BASE_URL === 'string' ? env.VITE_UPLOADS_BASE_URL.trim() : undefined;
  if (raw) {
    const normalized = raw.replace(/\/$/, '');
    try { return new URL(normalized).origin; } catch { return normalized; }
  }
  // No explicit override → use relative paths so the Vite proxy (or same-origin
  // production deploy) handles the request without CORS.
  return '';
}

export const UPLOADS_ORIGIN = resolveUploadsOrigin();
export const UPLOADS_BASE_URL = `${UPLOADS_ORIGIN}/uploads/`;
if (typeof window !== 'undefined') {
  console.info('[apiService] API_BASE', resolveApiBase());
  console.info('[apiService] BACKEND_ORIGIN', BACKEND_ORIGIN);
  console.info('[apiService] UPLOADS_ORIGIN', UPLOADS_ORIGIN);
}

/** Hostinger server that stores all uploaded files. */
export const HOSTINGER_UPLOADS_ORIGIN = 'http://72.62.241.170';

export function resolveProfileImageUrl(profilePic?: string): string {
  const raw = String(profilePic || '').trim();
  if (!raw) return '';

  // Reject any data: URI that is not a valid image data URL — these are corrupt/partial
  // values (e.g. 'data:J,1') that would be URL-encoded and resolved as broken paths.
  if (/^data:/i.test(raw)) {
    return /^data:image\//i.test(raw) ? raw : '';
  }

  if (/^blob:/i.test(raw)) {
    return raw;
  }

  // Absolute localhost/127.0.0.1 URL pointing to /uploads/ or /images/:
  // Strip the local origin so the path becomes relative. In development the Vite
  // proxy forwards /uploads/* and /images/* to the local Express backend.
  // In production (same-origin deploy) they hit the backend directly.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/(uploads|images)\//i.test(raw)) {
    return raw.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i, '/');
  }

  // Other absolute URLs: return as-is (Hostinger SFTP absolute URL, CDN, etc.).
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const normalized = raw.replace(/\\/g, '/');

  // Encode a single path segment safely:
  // - Decode first to prevent double-encoding if the value is already percent-encoded.
  // - Re-encode with encodeURIComponent but restore commas (valid in filenames,
  //   and nginx serves files with commas in their names without decoding %2C).
  const encodeSeg = (seg: string) => {
    let decoded: string;
    try { decoded = decodeURIComponent(seg); } catch { decoded = seg; }
    return encodeURIComponent(decoded).replace(/%2C/gi, ',');
  };
  const encodeSegments = (filePath: string) => filePath.split('/').map(encodeSeg).join('/');

  // Relative paths starting with /uploads/ or /images/ — served by backend static middleware.
  // UPLOADS_ORIGIN is '' by default (same-origin / Vite proxy). Set VITE_UPLOADS_BASE_URL
  // in frontend .env only for cross-origin deployments where uploads live on a separate host.
  if (normalized.startsWith('/uploads/')) {
    return `${UPLOADS_ORIGIN}/uploads/${encodeSegments(normalized.slice('/uploads/'.length))}`;
  }

  if (normalized.startsWith('/images/')) {
    return `${UPLOADS_ORIGIN}/images/${encodeSegments(normalized.slice('/images/'.length))}`;
  }

  if (normalized.startsWith('uploads/')) {
    return `${UPLOADS_ORIGIN}/uploads/${encodeSegments(normalized.slice('uploads/'.length))}`;
  }

  if (normalized.startsWith('/')) {
    return `${UPLOADS_ORIGIN}${normalized}`;
  }

  if (normalized.includes('/')) {
    return `${UPLOADS_BASE_URL}${encodeSegments(normalized)}`;
  }

  // Bare filename — just encode and append to uploads base.
  return `${UPLOADS_BASE_URL}${encodeURIComponent(normalized)}`;
}

export const API_BASE = resolveApiBase();

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as ApiResponse<T>;
  }

  const text = await response.text();
  return {
    success: response.ok,
    error: text || `Request failed with status ${response.status}`,
  };
}

// ─────────────────────────────────────────────────────────────
//  Projects API
// ─────────────────────────────────────────────────────────────

export async function fetchProjects(clientId?: string) {
  try {
    const url = clientId
      ? `${API_BASE}/projects?clientId=${encodeURIComponent(clientId)}`
      : `${API_BASE}/projects`;
    const response = await fetch(url);
    const result = await response.json() as ApiResponse<any[]>;
    return result.data || [];
  } catch (error) {
    console.warn('Projects API error, using localStorage:', error);
    return null;
  }
}

export async function fetchProjectById(id: string) {
  try {
    const response = await fetch(`${API_BASE}/projects/${id}`);
    const result = await response.json() as ApiResponse<any>;
    return result.data || null;
  } catch (error) {
    console.warn('Project API error:', error);
    return null;
  }
}

export async function createProject(data: Record<string, any>) {
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json() as ApiResponse<any>;
    return result.data;
  } catch (error) {
    console.error('Create project failed:', error);
    return null;
  }
}

export async function updateProject(id: string, data: Record<string, any>) {
  try {
    const response = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json() as ApiResponse<any>;
    return result.data;
  } catch (error) {
    console.error('Update project failed:', error);
    return null;
  }
}

export async function deleteProject(id: string) {
  try {
    const response = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      console.error('Delete project failed:', body.error ?? response.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Delete project failed:', error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
//  Clients API
// ─────────────────────────────────────────────────────────────

export async function fetchClients() {
  try {
    const response = await fetch(`${API_BASE}/clients`);
    const result = await response.json() as ApiResponse<any[]>;
    return result.data || [];
  } catch (error) {
    console.warn('Clients API error, using localStorage:', error);
    return null;
  }
}

export async function createClient(data: Record<string, any>) {
  try {
    const response = await fetch(`${API_BASE}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await parseApiResponse<any>(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Failed to create client (HTTP ${response.status})`);
    }

    return result.data;
  } catch (error) {
    console.error('Create client failed:', error);
    throw error;
  }
}

export async function updateClient(id: string, data: Record<string, any>) {
  try {
    const response = await fetch(`${API_BASE}/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await parseApiResponse<any>(response);
    if (!response.ok || !result.success) {
      throw new Error(result.error || `Failed to update client (HTTP ${response.status})`);
    }

    return result.data;
  } catch (error) {
    console.error('Update client failed:', error);
    throw error;
  }
}

export async function deleteClient(id: string) {
  try {
    await fetch(`${API_BASE}/clients/${id}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.error('Delete client failed:', error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
//  Products API
// ─────────────────────────────────────────────────────────────

export async function fetchProducts() {
  try {
    const response = await fetch(`${API_BASE}/products`);
    const result = await response.json() as ApiResponse<any[]>;
    return result.data || [];
  } catch (error) {
    console.warn('Products API error, using localStorage:', error);
    return null;
  }
}

export async function createProduct(data: Record<string, any>) {
  try {
    const response = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json() as ApiResponse<any>;
    return result.data;
  } catch (error) {
    console.error('Create product failed:', error);
    return null;
  }
}

export async function updateProduct(id: string, data: Record<string, any>) {
  try {
    const response = await fetch(`${API_BASE}/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json() as ApiResponse<any>;
    return result.data;
  } catch (error) {
    console.error('Update product failed:', error);
    return null;
  }
}

export async function deleteProduct(id: string) {
  try {
    await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.error('Delete product failed:', error);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
//  Health Check
// ─────────────────────────────────────────────────────────────

export async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE.replace('/api', '')}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
//  Image Upload API
// ─────────────────────────────────────────────────────────────

/**
 * Upload one or more image files to the backend.
 * Returns an array of server-relative URL paths like ["/uploads/1234-photo.jpg"].
 * These paths are safe to store in records and resolve via resolveProfileImageUrl().
 */
export async function uploadImages(files: File[]): Promise<string[]> {
  if (!files.length) return [];

  const form = new FormData();
  files.forEach((f) => form.append('images', f));

  const response = await fetch(`${API_BASE}/upload-images`, {
    method: 'POST',
    body: form,
  });

  // Backend returns { success, urls } directly — no `data` wrapper
  const json = await response.json() as { success: boolean; urls?: string[]; error?: string };
  if (!json.success || !Array.isArray(json.urls)) {
    throw new Error(json.error || 'Image upload failed');
  }
  return json.urls;
}

// ─────────────────────────────────────────────────────────────
//  ZIP Bulk Image Upload API
// ─────────────────────────────────────────────────────────────

/** One uploaded file returned by the backend ZIP extract-and-upload route. */
export interface ZipUploadFileEntry {
  filename: string;
  url: string;
}

/**
 * Response from POST /api/upload-images/zip.
 * The backend now only extracts + uploads; matching is done on the frontend
 * using the same matchImages() engine as folder upload.
 */
export interface ZipUploadSummary {
  success: boolean;
  total: number;
  uploaded: number;
  files: ZipUploadFileEntry[];
  errors: string[];
}

/**
 * Upload a ZIP file to the backend.
 * The server extracts images and uploads each to Hostinger / local disk.
 * Returns the list of {filename, url} pairs — matching is done on the
 * frontend by the caller using matchImages().
 *
 * @param zipFile ZIP File object from an <input type="file"> element
 */
export async function uploadZipImages(
  zipFile: File,
  _projectId?: string,
  _category?: string,
): Promise<ZipUploadSummary> {
  const form = new FormData();
  form.append('zip', zipFile);

  const response = await fetch(`${API_BASE}/upload-images/zip`, {
    method: 'POST',
    body: form,
  });

  const json = await response.json() as ZipUploadSummary & { error?: string };
  if (!json.success) {
    throw new Error(json.error || 'ZIP upload failed');
  }
  // Defensive: ensure files array exists even if backend returned old format
  if (!Array.isArray(json.files)) {
    json.files = [];
  }
  return json;
}

// ─────────────────────────────────────────────────────────────
//  Project Data Records API
// ─────────────────────────────────────────────────────────────

/**
 * Load all data records for a project + category from the backend.
 * Returns null on network failure so callers can fall back to localStorage.
 */
export async function fetchProjectRecords(
  projectId: string,
  category: string
): Promise<Record<string, any>[] | null> {
  try {
    const url = `${API_BASE}/projects/${encodeURIComponent(projectId)}/records?category=${encodeURIComponent(category)}`;
    const response = await fetch(url);
    const result = await parseApiResponse<Record<string, any>[]>(response);
    return result.success && Array.isArray(result.data) ? result.data : null;
  } catch (error) {
    console.warn('[apiService] fetchProjectRecords error:', error);
    return null;
  }
}

/**
 * Persist all data records for a project + category to the backend (bulk replace).
 * Returns true on success, false on failure (never throws).
 */
export async function saveProjectRecords(
  projectId: string,
  category: string,
  records: Record<string, any>[]
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, records }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[apiService] saveProjectRecords failed:', response.status, body);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[apiService] saveProjectRecords error:', error);
    return false;
  }
}

/**
 * Delete ALL records for a project + category from the database AND remove their
 * associated photo files from the server's uploads directory.
 * Called when the user clicks "Delete All Student Records".
 */
export async function deleteProjectRecords(
  projectId: string,
  category: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/records?category=${encodeURIComponent(category)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[apiService] deleteProjectRecords failed:', response.status, body);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[apiService] deleteProjectRecords error:', error);
    return false;
  }
}

/**
 * Update the photo URL of a single record without replacing the whole collection.
 * Useful for updating individual record photos after a single-image upload.
 */
export async function updateRecordPhoto(
  projectId: string,
  category: string,
  frontendId: string,
  photoUrl: string
): Promise<void> {
  try {
    await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/records/photo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, frontendId, photoUrl }),
    });
  } catch (error) {
    console.warn('[apiService] updateRecordPhoto error:', error);
  }
}
