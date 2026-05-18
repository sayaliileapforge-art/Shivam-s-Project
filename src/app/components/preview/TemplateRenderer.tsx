import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { resolveProfileImageUrl } from "../../../lib/apiService";
import { type ProjectDataRecord, type ProjectTemplate } from "../../../lib/projectStore";
import "./id-card.css";

/** Convert any absolute upload URL to a relative /uploads/ proxy path.
 *  The Vite dev-server proxy routes /uploads/* → http://72.62.241.170 (Hostinger)
 *  where all uploaded files are stored. This avoids CORS issues and ensures
 *  both <img> rendering and html2canvas fetch pre-loading work correctly.
 */
function normalizeUploadUrl(url: string): string {
  if (!url) return url;
  const isLocalDev = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  if (!isLocalDev) return url;
  // In local dev, strip only localhost absolute origins so Vite proxy can handle them.
  // Keep external hosts (e.g. Hostinger) unchanged.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/uploads\//i.test(url)) {
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/uploads\//i, '/uploads/');
  }
  return url;
}

const GRID_PAGE_SIZE = 6;

// ── Module-level template data cache ─────────────────────────────────────────
// Keyed by templateId + canvasJSON byte-length so the same template is parsed
// at most ONCE per browser session regardless of how many cards are rendered.
export interface CachedTemplateData {
  config: ResolvedTemplateConfig;
  dynamicTexts: DynamicTextObject[];
  /** Background image src extracted directly from the canvas JSON (not the
   *  full rendered thumbnail).  Used when rendering with real data so the
   *  thumbnail's baked-in placeholder text doesn't show behind the overlay. */
  canvasBgImageSrc: string;
}
const _tmplCache = new Map<string, CachedTemplateData>();

/** Extract only the background image src from canvasJSON (not the full thumbnail). */
function extractCanvasBackgroundImageSrc(template: ProjectTemplate): string {
  if (!template.canvasJSON) return "";
  try {
    const parsed = JSON.parse(template.canvasJSON) as Record<string, unknown>;
    const getCanvas = (): Record<string, unknown> | null => {
      if (parsed.canvas && typeof parsed.canvas === "object") return parsed.canvas as Record<string, unknown>;
      if (Array.isArray(parsed.pages)) {
        const first = parsed.pages[0] as { canvas?: unknown } | undefined;
        return (first?.canvas && typeof first.canvas === "object") ? first.canvas as Record<string, unknown> : null;
      }
      return null;
    };
    const canvas = getCanvas();
    if (!canvas) return "";
    const bgObject = (canvas.backgroundImage as Record<string, unknown> | undefined) ?? {};
    const bgSrc = String(bgObject.src ?? "").trim();
    if (!bgSrc) return "";
    const resolved = resolveProfileImageUrl(bgSrc) || bgSrc;
    return normalizeUploadUrl(resolved);
  } catch {
    return "";
  }
}

export function getTemplateCached(template: ProjectTemplate): CachedTemplateData {
  const key = `${template.id}:${template.canvasJSON?.length ?? 0}:${template.thumbnail ? template.thumbnail.slice(0, 16) : ""}`;
  const hit = _tmplCache.get(key);
  if (hit) return hit;
  const result: CachedTemplateData = {
    config: resolveTemplateConfig(template),
    dynamicTexts: extractDynamicTextObjects(template),
    canvasBgImageSrc: extractCanvasBackgroundImageSrc(template),
  };
  if (_tmplCache.size >= 30) {
    // Evict oldest entry to keep memory bounded
    const firstKey = _tmplCache.keys().next().value;
    if (firstKey !== undefined) _tmplCache.delete(firstKey);
  }
  _tmplCache.set(key, result);
  return result;
}

export type SupportedTemplateSlug = "template_1" | "template_2" | "template_3";

const CARD_WIDTH_PX = 250;
const CARD_HEIGHT_PX = 350;
const MM_TO_PX = 96 / 25.4;
const FALLBACK_AVATAR = "/placeholder.png";

type TemplateFieldName = "photo" | "name" | "admissionNo" | "class";

export interface TemplateFieldLayout {
  top: number;
  left: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  textAlign?: "left" | "center" | "right";
}

export interface IdCardTemplateConfig {
  background: string;
  layout: Record<TemplateFieldName, TemplateFieldLayout>;
}

interface ResolvedTemplateConfig extends IdCardTemplateConfig {
  sourceWidthPx: number;
  sourceHeightPx: number;
  usesCanvasScaling: boolean;
}

const DEFAULT_TEMPLATE_CONFIGS: Record<SupportedTemplateSlug, IdCardTemplateConfig> = {
  template_1: {
    background: "/templates/template_1.png",
    layout: {
      photo: { top: 64, left: 75, width: 100, height: 100 },
      name: { top: 188, left: 30, width: 190, fontSize: 16, fontWeight: 700, color: "#0f172a", textAlign: "center" },
      admissionNo: { top: 222, left: 30, width: 190, fontSize: 13, fontWeight: 600, color: "#1e293b", textAlign: "center" },
      class: { top: 248, left: 30, width: 190, fontSize: 13, fontWeight: 600, color: "#1e293b", textAlign: "center" },
    },
  },
  template_2: {
    background: "/templates/template_2.png",
    layout: {
      photo: { top: 56, left: 18, width: 84, height: 84 },
      name: { top: 70, left: 114, width: 122, fontSize: 14, fontWeight: 700, color: "#065f46", textAlign: "left" },
      admissionNo: { top: 102, left: 114, width: 122, fontSize: 12, fontWeight: 600, color: "#047857", textAlign: "left" },
      class: { top: 124, left: 114, width: 122, fontSize: 12, fontWeight: 600, color: "#047857", textAlign: "left" },
    },
  },
  template_3: {
    background: "/templates/template_3.png",
    layout: {
      photo: { top: 206, left: 170, width: 64, height: 64 },
      name: { top: 216, left: 18, width: 142, fontSize: 14, fontWeight: 700, color: "#111827", textAlign: "left" },
      admissionNo: { top: 240, left: 18, width: 142, fontSize: 12, fontWeight: 600, color: "#374151", textAlign: "left" },
      class: { top: 260, left: 18, width: 142, fontSize: 12, fontWeight: 600, color: "#374151", textAlign: "left" },
    },
  },
};

const FIELD_ALIASES: Record<TemplateFieldName, string[]> = {
  name: ["name", "Name", "studentName", "fullName", "student_name"],
  admissionNo: ["admissionNo", "admission_no", "rollNo", "roll_no", "admission", "Admission Number"],
  class: ["class", "Class", "standard", "Standard", "grade", "section", "className"],
  photo: [
    "photo",
    "Photo",
    "profilePic",
    "profilepic",
    "photoUrl",
    "photo_url",
    "imageUrl",
    "image_url",
    "image",
    "Image",
    "avatar",
    "Avatar",
    "picture",
    "Picture",
  ],
};

function normalizeTemplateSlug(raw: string): SupportedTemplateSlug | "" {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "template_1" || value === "template1") return "template_1";
  if (value === "template_2" || value === "template2") return "template_2";
  if (value === "template_3" || value === "template3") return "template_3";
  if (/template[\s_-]*1|id[\s_-]*card|classic|pvc/.test(value)) return "template_1";
  if (/template[\s_-]*2|certificate|minimal/.test(value)) return "template_2";
  if (/template[\s_-]*3|copy|poster|modern/.test(value)) return "template_3";
  return "";
}

export function getTemplateSlugForRender(
  template: Pick<ProjectTemplate, "templateName" | "templateType">
): SupportedTemplateSlug | "" {
  const byName = normalizeTemplateSlug(template.templateName);
  if (byName) return byName;

  switch (template.templateType) {
    case "id_card":
      return "template_1";
    case "certificate":
      return "template_2";
    case "poster":
      return "template_3";
    default:
      return "";
  }
}

function toCanonicalFieldKey(rawKey: string): TemplateFieldName | "" {
  const normalized = String(rawKey || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return "";
  if (["photo", "photourl", "profilepic", "image", "avatar", "picture"].includes(normalized)) return "photo";
  if (["name", "studentname", "fullname", "candidate", "username"].includes(normalized)) return "name";
  if (["admissionno", "admissionnumber", "rollno", "admission", "admn"].includes(normalized)) return "admissionNo";
  if (["class", "classname", "standard", "grade", "section"].includes(normalized)) return "class";
  return "";
}

export function getRecordField(record: ProjectDataRecord, fieldName: TemplateFieldName): string {
  const aliases = FIELD_ALIASES[fieldName] || [fieldName];
  for (const alias of aliases) {
    const direct = String(record[alias] ?? "").trim();
    if (direct) return direct;

    const fromEntries = Object.entries(record).find(([key]) => key.toLowerCase() === alias.toLowerCase());
    const fromEntryValue = String(fromEntries?.[1] ?? "").trim();
    if (fromEntryValue) return fromEntryValue;
  }
  return "";
}

export function resolveStudentPhotoUrl(record: ProjectDataRecord): string {
  const photoRaw = getRecordField(record, "photo");
  const resolved = resolveProfileImageUrl(photoRaw);
  if (!resolved) return FALLBACK_AVATAR;
  // Convert absolute URLs to relative proxy paths so html2canvas never makes
  // cross-origin requests and the Vite proxy routes to the correct server.
  const normalized = normalizeUploadUrl(resolved);
  const isAllowed = /^(data:image\/|blob:|\/backend-uploads\/|\/uploads\/|uploads\/|\/)/i.test(normalized);
  return isAllowed ? normalized : FALLBACK_AVATAR;
}

/** Returns true if the record has a real (non-fallback) photo URL. */
export function studentHasPhoto(record: ProjectDataRecord): boolean {
  const photoRaw = getRecordField(record, "photo");
  const normalized = resolveProfileImageUrl(photoRaw);
  return Boolean(normalized && /^(data:image\/|blob:|https?:\/\/|\/uploads\/|uploads\/|\/)/i.test(normalized));
}

/**
 * Canonical variable name (all lowercase, only a-z0-9) → possible field names in
 * the student record.  This bridges the gap between template variable naming
 * conventions (e.g. {{FULL_NAME}}) and CSV column headers (e.g. "Name").
 */
const TEMPLATE_VAR_ALIASES: Record<string, string[]> = {
  // name / full name
  fullname:       ["Name", "name", "fullName", "FullName", "studentName", "StudentName", "full_name", "FULL_NAME"],
  name:           ["Name", "name", "fullName", "FullName", "studentName"],
  studentname:    ["Name", "name", "studentName", "StudentName"],
  // class / section
  classname:      ["Class", "class", "className", "ClassName", "standard", "Standard"],
  class:          ["Class", "class", "className", "standard", "Standard"],
  section:        ["Section", "section", "Stream", "stream", "Division", "div"],
  classsection:   ["Class", "class", "Section", "section"],
  // parents
  fathername:     ["Father Name", "fatherName", "FatherName", "father_name", "Father"],
  mothername:     ["Mother Name", "motherName", "MotherName", "mother_name", "Mother"],
  fathermobile:   ["Father Mobile", "fatherMobile", "FatherMobile", "father_mobile", "Father Mobile Number", "father_mobile_number"],
  mothermobile:   ["Mother Mobile", "motherMobile", "MotherMobile", "mother_mobile", "Mother Mobile Number", "mother_mobile_number"],
  // contact / address
  address:        ["Address", "address", "addr", "Village", "village", "City", "city", "Permanent Address", "permanent_address"],
  phone:          ["Phone", "phone", "Mobile", "mobile", "Contact", "contact", "Father Mobile Number", "Mother Mobile Number"],
  mobile:         ["Mobile", "mobile", "Phone", "phone", "Contact", "contact", "Father Mobile Number", "fathermobilenumber", "Father Mobile"],
  mobileno:       ["Mobile", "mobile", "Phone", "phone", "Contact", "Father Mobile Number"],
  contact:        ["Contact", "contact", "Mobile", "mobile", "Phone", "phone"],
  // admission
  admissionno:    ["Admission Number", "admissionNo", "AdmissionNo", "admission_no", "Admission No", "Admn No", "rollNo", "Roll No"],
  admissionnumber:["Admission Number", "admissionNo", "AdmissionNo", "admission_no"],
  rollno:         ["Roll No", "rollNo", "roll_no", "admissionNo", "Admission Number"],
  // organisation / school
  companyname:    ["Company Name", "companyName", "CompanyName", "company_name", "School Name", "schoolName", "SchoolName", "school_name", "Organisation", "organization", "Institute", "institution"],
  company:        ["Company Name", "companyName", "CompanyName", "School Name", "schoolName"],
  schoolname:     ["School Name", "schoolName", "SchoolName", "school_name", "Company Name", "companyName"],
  institutename:  ["Institute", "institution", "School Name", "schoolName", "Company Name"],
  // designation / role
  designation:    ["Designation", "designation", "Role", "role", "Position", "position", "Post", "post"],
  // signature field (usually an image field)
  signature:      ["Signature", "signature", "sign", "Sign"],
  // misc
  dob:            ["DOB", "dob", "Date of Birth", "dateOfBirth", "birthDate", "Date Of Birth"],
  dateofbirth:    ["Date of Birth", "DOB", "dob", "dateOfBirth", "birthDate"],
  schoolcode:     ["School Code", "schoolCode", "school_code", "SchoolCode"],
  gender:         ["Gender", "gender", "Sex", "sex"],
  bloodgroup:     ["Blood Group", "bloodGroup", "blood_group", "BloodGroup", "Blood"],
  house:          ["House", "house", "School House", "schoolHouse"],
  stream:         ["Stream", "stream", "Section", "section", "Division"],
};

/**
 * Replace all {{KEY}} placeholders in a template string with values from the
 * student record.  Resolution order:
 *   1. Exact key match ("Name" finds student["Name"])
 *   2. Alias table ("FULL_NAME" → norm "fullname" → tries "Name", "name", …)
 *   3. Any record key whose lowercase-alphanumeric form equals the normalised key
 */
export function mapData(text: string, student: ProjectDataRecord): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim();

    // 1. Direct exact-key lookup
    const direct = String(student[key] ?? "").trim();
    if (direct) return direct;

    // 2. Alias table lookup
    const norm = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidates = TEMPLATE_VAR_ALIASES[norm] ?? [];
    for (const alias of candidates) {
      const val = String(student[alias] ?? "").trim();
      if (val) return val;
    }

    // 3. Fuzzy fallback: any record key that normalises to the same string
    const entry = Object.entries(student).find(
      ([k]) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === norm
    );
    return entry ? String(entry[1] ?? "").trim() : "";
  });
}

export interface DynamicTextObject {
  text: string;
  left: number;
  top: number;
  width: number;
  fontSize: number;
  fontWeight: string | number;
  color: string;
  textAlign: "left" | "center" | "right";
}

/**
 * Extract text canvas objects that contain {{VARIABLE}} placeholders so they
 * can be rendered dynamically with per-student substitution.
 */
function extractDynamicTextObjects(template: ProjectTemplate): DynamicTextObject[] {
  const objects = extractTemplateObjects(template);
  const result: DynamicTextObject[] = [];
  for (const obj of objects) {
    const raw = String(obj.text ?? obj.value ?? "").trim();
    if (!raw || !/\{\{[^}]+\}\}/.test(raw)) continue;
    result.push({
      text: raw,
      left: Number(obj.left ?? 0),
      top: Number(obj.top ?? 0),
      width: Number((obj.__boxWidth as number | undefined) ?? obj.width ?? 0) * (Number(obj.scaleX ?? 1) || 1),
      fontSize: Number.isFinite(Number(obj.fontSize)) ? Number(obj.fontSize) : 13,
      fontWeight: (obj.fontWeight as string | number | undefined) ?? "normal",
      color: typeof obj.fill === "string" ? obj.fill : "#111827",
      textAlign: (["left", "center", "right"].includes(String(obj.textAlign))
        ? String(obj.textAlign)
        : "left") as "left" | "center" | "right",
    });
  }
  return result;
}

function extractTemplateObjects(template: ProjectTemplate): Array<Record<string, unknown>> {
  if (!template.canvasJSON) return [];
  try {
    const parsed = JSON.parse(template.canvasJSON) as Record<string, unknown>;
    const objects: Array<Record<string, unknown>> = [];

    const readObjects = (canvas: unknown) => {
      if (!canvas || typeof canvas !== "object") return;
      const source = (canvas as { objects?: unknown }).objects;
      if (!Array.isArray(source)) return;
      source.forEach((obj) => {
        if (obj && typeof obj === "object") objects.push(obj as Record<string, unknown>);
      });
    };

    if (parsed.canvas && typeof parsed.canvas === "object") {
      readObjects(parsed.canvas);
    }
    if (Array.isArray(parsed.pages)) {
      parsed.pages.forEach((page) => {
        const canvas = (page as { canvas?: unknown }).canvas;
        readObjects(canvas);
      });
    }
    return objects;
  } catch {
    return [];
  }
}

function getTemplateBackground(template: ProjectTemplate, slug: SupportedTemplateSlug): string {
  if (template.thumbnail && template.thumbnail.trim()) {
    const resolved = resolveProfileImageUrl(template.thumbnail.trim()) || template.thumbnail.trim();
    return normalizeUploadUrl(resolved);
  }
  if (template.canvasJSON) {
    try {
      const parsed = JSON.parse(template.canvasJSON) as Record<string, unknown>;
      const pageCanvas = Array.isArray(parsed.pages)
        ? ((parsed.pages[0] as { canvas?: Record<string, unknown> } | undefined)?.canvas || null)
        : null;
      const rootCanvas = (parsed.canvas as Record<string, unknown> | undefined) || pageCanvas || {};
      const bgObject = (rootCanvas.backgroundImage as Record<string, unknown> | undefined) || {};
      const bgSrc = String(bgObject.src || "").trim();
      if (bgSrc) {
        const resolved = resolveProfileImageUrl(bgSrc) || bgSrc;
        return normalizeUploadUrl(resolved);
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return DEFAULT_TEMPLATE_CONFIGS[slug].background;
}

function deriveLayoutFromCanvas(template: ProjectTemplate): Partial<Record<TemplateFieldName, TemplateFieldLayout>> {
  const result: Partial<Record<TemplateFieldName, TemplateFieldLayout>> = {};
  const objects = extractTemplateObjects(template);

  objects.forEach((obj) => {
    const candidates = [obj.variableKey, obj.__fieldKey, obj.fieldKey, obj.dataKey, obj.photoField];
    const matched = candidates
      .map((candidate) => (typeof candidate === "string" ? toCanonicalFieldKey(candidate) : ""))
      .find(Boolean) as TemplateFieldName | undefined;
    if (!matched || result[matched]) return;

    const left = Number(obj.left ?? 0);
    const top = Number(obj.top ?? 0);
    const scaleX = Number(obj.scaleX ?? 1) || 1;
    const scaleY = Number(obj.scaleY ?? 1) || 1;
    const width = Number((obj.__boxWidth as number | undefined) ?? obj.width ?? 0) * scaleX;
    const height = Number((obj.__boxHeight as number | undefined) ?? obj.height ?? 0) * scaleY;

    result[matched] = {
      left: Number.isFinite(left) ? left : 0,
      top: Number.isFinite(top) ? top : 0,
      width: Number.isFinite(width) && width > 0 ? width : undefined,
      height: Number.isFinite(height) && height > 0 ? height : undefined,
      fontSize: Number.isFinite(Number(obj.fontSize)) ? Number(obj.fontSize) : undefined,
      fontWeight: (obj.fontWeight as string | number | undefined) || undefined,
      color: typeof obj.fill === "string" ? obj.fill : undefined,
      textAlign: (["left", "center", "right"].includes(String(obj.textAlign))
        ? String(obj.textAlign)
        : undefined) as "left" | "center" | "right" | undefined,
    };
  });

  return result;
}

/**
 * Read the actual Fabric.js canvas pixel dimensions from the serialised canvasJSON.
 * These are in the same coordinate space as each object's left/top properties, so
 * they must be used as the source dimensions when scaling to card display size.
 *
 * Falls back to null if the JSON is absent or contains no usable dimensions.
 */
function getCanvasDimensions(template: ProjectTemplate): { width: number; height: number } | null {
  if (!template.canvasJSON) return null;
  try {
    const parsed = JSON.parse(template.canvasJSON) as Record<string, unknown>;
    const tryRead = (node: unknown): { width: number; height: number } | null => {
      if (!node || typeof node !== "object") return null;
      const c = node as Record<string, unknown>;
      const w = Number(c.width ?? 0);
      const h = Number(c.height ?? 0);
      return w > 10 && h > 10 ? { width: w, height: h } : null;
    };
    return (
      tryRead(parsed.canvas) ??
      tryRead(Array.isArray(parsed.pages)
        ? (parsed.pages[0] as { canvas?: unknown } | undefined)?.canvas
        : null) ??
      null
    );
  } catch {
    return null;
  }
}

export function resolveTemplateConfig(template: ProjectTemplate | null): ResolvedTemplateConfig {
  const slug = template ? getTemplateSlugForRender(template) || "template_1" : "template_1";
  const defaults = DEFAULT_TEMPLATE_CONFIGS[slug as SupportedTemplateSlug] || DEFAULT_TEMPLATE_CONFIGS.template_1;

  if (!template) {
    return {
      ...defaults,
      sourceWidthPx: CARD_WIDTH_PX,
      sourceHeightPx: CARD_HEIGHT_PX,
      usesCanvasScaling: false,
    };
  }

  const fromCanvas = deriveLayoutFromCanvas(template);

  // Prefer pixel dimensions read directly from the canvasJSON (they are in the
  // same coordinate space as each object's left/top values).
  // Only fall back to template.canvas * MM_TO_PX when the JSON has no dims.
  const jsonDims = getCanvasDimensions(template);
  const sourceWidthPx  = jsonDims?.width  ?? Math.max(1, Number(template.canvas?.width  || 0) * MM_TO_PX || CARD_WIDTH_PX);
  const sourceHeightPx = jsonDims?.height ?? Math.max(1, Number(template.canvas?.height || 0) * MM_TO_PX || CARD_HEIGHT_PX);
  const usesCanvasScaling = Object.keys(fromCanvas).length > 0;

  return {
    background: getTemplateBackground(template, slug as SupportedTemplateSlug),
    layout: {
      photo: { ...defaults.layout.photo, ...(fromCanvas.photo || {}) },
      name: { ...defaults.layout.name, ...(fromCanvas.name || {}) },
      admissionNo: { ...defaults.layout.admissionNo, ...(fromCanvas.admissionNo || {}) },
      class: { ...defaults.layout.class, ...(fromCanvas.class || {}) },
    },
    sourceWidthPx,
    sourceHeightPx,
    usesCanvasScaling,
  };
}

function getFieldStyle(layout: TemplateFieldLayout, scaleX: number, scaleY: number): CSSProperties {
  const fontScale = (scaleX + scaleY) / 2;
  return {
    top: `${layout.top * scaleY}px`,
    left: `${layout.left * scaleX}px`,
    width: layout.width ? `${layout.width * scaleX}px` : undefined,
    height: layout.height ? `${layout.height * scaleY}px` : undefined,
    fontSize: layout.fontSize ? `${layout.fontSize * fontScale}px` : undefined,
    fontWeight: layout.fontWeight,
    color: layout.color,
    textAlign: layout.textAlign,
  };
}

export function IdCard({
  student,
  template,
  precomputedConfig,
  precomputedDynTexts,
  precomputedCanvasBgImageSrc,
}: {
  student: ProjectDataRecord;
  template: ProjectTemplate | null;
  /** Pre-computed by the parent grid — avoids per-card JSON.parse. */
  precomputedConfig?: ResolvedTemplateConfig;
  precomputedDynTexts?: DynamicTextObject[];
  /** Canvas-extracted background (without baked-in placeholder text). */
  precomputedCanvasBgImageSrc?: string;
}) {
  // Use parent-supplied pre-computed data when available (normal path inside
  // IdCardGrid).  Fall back to computing here for standalone usage.
  const { config, dynamicTexts, canvasBgImageSrc } = useMemo(() => {
    if (precomputedConfig && precomputedDynTexts) {
      return {
        config: precomputedConfig,
        dynamicTexts: precomputedDynTexts,
        canvasBgImageSrc: precomputedCanvasBgImageSrc ?? "",
      };
    }
    return template
      ? getTemplateCached(template)
      : { config: resolveTemplateConfig(null), dynamicTexts: [] as DynamicTextObject[], canvasBgImageSrc: "" };
  }, [template, precomputedConfig, precomputedDynTexts, precomputedCanvasBgImageSrc]);

  const name = getRecordField(student, "name") || "-";
  const admissionNo = getRecordField(student, "admissionNo") || "-";
  const className = getRecordField(student, "class") || "-";
  const hasPhoto = studentHasPhoto(student);
  const photoUrl = resolveStudentPhotoUrl(student);

  // Scale from canvas coordinate space → card pixels.
  // Always computed from actual canvas dimensions so dynamic text positions
  // are placed correctly regardless of whether tagged objects exist.
  const dynScaleX = CARD_WIDTH_PX / config.sourceWidthPx;
  const dynScaleY = CARD_HEIGHT_PX / config.sourceHeightPx;

  // Static layout (name/admissionNo/class defaults) only scale when
  // canvas-tagged objects were found; otherwise fall back to 1:1 defaults.
  const layoutScaleX = config.usesCanvasScaling ? dynScaleX : 1;
  const layoutScaleY = config.usesCanvasScaling ? dynScaleY : 1;

  // When the canvas has {{VARIABLE}} text objects, render those instead of
  // static fields so the same data is never drawn twice (no overlap).
  const hasCanvasText = dynamicTexts.length > 0;

  // When rendering with real data, prefer the canvas-extracted background image
  // over the full rendered thumbnail (which has placeholder text baked in).
  // This ensures the card shows actual student values without the placeholder
  // text from the thumbnail bleeding through.
  const effectiveBg = (hasCanvasText && canvasBgImageSrc) ? canvasBgImageSrc : config.background;

  const photoStyle: CSSProperties = {
    position: "absolute",
    zIndex: 5,
    ...getFieldStyle(config.layout.photo, layoutScaleX, layoutScaleY),
  };

  return (
    <article className="card" style={{ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX }}>
      {/* Background image — lowest layer */}
      <img
        className="bg"
        src={effectiveBg}
        alt=""
        draggable={false}
        loading="lazy"
        style={{ zIndex: 0 }}
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.src.includes('placeholder')) {
            img.onerror = null;
            img.setAttribute('src', FALLBACK_AVATAR);
            img.src = FALLBACK_AVATAR;
          }
        }}
      />

      {/* Student photo */}
      {hasPhoto ? (
        <img
          className="photo"
          src={photoUrl}
          alt={name}
          loading="lazy"
          style={photoStyle}
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.src.includes('placeholder')) {
              img.onerror = null;
              img.setAttribute('src', FALLBACK_AVATAR);
              img.src = FALLBACK_AVATAR;
            }
          }}
        />
      ) : (
        <div
          className="photo"
          style={{
            ...photoStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#e2e8f0",
            borderRadius: 4,
            fontSize: 10,
            color: "#94a3b8",
          }}
        >
          No Image
        </div>
      )}

      {/* Static fields — only rendered when the template has NO canvas text objects.
          When canvas objects with {{...}} exist they are the authoritative source;
          rendering both would cause visible overlap. */}
      {!hasCanvasText && (
        <>
          <p className="id-field text name" style={{ position: "absolute", zIndex: 10, ...getFieldStyle(config.layout.name, layoutScaleX, layoutScaleY) }}>{name}</p>
          <p className="id-field text" style={{ position: "absolute", zIndex: 10, ...getFieldStyle(config.layout.admissionNo, layoutScaleX, layoutScaleY) }}>{admissionNo}</p>
          <p className="id-field text" style={{ position: "absolute", zIndex: 10, ...getFieldStyle(config.layout.class, layoutScaleX, layoutScaleY) }}>{className}</p>
        </>
      )}

      {/* Dynamic {{VARIABLE}} text objects from canvas JSON — correctly scaled
          to card pixel space from the canvas coordinate system. */}
      {hasCanvasText && dynamicTexts.map((obj, i) => (
        <p
          key={`dyn-${i}`}
          className="id-field"
          style={{
            position: "absolute",
            zIndex: 10,
            top: `${obj.top * dynScaleY}px`,
            left: `${obj.left * dynScaleX}px`,
            width: obj.width ? `${obj.width * dynScaleX}px` : undefined,
            fontSize: `${obj.fontSize * ((dynScaleX + dynScaleY) / 2)}px`,
            fontWeight: obj.fontWeight,
            color: obj.color,
            textAlign: obj.textAlign,
            margin: 0,
            lineHeight: 1.2,
            whiteSpace: "normal",
            wordBreak: "break-word",
            overflow: "hidden",
          }}
        >
          {mapData(obj.text, student)}
        </p>
      ))}
    </article>
  );
}

export function IdCardGrid({
  students,
  template,
  containerClassName,
  children,
}: {
  students: ProjectDataRecord[];
  template: ProjectTemplate | null;
  containerClassName?: string;
  children?: ReactNode;
}) {
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the dataset or template changes.
  // MUST be before any conditional returns so hooks are called in consistent order.
  useEffect(() => {
    setPage(1);
  }, [students.length, template?.id]);

  // Pre-compute template config + dynamic texts ONCE for all cards in this grid.
  // Without this, each IdCard would independently call JSON.parse(canvasJSON).
  const { precomputedConfig, precomputedDynTexts, precomputedCanvasBgImageSrc } = useMemo(() => {
    if (!template) {
      return {
        precomputedConfig: resolveTemplateConfig(null),
        precomputedDynTexts: [] as DynamicTextObject[],
        precomputedCanvasBgImageSrc: "",
      };
    }
    const cached = getTemplateCached(template);
    return {
      precomputedConfig: cached.config,
      precomputedDynTexts: cached.dynamicTexts,
      precomputedCanvasBgImageSrc: cached.canvasBgImageSrc,
    };
  }, [template]);

  // Compute visible slice before conditional returns (hooks rule).
  const visible = useMemo(
    () => students.slice(0, page * GRID_PAGE_SIZE),
    [students, page]
  );
  const hasMore = visible.length < students.length;

  if (!template) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-600">
        Select a template to render a live preview.
      </div>
    );
  }

  if (!students.length) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-600">
        Select at least one record to render a template preview.
      </div>
    );
  }

  return (
    <div className={containerClassName || "id-preview-scroll"}>
      <div className="id-preview-grid">
        {visible.map((student, index) => (
          <IdCard
            key={`${student.id}-${index}`}
            student={student}
            template={template}
            precomputedConfig={precomputedConfig}
            precomputedDynTexts={precomputedDynTexts}
            precomputedCanvasBgImageSrc={precomputedCanvasBgImageSrc}
          />
        ))}
      </div>
      {hasMore && (
        <div className="mt-3 flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">
            Showing {visible.length} of {students.length}
          </span>
          <button
            type="button"
            className="text-xs text-primary underline underline-offset-2 hover:no-underline"
            onClick={() => setPage((p) => p + 1)}
          >
            Show more
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

export function TemplateRenderer({
  template,
  data,
}: {
  template: ProjectTemplate | null;
  data: ProjectDataRecord[];
}) {
  return <IdCardGrid students={data} template={template} />;
}

export default TemplateRenderer;
