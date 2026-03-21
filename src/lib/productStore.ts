const PRODUCTS_STORAGE_KEY = "vendor_products";
const TEMPLATES_STORAGE_KEY = "vendor_templates";

export interface ProductTemplate {
  id: string;
  name: string;
  previewImageUrl: string;
  description?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  _id?: string;
  name: string;
  description: string;
  descriptionHtml?: string;
  images: string[]; // Array of image URLs
  thumbnailImage?: string;
  videoUrl?: string; // Video URL or upload path
  youtubeLink?: string;
  instagramLink?: string;
  templates: string[]; // Array of template IDs
  applicableFor?: ("Vendor" | "Client" | "Public")[];
  isVisible?: boolean;
  visibleTo: ("Vendor" | "Client" | "Public")[]; // Visibility control
  // Role-based pricing
  vendorPrice: number; // Price for Vendor/Master Vendor/Sub Vendor roles
  clientPrice: number; // Price for Client role
  publicPrice: number; // Price for Public/unauthenticated users
  createdAt: string;
  updatedAt: string;
}

// Products Management
export function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Product[]) : [];
  } catch {
    return [];
  }
}

export function saveProducts(products: Product[]): void {
  localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
}

export function addProduct(product: Product): Product {
  const products = loadProducts();
  const newProduct: Product = {
    ...product,
    id: product.id || `PRD-${Date.now()}`,
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: product.updatedAt || new Date().toISOString(),
  };
  saveProducts([...products, newProduct]);
  return newProduct;
}

export function updateProduct(product: Product): Product {
  const products = loadProducts();
  const index = products.findIndex((p) => p.id === product.id);
  if (index === -1) {
    // If product doesn't exist, add it
    const newProduct = { ...product, updatedAt: new Date().toISOString() };
    saveProducts([...products, newProduct]);
    return newProduct;
  }

  const updated: Product = {
    ...product,
    updatedAt: new Date().toISOString(),
  };
  products[index] = updated;
  saveProducts(products);
  return updated;
}

export function deleteProduct(id: string): boolean {
  const products = loadProducts();
  const filtered = products.filter((p) => p.id !== id);
  if (filtered.length === products.length) return false;
  saveProducts(filtered);
  return true;
}

export function getProductById(id: string): Product | undefined {
  return loadProducts().find((p) => p.id === id);
}

export function getProductsByVisibility(visibility: string): Product[] {
  return loadProducts().filter((p) => p.visibleTo.includes(visibility as any));
}

// Templates Management
export function loadTemplates(): ProductTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProductTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplates(templates: ProductTemplate[]): void {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

export function addTemplate(
  data: Omit<ProductTemplate, "id" | "createdAt">
): ProductTemplate {
  const templates = loadTemplates();
  const newTemplate: ProductTemplate = {
    ...data,
    id: `TPL-${Date.now()}`,
    createdAt: new Date().toLocaleDateString("en-IN"),
  };
  saveTemplates([...templates, newTemplate]);
  return newTemplate;
}

export function updateTemplate(
  id: string,
  data: Partial<ProductTemplate>
): ProductTemplate | null {
  const templates = loadTemplates();
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated: ProductTemplate = {
    ...templates[index],
    ...data,
  };
  templates[index] = updated;
  saveTemplates(templates);
  return updated;
}

export function deleteTemplate(id: string): boolean {
  const templates = loadTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return false;

  // Remove from all products
  const products = loadProducts();
  products.forEach((p) => {
    p.templates = p.templates.filter((tId) => tId !== id);
  });
  saveProducts(products);
  saveTemplates(filtered);
  return true;
}

export function getTemplateById(id: string): ProductTemplate | undefined {
  return loadTemplates().find((t) => t.id === id);
}

export function getProductTemplates(productId: string): ProductTemplate[] {
  const product = getProductById(productId);
  if (!product) return [];
  const templates = loadTemplates();
  return templates.filter((t) => product.templates.includes(t.id));
}
