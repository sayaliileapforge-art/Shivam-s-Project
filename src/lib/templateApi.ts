export interface TemplateRecord {
  _id: string;
  productId: string;
  templateName: string;
  category: 'Business' | 'Wedding' | 'Minimal' | 'Corporate' | 'Festival' | 'Other';
  previewImageUrl: string;
  designFileUrl?: string;
  designData: Record<string, any>;
  isActive: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const TEMPLATE_API_BASE = '/api/templates';

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
