/**
 * Shapes & Icons Gallery Definitions for Designer Tool
 * Provides reusable shapes, icons, and design elements
 */

export interface ShapeItem {
  id: string;
  label: string;
  category: "basic" | "arrows" | "symbols" | "decorative" | "social" | "ui";
  type: "shape" | "icon" | "svg";
  preview?: string; // SVG string or data URI
  description?: string;
}

export function normalizeShapePreviewSvg(preview: string): string {
  const trimmed = String(preview || "").trim();
  if (!trimmed || !/^<svg\b/i.test(trimmed)) return "";

  const withXmlns = /<svg\b[^>]*xmlns=/i.test(trimmed)
    ? trimmed
    : trimmed.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');

  return withXmlns.replace(/<svg\b([^>]*)>/i, (full, attrs) => {
    let next = String(attrs || "");
    if (!/\bviewBox\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' viewBox="0 0 24 24"';
    }
    if (!/\bwidth\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' width="24"';
    }
    if (!/\bheight\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' height="24"';
    }
    if (!/\bstroke-linecap\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' stroke-linecap="round"';
    }
    if (!/\bstroke-linejoin\s*=\s*["'][^"']+["']/i.test(next)) {
      next += ' stroke-linejoin="round"';
    }
    return `<svg${next}>`;
  });
}

// ─── BASIC SHAPES ──────────────────────────────────────────────────────────

export const BASIC_SHAPES: ShapeItem[] = [
  {
    id: "shape-rectangle",
    label: "Rectangle",
    category: "basic",
    type: "shape",
    description: "Basic rectangular shape",
  },
  {
    id: "shape-circle",
    label: "Circle",
    category: "basic",
    type: "shape",
    description: "Perfect circle shape",
  },
  {
    id: "shape-triangle",
    label: "Triangle",
    category: "basic",
    type: "shape",
    description: "Equilateral triangle",
  },
  {
    id: "shape-line",
    label: "Line",
    category: "basic",
    type: "shape",
    description: "Straight line",
  },
  {
    id: "shape-polygon",
    label: "Polygon (5-sided)",
    category: "basic",
    type: "shape",
    description: "Pentagon shape",
  },
  {
    id: "shape-star",
    label: "Star",
    category: "basic",
    type: "shape",
    description: "5-pointed star",
  },
  {
    id: "shape-hexagon",
    label: "Hexagon",
    category: "basic",
    type: "shape",
    description: "Regular hexagon",
  },
  {
    id: "shape-rounded-rect",
    label: "Rounded Rectangle",
    category: "basic",
    type: "shape",
    description: "Rectangle with rounded corners",
  },
];

// ─── ARROWS ───────────────────────────────────────────────────────────────

export const ARROW_ICONS: ShapeItem[] = [
  {
    id: "arrow-right",
    label: "Arrow Right",
    category: "arrows",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>`,
  },
  {
    id: "arrow-left",
    label: "Arrow Left",
    category: "arrows",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>`,
  },
  {
    id: "arrow-up",
    label: "Arrow Up",
    category: "arrows",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>`,
  },
  {
    id: "arrow-down",
    label: "Arrow Down",
    category: "arrows",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M19 12l-7 7-7-7"/>
    </svg>`,
  },
  {
    id: "arrow-diagonal",
    label: "Arrow Diagonal",
    category: "arrows",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M7 17l10-10M17 17v-10h-10"/>
    </svg>`,
  },
];

// ─── SYMBOLS ──────────────────────────────────────────────────────────────

export const SYMBOL_ICONS: ShapeItem[] = [
  {
    id: "symbol-checkmark",
    label: "Checkmark",
    category: "symbols",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`,
  },
  {
    id: "symbol-cross",
    label: "Cross/X",
    category: "symbols",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`,
  },
  {
    id: "symbol-plus",
    label: "Plus",
    category: "symbols",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
  },
  {
    id: "symbol-minus",
    label: "Minus",
    category: "symbols",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
  },
  {
    id: "symbol-star",
    label: "Star",
    category: "symbols",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>`,
  },
  {
    id: "symbol-heart",
    label: "Heart",
    category: "symbols",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>`,
  },
];

// ─── DECORATIVE ───────────────────────────────────────────────────────────

export const DECORATIVE_ICONS: ShapeItem[] = [
  {
    id: "deco-line-horizontal",
    label: "Horizontal Line",
    category: "decorative",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1"/>
    </svg>`,
  },
  {
    id: "deco-divider-dots",
    label: "Dot Divider",
    category: "decorative",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6" cy="12" r="2"/>
      <circle cx="12" cy="12" r="2"/>
      <circle cx="18" cy="12" r="2"/>
    </svg>`,
  },
  {
    id: "deco-bracket-left",
    label: "Left Bracket",
    category: "decorative",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 4 L4 4 L4 20 L10 20"/>
    </svg>`,
  },
  {
    id: "deco-bracket-right",
    label: "Right Bracket",
    category: "decorative",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 4 L20 4 L20 20 L14 20"/>
    </svg>`,
  },
  {
    id: "deco-flourish",
    label: "Flourish",
    category: "decorative",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
      <path d="M3 12 Q6 6 12 6 T21 12"/>
      <path d="M3 12 Q6 18 12 18 T21 12"/>
    </svg>`,
  },
];

// ─── SOCIAL ICONS ────────────────────────────────────────────────────────

export const SOCIAL_ICONS: ShapeItem[] = [
  {
    id: "social-facebook",
    label: "Facebook",
    category: "social",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>`,
  },
  {
    id: "social-twitter",
    label: "Twitter",
    category: "social",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M4 4l16 16"/>
      <path d="M20 4 4 20"/>
    </svg>`,
  },
  {
    id: "social-instagram",
    label: "Instagram",
    category: "social",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="1"/>
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1"/>
      <circle cx="18" cy="6" r="1" fill="currentColor"/>
    </svg>`,
  },
  {
    id: "social-linkedin",
    label: "LinkedIn",
    category: "social",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/>
    </svg>`,
  },
];

// ─── UI ELEMENTS ───────────────────────────────────────────────────────────

export const UI_ELEMENTS: ShapeItem[] = [
  {
    id: "ui-button",
    label: "Button",
    category: "ui",
    type: "shape",
    description: "Rounded button shape",
  },
  {
    id: "ui-badge",
    label: "Badge",
    category: "ui",
    type: "shape",
    description: "Circular badge",
  },
  {
    id: "ui-tag",
    label: "Tag",
    category: "ui",
    type: "shape",
    description: "Tag/label shape",
  },
  {
    id: "ui-search",
    label: "Search Icon",
    category: "ui",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>`,
  },
  {
    id: "ui-menu",
    label: "Menu Icon",
    category: "ui",
    type: "icon",
    preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>`,
  },
];

// ─── COMBINED GALLERY ──────────────────────────────────────────────────────

export const SHAPES_GALLERY = [
  ...BASIC_SHAPES,
  ...ARROW_ICONS,
  ...SYMBOL_ICONS,
  ...DECORATIVE_ICONS,
  ...SOCIAL_ICONS,
  ...UI_ELEMENTS,
];

// ─── CATEGORIES ──────────────────────────────────────────────────────────

export interface Category {
  id: string;
  label: string;
  count: number;
}

export const GALLERY_CATEGORIES = (): Category[] => {
  const categories = new Map<string, number>();
  
  SHAPES_GALLERY.forEach(item => {
    const key = item.category;
    categories.set(key, (categories.get(key) ?? 0) + 1);
  });

  return [
    { id: "all", label: "All", count: SHAPES_GALLERY.length },
    { id: "basic", label: "Basic Shapes", count: categories.get("basic") ?? 0 },
    { id: "arrows", label: "Arrows", count: categories.get("arrows") ?? 0 },
    { id: "symbols", label: "Symbols", count: categories.get("symbols") ?? 0 },
    { id: "decorative", label: "Decorative", count: categories.get("decorative") ?? 0 },
    { id: "social", label: "Social Icons", count: categories.get("social") ?? 0 },
    { id: "ui", label: "UI Elements", count: categories.get("ui") ?? 0 },
  ];
};

/**
 * Get items for a specific category
 */
export function getGalleryItems(category?: string): ShapeItem[] {
  if (!category || category === "all") return SHAPES_GALLERY;
  return SHAPES_GALLERY.filter(item => item.category === category);
}

/**
 * Search gallery items by label
 */
export function searchGalleryItems(query: string): ShapeItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return SHAPES_GALLERY;
  return SHAPES_GALLERY.filter(item =>
    item.label.toLowerCase().includes(q) ||
    item.description?.toLowerCase().includes(q)
  );
}

/**
 * Get item by ID
 */
export function getGalleryItem(id: string): ShapeItem | undefined {
  return SHAPES_GALLERY.find(item => item.id === id);
}
