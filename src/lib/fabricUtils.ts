// ─── Fabric.js canvas utilities ──────────────────────────────────────────────
// All sizes in mm unless suffixed with Px.

/** Pixels per mm at 96 DPI screen resolution */
export const MM_TO_PX = 96 / 25.4; // ≈ 3.7795

export function mmToPx(mm: number): number {
  return Math.round(mm * MM_TO_PX);
}
export function pxToMm(px: number): number {
  return px / MM_TO_PX;
}

// ─── Preset page sizes ────────────────────────────────────────────────────────

export interface PagePreset {
  id: string;
  label: string;
  width: number;  // mm
  height: number; // mm
}

export const PAGE_PRESETS: PagePreset[] = [
  { id: "id-card",      label: "ID Card (54 × 86 mm)",        width: 54,  height: 86  },
  { id: "id-card-h",    label: "ID Card Horizontal (86×54)",   width: 86,  height: 54  },
  { id: "a4",           label: "A4 (210 × 297 mm)",            width: 210, height: 297 },
  { id: "a4-l",         label: "A4 Landscape (297 × 210 mm)",  width: 297, height: 210 },
  { id: "a5",           label: "A5 (148 × 210 mm)",            width: 148, height: 210 },
  { id: "13x19",        label: "13 × 19 (330 × 482 mm)",       width: 330, height: 482 },
  { id: "certificate",  label: "Certificate (297 × 210 mm)",   width: 297, height: 210 },
  { id: "poster-a3",    label: "Poster A3 (297 × 420 mm)",     width: 297, height: 420 },
  { id: "custom",       label: "Custom",                       width: 100, height: 100 },
];

// ─── Template config ─────────────────────────────────────────────────────────

export type TemplateType = "id_card" | "certificate" | "poster" | "custom";

export interface TemplateMargin {
  top: number;    // mm
  left: number;   // mm
  right: number;  // mm
  bottom: number; // mm
}

export interface TemplateConfig {
  templateName: string;
  templateType: TemplateType;
  canvas: { width: number; height: number }; // mm
  margin: TemplateMargin;
}

export const DEFAULT_CONFIG: TemplateConfig = {
  templateName: "Untitled Template",
  templateType: "id_card",
  canvas: { width: 54, height: 86 },
  margin: { top: 2, left: 2, right: 2, bottom: 2 },
};

export const DESIGNER_SAVE_KEY = "vendor_designer_template_config";

/** Context written by ProjectDetail when opening a template for editing.
 *  Stores { projectId, templateId } so DesignerStudio can save back directly. */
export const DESIGNER_CONTEXT_KEY = "vendor_designer_context";

export interface DesignerContext {
  projectId: string;
  templateId: string;
  projectName?: string;
  templateName?: string;
}

export function loadDesignerConfig(): TemplateConfig | null {
  try {
    const raw = localStorage.getItem(DESIGNER_SAVE_KEY);
    return raw ? (JSON.parse(raw) as TemplateConfig) : null;
  } catch {
    return null;
  }
}

// ─── Template type options ────────────────────────────────────────────────────

export const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: "id_card",     label: "ID Card"     },
  { value: "certificate", label: "Certificate" },
  { value: "poster",      label: "Poster"      },
  { value: "custom",      label: "Custom"      },
];

// ─── Ruler tick helpers ──────────────────────────────────────────────────────

export interface Tick {
  pos: number;  // in pixels, along ruler axis
  mm: number;
  size: "lg" | "md" | "sm"; // tick height/width
  label: boolean;
}

export function buildTicks(totalMm: number, scale: number): Tick[] {
  // Adaptive interval: skip ticks that are < 2px apart to avoid thousands of SVG elements
  const minPxGap = 2;
  let interval = 1;
  if (1 * scale < minPxGap) interval = Math.ceil(minPxGap / scale);
  // Round interval to a clean number
  if (interval > 1 && interval <= 2) interval = 2;
  else if (interval > 2 && interval <= 5) interval = 5;
  else if (interval > 5 && interval <= 10) interval = 10;
  else if (interval > 10) interval = Math.ceil(interval / 10) * 10;

  const ticks: Tick[] = [];
  for (let mm = 0; mm <= totalMm; mm += interval) {
    const isLg = mm % 10 === 0;
    const isMd = mm % 5  === 0;
    ticks.push({
      pos: mm * scale,
      mm,
      size: isLg ? "lg" : isMd ? "md" : "sm",
      label: isLg && mm > 0,
    });
  }
  return ticks;
}
