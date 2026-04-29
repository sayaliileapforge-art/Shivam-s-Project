import { API_BASE as API_ROOT, resolveProfileImageUrl } from './apiService';

export interface TemplateRecord {
  _id: string;
  productId: string;
  createdBy?: string;
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

export function generatePreview(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export function resolveTemplatePreview(template: Pick<TemplateRecord, 'preview_image' | 'previewImageUrl'> | null | undefined): string {
  const raw = template?.preview_image || template?.previewImageUrl || '';
  if (!raw) return '/placeholder.png';
  if (/^(data:image\/|blob:|https?:\/\/)/i.test(raw)) {
    return raw;
  }
  return resolveProfileImageUrl(raw);
}

type TemplateSaveInput = {
  productId: string;
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

export async function getTemplates(params?: { productId?: string }): Promise<TemplateRecord[]> {
  const query = new URLSearchParams();
  if (params?.productId) query.set('productId', params.productId);
  const requestUrl = `${TEMPLATE_API_BASE}${query.toString() ? `?${query}` : ''}`;
  const response = await fetch(requestUrl);
  return handleResponse<TemplateRecord[]>(response);
}

export async function getTemplateById(templateId: string): Promise<TemplateRecord> {
  const requestUrl = `${TEMPLATE_API_BASE}/${templateId}`;
  const response = await fetch(requestUrl);
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

  return handleResponse<TemplateRecord>(response);
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

  return handleResponse<TemplateRecord>(response);
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
