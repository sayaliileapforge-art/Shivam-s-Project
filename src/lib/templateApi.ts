export interface TemplateRecord {
  _id: string;
  productId: string;
  templateName: string;
  category: 'Business' | 'Wedding' | 'Minimal' | 'Corporate' | 'Festival' | 'Other';
  previewImageUrl?: string;
  preview_image?: string;
  designFileUrl?: string;
  designData: Record<string, any>;
  isActive: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const TEMPLATE_API_BASE = '/api/templates';

export function generatePreview(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export function resolveTemplatePreview(template: Pick<TemplateRecord, 'preview_image' | 'previewImageUrl'> | null | undefined): string {
  return template?.preview_image || template?.previewImageUrl || '/placeholder.png';
}

type TemplateSaveInput = {
  productId: string;
  templateName: string;
  category?: TemplateRecord['category'];
  designFileUrl?: string;
  designData?: Record<string, any>;
  tags?: string[];
  isActive?: boolean;
  preview_image?: string;
  previewCanvas?: HTMLCanvasElement;
};

function resolvePreviewForSave(input: TemplateSaveInput): string {
  if (input.preview_image) return input.preview_image;
  if (input.previewCanvas) return generatePreview(input.previewCanvas);
  return '';
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error || 'Request failed');
  }
  return json.data as T;
}

export async function getTemplatesByProductId(productId: string, params?: { category?: string; search?: string }): Promise<TemplateRecord[]> {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.search) query.set('search', params.search);
  const queryString = query.toString();

  const response = await fetch(`${TEMPLATE_API_BASE}/product/${productId}${queryString ? `?${queryString}` : ''}`);
  return handleResponse<TemplateRecord[]>(response);
}

export async function getTemplateById(templateId: string): Promise<TemplateRecord> {
  const response = await fetch(`${TEMPLATE_API_BASE}/${templateId}`);
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
