/**
 * API Service Layer
 * Handles all communication with the backend MongoDB API
 * Falls back to localStorage if API unavailable
 */

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
  }
}

function resolveApiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!raw) return '/api';

  const normalized = raw.replace(/\/$/, '');
  if (normalized.endsWith('/api')) {
    return normalized;
  }
  return `${normalized}/api`;
}

const API_BASE = resolveApiBase();

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
//  Projects API
// ─────────────────────────────────────────────────────────────

export async function fetchProjects() {
  try {
    const response = await fetch(`${API_BASE}/projects`);
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
    const result = await response.json() as ApiResponse<any>;
    return result.data;
  } catch (error) {
    console.error('Create client failed:', error);
    return null;
  }
}

export async function updateClient(id: string, data: Record<string, any>) {
  try {
    const response = await fetch(`${API_BASE}/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json() as ApiResponse<any>;
    return result.data;
  } catch (error) {
    console.error('Update client failed:', error);
    return null;
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
