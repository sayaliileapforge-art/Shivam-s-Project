export interface TemplateOrderRecord {
  _id: string;
  userId?: string;
  productId: string;
  templateId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  customDesignData?: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

const ORDER_API_BASE = '/api/orders';

async function handleResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const looksLikeJson = contentType.includes('application/json') || raw.trim().startsWith('{') || raw.trim().startsWith('[');

  let parsed: any = null;
  if (raw.trim().length > 0 && looksLikeJson) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid response from server');
    }
  }

  if (!response.ok) {
    const message = parsed?.error || parsed?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (parsed == null) {
    throw new Error('Empty response from server');
  }

  // Support both wrapped ({ success, data }) and direct payload responses.
  if (typeof parsed === 'object' && parsed !== null && 'success' in parsed) {
    if (!parsed.success) {
      throw new Error(parsed.error || 'Request failed');
    }
    return parsed.data as T;
  }

  return parsed as T;
}

export async function createTemplateOrder(payload: {
  userId?: string;
  productId: string;
  templateId: string;
  quantity: number;
  unitPrice: number;
  customDesignData?: Record<string, any>;
}): Promise<TemplateOrderRecord> {
  const response = await fetch(ORDER_API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<TemplateOrderRecord>(response);
}

export async function fetchTemplateOrders(filters?: {
  userId?: string;
  productId?: string;
  status?: string;
}): Promise<TemplateOrderRecord[]> {
  const params = new URLSearchParams();
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.productId) params.set('productId', filters.productId);
  if (filters?.status) params.set('status', filters.status);

  const query = params.toString();
  const response = await fetch(`${ORDER_API_BASE}${query ? `?${query}` : ''}`);
  return handleResponse<TemplateOrderRecord[]>(response);
}
