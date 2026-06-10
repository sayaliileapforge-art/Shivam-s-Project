const BASE = '/api/student-photos';

export interface PhotoVersion {
  version: number;
  url: string;
  type: 'original' | 'processed';
  createdAt: string;
  note?: string;
}

export interface StudentPhoto {
  _id: string;
  clientId: string;
  dataRecordId?: string;
  studentName?: string;
  originalPhoto: string;
  processedPhoto?: string;
  primaryPhoto: string;
  processingStatus: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'restored';
  processingJobId?: string;
  processingError?: string;
  processingStartedAt?: string;
  processingCompletedAt?: string;
  isProcessed: boolean;
  isRestored: boolean;
  history: PhotoVersion[];
  createdAt: string;
  updatedAt: string;
  jobProgress?: number | null;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data as T;
}

export async function uploadStudentPhoto(
  file: File,
  clientId: string,
  opts?: { studentName?: string; dataRecordId?: string }
): Promise<StudentPhoto> {
  const form = new FormData();
  form.append('photo', file);
  form.append('clientId', clientId);
  if (opts?.studentName)   form.append('studentName',   opts.studentName);
  if (opts?.dataRecordId)  form.append('dataRecordId',  opts.dataRecordId);
  return api<StudentPhoto>(`${BASE}/upload`, { method: 'POST', body: form });
}

export async function getStudentPhoto(id: string): Promise<StudentPhoto> {
  return api<StudentPhoto>(`${BASE}/${id}`);
}

export async function getStudentPhotosByClient(clientId: string): Promise<StudentPhoto[]> {
  return api<StudentPhoto[]>(`${BASE}/client/${clientId}`);
}

export async function getStudentPhotoStatus(id: string): Promise<StudentPhoto> {
  return api<StudentPhoto>(`${BASE}/${id}/status`);
}

export async function restoreStudentPhoto(id: string): Promise<StudentPhoto> {
  return api<StudentPhoto>(`${BASE}/${id}/restore`, { method: 'POST' });
}

export async function reprocessStudentPhoto(id: string): Promise<void> {
  await fetch(`${BASE}/${id}/reprocess`, { method: 'POST' });
}

export async function deleteStudentPhoto(id: string): Promise<void> {
  await fetch(`${BASE}/${id}`, { method: 'DELETE' });
}

/** Resolve a photo URL to a full absolute URL for display */
export function resolvePhotoUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  return `${base}${url}`;
}
