import { CSSProperties, ReactNode } from "react";
import { resolveProfileImageUrl } from "../../../lib/apiService";
import { type ProjectDataRecord, type ProjectTemplate } from "../../../lib/projectStore";
import "./id-card.css";

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
  if (/template[\s_-]*1|id[\s_-]*card|classic/.test(value)) return "template_1";
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

function getRecordField(record: ProjectDataRecord, fieldName: TemplateFieldName): string {
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

function resolveStudentPhotoUrl(record: ProjectDataRecord): string {
  const photoRaw = getRecordField(record, "photo");
  const normalized = resolveProfileImageUrl(photoRaw);
  if (!normalized) return FALLBACK_AVATAR;
  const isAllowed = /^(data:image\/|blob:|https?:\/\/|\/uploads\/|uploads\/|\/)/i.test(normalized);
  return isAllowed ? normalized : FALLBACK_AVATAR;
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
  if (template.thumbnail && template.thumbnail.trim()) return template.thumbnail;
  if (template.canvasJSON) {
    try {
      const parsed = JSON.parse(template.canvasJSON) as Record<string, unknown>;
      const pageCanvas = Array.isArray(parsed.pages)
        ? ((parsed.pages[0] as { canvas?: Record<string, unknown> } | undefined)?.canvas || null)
        : null;
      const rootCanvas = (parsed.canvas as Record<string, unknown> | undefined) || pageCanvas || {};
      const bgObject = (rootCanvas.backgroundImage as Record<string, unknown> | undefined) || {};
      const bgSrc = String(bgObject.src || "").trim();
      if (bgSrc) return bgSrc;
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
  const sourceWidthPx = Math.max(1, Number(template.canvas?.width || 0) * MM_TO_PX || CARD_WIDTH_PX);
  const sourceHeightPx = Math.max(1, Number(template.canvas?.height || 0) * MM_TO_PX || CARD_HEIGHT_PX);
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
}: {
  student: ProjectDataRecord;
  template: ProjectTemplate | null;
}) {
  const config = resolveTemplateConfig(template);
  const name = getRecordField(student, "name") || "-";
  const admissionNo = getRecordField(student, "admissionNo") || "-";
  const className = getRecordField(student, "class") || "-";
  const photoUrl = resolveStudentPhotoUrl(student);
  const scaleX = config.usesCanvasScaling ? CARD_WIDTH_PX / config.sourceWidthPx : 1;
  const scaleY = config.usesCanvasScaling ? CARD_HEIGHT_PX / config.sourceHeightPx : 1;

  return (
    <article className="card" style={{ width: CARD_WIDTH_PX, height: CARD_HEIGHT_PX }}>
      <img className="bg" src={config.background} alt="Template background" crossOrigin="anonymous" draggable={false} />

      <img
        className="photo"
        src={photoUrl}
        alt={name || "Student"}
        crossOrigin="anonymous"
        style={getFieldStyle(config.layout.photo, scaleX, scaleY)}
      />

      <p className="id-field text name" style={getFieldStyle(config.layout.name, scaleX, scaleY)}>{name}</p>
      <p className="id-field text" style={getFieldStyle(config.layout.admissionNo, scaleX, scaleY)}>{admissionNo}</p>
      <p className="id-field text" style={getFieldStyle(config.layout.class, scaleX, scaleY)}>{className}</p>
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
        {students.map((student, index) => (
          <IdCard key={`${student.id}-${index}`} student={student} template={template} />
        ))}
      </div>
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
