import { Product } from './productStore';
import { resolveProfileImageUrl, API_BASE as API_ROOT } from './apiService';

const API_BASE = `${API_ROOT}/products`;

export interface ProductPayload {
  name: string;
  description: string;
  descriptionHtml?: string;
  images: string[];
  thumbnailImage?: string;
  thumbnailIndex?: number;
  videoUrl?: string;
  youtubeLink?: string;
  instagramLink?: string;
  applicableFor: Array<'Vendor' | 'Client' | 'Public'>;
  isVisible: boolean;
  vendorPrice: number;
  clientPrice: number;
  publicPrice: number;
  price: number;
  category?: string;
  sku?: string;
}

export interface ProductSubmitInput extends ProductPayload {
  imageFiles?: File[];
  videoFile?: File | null;
}

function normalizeProduct(item: any): Product {
  const id = String(item._id || item.id || '');
  const applicableFor = (item.applicableFor || item.visibleTo || []) as Array<'Vendor' | 'Client' | 'Public'>;

  return {
    id,
    _id: item._id,
    name: item.name || '',
    description: item.description || '',
    descriptionHtml: item.descriptionHtml || '',
    images: Array.isArray(item.images)
      ? item.images.map((u: string) => resolveProfileImageUrl(u)).filter(Boolean)
      : item.image ? [resolveProfileImageUrl(item.image)].filter(Boolean) : [],
    thumbnailImage: resolveProfileImageUrl(item.thumbnailImage || item.image || ''),
    videoUrl: item.videoUrl,
    youtubeLink: item.youtubeLink,
    instagramLink: item.instagramLink,
    templates: Array.isArray(item.templates) ? item.templates : [],
    applicableFor,
    visibleTo: applicableFor,
    isVisible: item.isVisible !== false,
    vendorPrice: Number(item.vendorPrice || 0),
    clientPrice: Number(item.clientPrice || 0),
    publicPrice: Number(item.publicPrice || item.price || 0),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

function appendPayload(formData: FormData, payload: ProductSubmitInput): void {
  formData.append('name', payload.name);
  formData.append('description', payload.description);
  if (payload.descriptionHtml) formData.append('descriptionHtml', payload.descriptionHtml);
  formData.append('images', JSON.stringify(payload.images || []));
  if (payload.thumbnailImage) formData.append('thumbnailImage', payload.thumbnailImage);
  if (typeof payload.thumbnailIndex === 'number' && payload.thumbnailIndex >= 0) {
    formData.append('thumbnailIndex', String(payload.thumbnailIndex));
  }
  if (payload.videoUrl) formData.append('videoUrl', payload.videoUrl);
  if (payload.youtubeLink) formData.append('youtubeLink', payload.youtubeLink);
  if (payload.instagramLink) formData.append('instagramLink', payload.instagramLink);
  formData.append('applicableFor', JSON.stringify(payload.applicableFor));
  formData.append('isVisible', String(payload.isVisible));
  formData.append('vendorPrice', String(payload.vendorPrice));
  formData.append('clientPrice', String(payload.clientPrice));
  formData.append('publicPrice', String(payload.publicPrice));
  formData.append('price', String(payload.price));
  formData.append('category', payload.category || 'general');
  formData.append('sku', payload.sku || `SKU-${Date.now()}`);

  for (const file of payload.imageFiles || []) {
    formData.append('images', file);
  }

  if (payload.videoFile) {
    formData.append('videoFile', payload.videoFile);
  }
}

function submitWithProgress(
  url: string,
  method: 'POST' | 'PUT',
  payload: ProductSubmitInput,
  onProgress?: (percent: number) => void
): Promise<Product> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent);
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && parsed.success) {
          resolve(normalizeProduct(parsed.data));
          return;
        }
        reject(new Error(parsed.error || 'Request failed'));
      } catch {
        reject(new Error('Invalid server response'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading media'));

    const formData = new FormData();
    appendPayload(formData, payload);
    xhr.send(formData);
  });
}

export async function fetchProducts(applicableFor?: 'Vendor' | 'Client' | 'Public'): Promise<Product[]> {
  const params = new URLSearchParams();
  params.set('isVisible', 'true');
  if (applicableFor) {
    params.set('applicableFor', applicableFor);
  }

  const response = await fetch(`${API_BASE}?${params.toString()}`);
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Failed to fetch products');
  }

  return (result.data || []).map(normalizeProduct);
}

export async function fetchProductById(id: string): Promise<Product> {
  const response = await fetch(`${API_BASE}/${id}`);
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Failed to fetch product');
  }

  return normalizeProduct(result.data);
}

export function createProduct(
  payload: ProductSubmitInput,
  onProgress?: (percent: number) => void
): Promise<Product> {
  return submitWithProgress(API_BASE, 'POST', payload, onProgress);
}

export function editProduct(
  id: string,
  payload: ProductSubmitInput,
  onProgress?: (percent: number) => void
): Promise<Product> {
  return submitWithProgress(`${API_BASE}/${id}`, 'PUT', payload, onProgress);
}

export async function removeProduct(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'Failed to delete product');
  }
}
