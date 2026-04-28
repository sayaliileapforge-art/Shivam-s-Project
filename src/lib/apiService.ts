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
export const UPLOADS_BASE_URL = `${BACKEND_ORIGIN}/uploads/`;

export function resolveProfileImageUrl(profilePic?: string): string {
  const raw = String(profilePic || '').trim();
  if (!raw) return '';

  if (/^(data:image\/|blob:|https?:\/\/)/i.test(raw)) {
    return raw;
  }

  const normalized = raw.replace(/\\/g, '/');
  if (normalized.startsWith('/uploads/')) {
    return `${BACKEND_ORIGIN}${normalized}`;
  }

  if (normalized.startsWith('uploads/')) {
    return `${BACKEND_ORIGIN}/${normalized}`;
  }

  if (normalized.startsWith('/')) {
    return `${BACKEND_ORIGIN}${normalized}`;
  }

  if (normalized.includes('/')) {
    return `${UPLOADS_BASE_URL}${normalized}`;
  }

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
    await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
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
