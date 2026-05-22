import { useParams, Link, useNavigate, useLocation, useSearchParams } from "react-router";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as fabric from "fabric";
import {
  ArrowLeft, Plus, Trash2, Edit, Upload, FileText,
  CheckCircle2, Circle, Clock, MoreVertical, Download,
  Package, ListTodo, FolderOpen, Database, Layers, Printer, Pencil, FilePlus, X,
  Filter, MoreHorizontal, UserCircle, FileSpreadsheet, Settings2, Users, GripVertical,
  Crop, Wand2, RotateCcw, ImageIcon, UserPlus, FileDown, Archive, Camera, Loader2,
  QrCode, UserRound, AlertTriangle, Globe, ChevronDown, LayoutGrid,
  ChevronLeft, ChevronRight, Minus, Maximize2, GitBranch,
} from "lucide-react";
import JSZip from "jszip";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  loadProjectProducts, addProjectProduct, deleteProjectProduct,
  loadProjectTasks, addProjectTask, updateProjectTask, deleteProjectTask,
  loadProjectFiles, addProjectFile, deleteProjectFile,
  loadProjectTemplates, loadAllProjectTemplates, addProjectTemplate, deleteProjectTemplate, updateProjectTemplate,
  loadDataFields, saveDataFields, loadDataGroups, addDataGroup, deleteDataGroup, updateDataGroup,
  loadDataRecords, saveDataRecords, deleteDataRecord, updateDataRecord,
  type ProjectProduct, type ProjectTask, type ProjectFile, type ProjectTemplate,
  type DataCategory, type ProjectDataField, type ProjectDataGroup, type ProjectDataRecord,
} from "../../lib/projectStore";
import {
  fetchProjectById as apiFetchProjectById,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
  resolveProfileImageUrl,
  uploadImages,
  fetchProjectRecords,
  saveProjectRecords,
  deleteProjectRecords,
  API_BASE,
} from "../../lib/apiService";
import { DESIGNER_CONTEXT_KEY } from "../../lib/fabricUtils";
import { BulkImportWizard } from "../components/BulkImportWizard";
import { IdCard, IdCardGrid, getTemplateSlugForRender } from "../components/preview/TemplateRenderer";
import { createTemplate, getTemplateById, deleteTemplate, resolveTemplatePreview, getProjectTemplateCacheData, invalidateTemplateCache, setProjectTemplateCacheData, type TemplateRecord } from "../../lib/templateApi";
import { toast } from "sonner";
import { matchImages } from "../../lib/imageMatchEngine";
import { useGenerateMissingPreviews } from "../../lib/useGenerateMissingPreviews";
import { subscribeToTemplateUpdates } from "../../lib/realtime";
import { getRulesByProject, evaluateRule, type PrintRule } from "../../lib/ruleBuilderApi";

// ─── Template dialog types ───────────────────────────────────────────────────
type PageFormat = "a4" | "13x19" | "custom";
const PAGE_FORMAT_SIZES: Record<PageFormat, { width: number; height: number }> = {
  a4:    { width: 297, height: 210 },
  "13x19": { width: 330, height: 482 },
  custom:  { width: 210, height: 297 },
};
const TEMPLATE_TYPES: { value: ProjectTemplate["templateType"]; label: string }[] = [
  { value: "id_card",     label: "ID Card" },
  { value: "certificate", label: "Certificate" },
  { value: "poster",      label: "Poster" },
  { value: "custom",      label: "Custom" },
];

type PreviewTemplateOption = ProjectTemplate & { isGlobal?: boolean };
const MONGODB_OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

function resolveTemplateLookupId(template: PreviewTemplateOption | null | undefined): string {
  if (!template) return "";
  const remoteId = String((template as any).remoteId || "").trim();
  if (MONGODB_OBJECT_ID_RE.test(remoteId)) return remoteId;
  return String(template.id || "").trim();
}

function mapApiTemplateToProjectTemplate(template: TemplateRecord): PreviewTemplateOption {
  const designData = (template.designData || {}) as Record<string, any>;
  const canvas = (designData.canvas && typeof designData.canvas === "object") ? designData.canvas : {};
  const margin = (designData.margin && typeof designData.margin === "object") ? designData.margin : {};
  const canvasJSON = typeof designData.canvasJSON === "string"
    ? designData.canvasJSON
    : (typeof designData.canvasJson === "string" ? designData.canvasJson : "");
  const rawApplicableFor = designData.applicableFor;
  const applicableFor = Array.isArray(rawApplicableFor)
    ? rawApplicableFor.join(", ")
    : (rawApplicableFor ? String(rawApplicableFor) : "");

  return {
    id: template._id,
    remoteId: template._id,
    projectId: String(template.projectId || template.productId || ""),
    clientId: String((template as any).clientId || ""),
    templateName: template.templateName,
    templateType: (designData.templateType as ProjectTemplate["templateType"]) || "custom",
    canvas: {
      width: Number(canvas.width || 0) || 0,
      height: Number(canvas.height || 0) || 0,
    },
    margin: {
      top: Number(margin.top || 0) || 0,
      left: Number(margin.left || 0) || 0,
      right: Number(margin.right || 0) || 0,
      bottom: Number(margin.bottom || 0) || 0,
    },
    applicableFor,
    createdAt: template.createdAt,
    canvasJSON: canvasJSON || undefined,
    thumbnail: resolveTemplatePreview(template, { fallbackToPlaceholder: false }) || undefined,
    isPublic: template.isGlobal === true,
    isGlobal: template.isGlobal === true,
  };
}
const emptyTemplateForm = {
  templateName: "",
  templateType: "id_card" as ProjectTemplate["templateType"],
  pageFormat: "a4" as PageFormat,
  canvas: { width: 297, height: 210 },
  margin: { top: 1, left: 1, right: 1, bottom: 1 },
  applicableFor: "",
  isPublic: false,
};

const STAGES = [
  "draft", "data-uploaded", "designing", "proof-sent",
  "approved", "printing", "dispatched", "delivered",
];
const STAGE_LABELS: Record<string, string> = {
  "draft": "Draft", "data-uploaded": "Data Uploaded", "designing": "Designing",
  "proof-sent": "Proof Sent", "approved": "Approved", "printing": "Printing",
  "dispatched": "Dispatched", "delivered": "Delivered",
};

const PRODUCT_CATEGORIES = [
  "ID Card", "Lanyard", "Year Book", "Photo Book",
  "Calendar", "Certificate", "Diary", "Album", "Other",
];

const emptyProductForm = { productName: "", spec: "", quantity: "1", unitPrice: "" };
const emptyTaskForm = { title: "", assignee: "", dueDate: "", status: "pending" as ProjectTask["status"] };
const emptyFileForm = { name: "", category: "other" as ProjectFile["category"] };

type PreviewPageSize = "A4" | "A3" | "Letter" | "Legal" | "Custom";

// ─── Template Mapping for Field-Based Selection ────────────────────────────

interface TemplateMappingRule {
  id: string;
  fieldName: string;
  fieldValue: string;
  templateId: string;
}

interface PreviewGenerationForm {
  pageSize: PreviewPageSize;
  templateId: string;
  orientation: "portrait" | "landscape";
  templateType: ProjectTemplate["templateType"];
  isSample: "yes" | "no";
  sheetWidthMm: string;
  sheetHeightMm: string;
  pageMarginTopMm: string;
  pageMarginLeftMm: string;
  rowMarginMm: string;
  columnMarginMm: string;
  cardWidthMm: string;
  cardHeightMm: string;
  fileName: string;
  // Field-based template assignment
  useFieldBasedMapping: boolean;
  templateMappings: TemplateMappingRule[];
  fallbackTemplateId: string;
  // Rule-based template assignment (from saved Rule Builder rules)
  useRuleBasedMapping: boolean;
}

const PAGE_SIZE_DIMENSIONS: Record<Exclude<PreviewPageSize, "Custom">, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
};

const emptyPreviewForm: PreviewGenerationForm = {
  pageSize: "A4",
  templateId: "",
  orientation: "portrait",
  templateType: "id_card",
  isSample: "no",
  sheetWidthMm: "210",
  sheetHeightMm: "297",
  pageMarginTopMm: "8",
  pageMarginLeftMm: "8",
  rowMarginMm: "4",
  columnMarginMm: "4",
  cardWidthMm: "54",
  cardHeightMm: "86",
  fileName: "preview",
  useFieldBasedMapping: false,
  templateMappings: [],
  fallbackTemplateId: "",
  useRuleBasedMapping: false,
};

const previewMappingStorageKey = (projectId: string, category: DataCategory) =>
  `project-preview-mapping:${projectId}:${category}`;

function sanitizeTemplateMappings(input: unknown): TemplateMappingRule[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, idx) => {
      const obj = (item && typeof item === "object") ? (item as Record<string, unknown>) : null;
      if (!obj) return null;
      return {
        id: String(obj.id ?? `mapping-${idx}`),
        fieldName: String(obj.fieldName ?? ""),
        fieldValue: String(obj.fieldValue ?? ""),
        templateId: String(obj.templateId ?? ""),
      };
    })
    .filter((mapping): mapping is TemplateMappingRule => Boolean(mapping));
}

const GROUP_FILTER_ALL = "__all__";

const emptyNewGroupFilters = {
  classValue: GROUP_FILTER_ALL,
  gender: GROUP_FILTER_ALL,
  transport: GROUP_FILTER_ALL,
  boarding: GROUP_FILTER_ALL,
  house: GROUP_FILTER_ALL,
};

const GROUP_FILTER_SOURCE_KEYS = {
  classValue: ["Class", "class", "className", "Standard", "standard", "grade", "Grade"],
  gender: ["Gender", "gender", "sex", "Sex"],
  transport: ["Transport", "transport", "transportMode", "transport_mode"],
  boarding: ["Boarding", "boarding", "boardingStatus", "boarding_status", "boarder"],
  house: ["House", "house", "schoolHouse", "school_house"],
} as const;

const DEFAULT_GROUP_FILTER_OPTIONS = {
  classValue: ["Pre-Primary", "1-5", "6-8", "9-12"],
  gender: ["Male", "Female", "Other"],
  transport: ["Bus", "Van", "Self"],
  boarding: ["Day Scholar", "Hosteller"],
  house: ["Red", "Blue", "Green", "Yellow"],
} as const;

interface TemplatePreviewDiagnostics {
  hasValidLayoutJson: boolean;
  elementCount: number;
  hasDesignElements: boolean;
  hasThumbnail: boolean;
  hasRenderablePreview: boolean;
  requiredFieldKeys: string[];
  missingFieldKeys: string[];
  fallbackMessage: string;
}

const FIELD_KEY_ALIASES: Array<[string, string[]]> = [
  ["name", ["name", "studentname", "fullname", "candidate", "username"]],
  ["photo", ["photo", "photourl", "profilepic", "profileimage", "image", "avatar", "picture"]],
  ["class", ["class", "classname", "standard", "grade"]],
  ["gender", ["gender", "sex"]],
  ["house", ["house", "schoolhouse"]],
  ["transport", ["transport", "transportmode"]],
  ["boarding", ["boarding", "boardingstatus", "boarder"]],
];

function normalizeFieldKey(rawKey: string): string {
  return String(rawKey || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toCanonicalFieldKey(rawKey: string): string {
  const normalized = normalizeFieldKey(rawKey);
  if (!normalized) return "";
  for (const [canonical, aliases] of FIELD_KEY_ALIASES) {
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }
  return normalized;
}

function formatFieldLabel(canonicalKey: string): string {
  if (!canonicalKey) return "";
  return canonicalKey.charAt(0).toUpperCase() + canonicalKey.slice(1);
}

// ─── Live Fabric.js canvas preview (fallback when thumbnail absent) ──────────
const MM_TO_PX_PREVIEW = 96 / 25.4;

function TemplatePreviewCanvas({
  canvasJSON,
  canvasConfig,
  maxWidth = 320,
  maxHeight = 320,
}: {
  canvasJSON: string;
  canvasConfig: { width: number; height: number };
  maxWidth?: number;
  maxHeight?: number;
}) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const canvasPxW = Math.round(canvasConfig.width * MM_TO_PX_PREVIEW);
  const canvasPxH = Math.round(canvasConfig.height * MM_TO_PX_PREVIEW);
  const scale = Math.min(maxWidth / canvasPxW, maxHeight / canvasPxH, 1);

  // Stable JSON string ref so the effect deps don't churn on every render
  const canvasJSONRef = useRef(canvasJSON);
  canvasJSONRef.current = canvasJSON;

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    let fc: fabric.Canvas | null = null;
    let cancelled = false;

    let canvasData: object = {};
    try {
      const parsed = JSON.parse(canvasJSONRef.current) as Record<string, unknown>;
      if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        canvasData = ((parsed.pages[0] as Record<string, unknown>).canvas as object | undefined) ?? {};
      } else if (parsed.canvas && typeof parsed.canvas === "object") {
        canvasData = parsed.canvas as object;
      }
    } catch {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    try {
      fc = new fabric.Canvas(el, {
        width: canvasPxW,
        height: canvasPxH,
        selection: false,
        interactive: false,
        renderOnAddRemove: false,
      });

      fc.loadFromJSON(JSON.stringify(canvasData)).then(() => {
        if (cancelled || !fc) return;
        fc.getObjects().forEach((obj) => {
          obj.set({ selectable: false, evented: false, hasControls: false });
        });
        fc.renderAll();
        setIsLoading(false);
      }).catch(() => {
        if (!cancelled) { setHasError(true); setIsLoading(false); }
      });
    } catch {
      setHasError(true);
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
      try { fc?.dispose(); } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPxW, canvasPxH]);

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Layers className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Preview unavailable</p>
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-center">
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 bg-white/60 rounded"
          style={{ width: Math.round(canvasPxW * scale), height: Math.round(canvasPxH * scale) }}
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div
        className="shadow-md rounded border border-border overflow-hidden bg-white"
        style={{ width: Math.round(canvasPxW * scale), height: Math.round(canvasPxH * scale) }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: canvasPxW, height: canvasPxH }}>
          <canvas ref={canvasElRef} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function parseTemplateLayoutJSON(template: ProjectTemplate): Record<string, unknown> | null {
  if (!template.canvasJSON) return null;
  try {
    const parsed = JSON.parse(template.canvasJSON) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function extractTemplateLayoutObjects(layout: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!layout) return [];

  const objects: Array<Record<string, unknown>> = [];

  const pushCanvasObjects = (canvas: unknown) => {
    if (!canvas || typeof canvas !== "object") return;
    const canvasObjects = (canvas as { objects?: unknown }).objects;
    if (!Array.isArray(canvasObjects)) return;
    canvasObjects.forEach((obj) => {
      if (obj && typeof obj === "object") {
        objects.push(obj as Record<string, unknown>);
      }
    });
  };

  pushCanvasObjects(layout.canvas);

  const pages = (layout.pages as Array<{ canvas?: unknown }> | undefined) ?? [];
  pages.forEach((page) => pushCanvasObjects(page.canvas));

  return objects;
}

function collectTemplateRequiredFields(
  template: ProjectTemplate,
  layoutObjects: Array<Record<string, unknown>>
): string[] {
  const fields = new Set<string>();

  if (template.templateType === "id_card") {
    fields.add("name");
    fields.add("photo");
  } else if (template.templateType === "certificate") {
    fields.add("name");
  }

  layoutObjects.forEach((obj) => {
    const dynamicFieldCandidates = [
      obj.variableKey,
      obj.__fieldKey,
      obj.fieldKey,
      obj.dataKey,
      obj.photoField,
    ];

    dynamicFieldCandidates.forEach((candidate) => {
      if (typeof candidate !== "string") return;
      const canonical = toCanonicalFieldKey(candidate);
      if (canonical) fields.add(canonical);
    });

    const text = typeof obj.text === "string" ? obj.text : "";
    if (!text) return;
    const placeholderRegex = /\{([^{}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = placeholderRegex.exec(text)) !== null) {
      const canonical = toCanonicalFieldKey(match[1]);
      if (canonical) fields.add(canonical);
    }
  });

  return Array.from(fields);
}

function inspectTemplatePreview(
  template: ProjectTemplate,
  availableFieldKeys: Set<string>
): TemplatePreviewDiagnostics {
  const parsedLayout = parseTemplateLayoutJSON(template);
  const layoutObjects = extractTemplateLayoutObjects(parsedLayout);
  const elementCount = layoutObjects.length;
  const hasValidLayoutJson = Boolean(parsedLayout);
  const hasDesignElements = hasValidLayoutJson && elementCount > 0;
  const hasThumbnail = typeof template.thumbnail === "string" && template.thumbnail.trim().length > 0;
  const requiredFieldKeys = collectTemplateRequiredFields(template, layoutObjects);
  const missingFieldKeys = requiredFieldKeys.filter((fieldKey) => !availableFieldKeys.has(fieldKey));
  const hasRenderablePreview = hasDesignElements || hasThumbnail;

  return {
    hasValidLayoutJson,
    elementCount,
    hasDesignElements,
    hasThumbnail,
    hasRenderablePreview,
    requiredFieldKeys,
    missingFieldKeys,
    fallbackMessage: hasRenderablePreview ? "" : "No preview available. Please configure the template.",
  };
}

const mapApiProjectToUi = (p: any) => {
  const populatedClient = typeof p.clientId === "object" && p.clientId !== null ? p.clientId : null;
  const stage = String(p.stage || p.status || "draft");

  return {
    id: String(p._id || p.id),
    name: String(p.name || "Untitled Project"),
    client: String(p.client || populatedClient?.clientName || "Unknown Client"),
    clientId: String(populatedClient?._id || p.clientId || ""),
    stage,
    priority: (p.priority || "medium") as "urgent" | "high" | "medium" | "low",
    dueDate: String(p.dueDate || ""),
    assignee: String(p.assignee || ""),
    amount: Number(p.amount || 0),
    description: String(p.description || ""),
    workflowType: (p.workflowType || "variable_data") as "variable_data" | "direct_print",
    dataFieldsByCategory: (p.dataFieldsByCategory || p.dataFields || {}) as Record<string, ProjectDataField[]>,
    createdAt: String(p.createdAt || new Date().toISOString()),
  };
};

const getRecordPhoto = (rec: ProjectDataRecord): string => {
  // Only look at standard photo-specific fields.
  // Do NOT fall back to generic fields like rec.link — those are URL fields
  // that may contain non-photo URLs (social links, external refs, etc.)
  // and must not be auto-displayed as student photos.
  const candidate =
    rec.profilePic
    ?? rec.profilepic
    ?? rec.photoUrl
    ?? rec.photo_url
    ?? rec.imageUrl
    ?? rec.image_url
    ?? rec.photo
    ?? rec.Photo
    ?? rec.avatar
    ?? rec.Avatar;
  return typeof candidate === "string" ? candidate : "";
};

function isPhotoFieldKey(key: string): boolean {
  const normalized = String(key || "").toLowerCase().replace(/[\s_-]/g, "");
  return [
    "photo",
    "photourl",
    "photopath",
    "image",
    "imageurl",
    "avatar",
    "picture",
    "profileimage",
    "studentphoto",
  ].includes(normalized);
}

function deriveDataFieldsFromRecords(records: ProjectDataRecord[]): ProjectDataField[] {
  const seen = new Set<string>();
  const fields: ProjectDataField[] = [];
  const ignoredKeys = new Set(["id", "projectId", "category", "groupId", "_photoFilename"]);

  for (const record of records) {
    for (const key of Object.keys(record)) {
      const trimmed = String(key || "").trim();
      const normalized = trimmed.toLowerCase();
      if (!trimmed || ignoredKeys.has(trimmed) || ignoredKeys.has(normalized)) continue;
      if (normalized.startsWith("__")) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      fields.push({ key: trimmed, label: trimmed });
    }
  }

  return fields;
}

function getRecordPhotoUrl(rec: ProjectDataRecord): string {
  const value = getRecordPhoto(rec);
  return resolveProfileImageUrl(value);
}
const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23e2e8f0'/%3E%3Ccircle cx='18' cy='14' r='6' fill='%2394a3b8'/%3E%3Cellipse cx='18' cy='30' rx='10' ry='7' fill='%2394a3b8'/%3E%3C/svg%3E";
const MM_TO_PX = 96 / 25.4;
const PREVIEW_CARD_WIDTH_PX = 250;
const PREVIEW_CARD_HEIGHT_PX = 350;

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [project, setProject] = useState<ReturnType<typeof mapApiProjectToUi> | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  void version;

  // dialogs
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);

  // forms
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [productErrors, setProductErrors] = useState<Partial<typeof emptyProductForm>>({});
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [taskErrors, setTaskErrors] = useState<Partial<typeof emptyTaskForm>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const dataInputRef = useRef<HTMLInputElement>(null);
  const addFileDialogInputRef = useRef<HTMLInputElement>(null);

  // Add File dialog state
  const [isAddFileOpen, setIsAddFileOpen] = useState(false);
  const [addFileState, setAddFileState] = useState<{
    file: File | null;
    name: string;
    category: ProjectFile["category"];
  }>({ file: null, name: "", category: "other" });

  // ── Project Data tab state ──
  const dataUploadRef = useRef<HTMLInputElement>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [dataCategory, setDataCategory] = useState<DataCategory>("student");
  const [dataSubTab, setDataSubTab] = useState<"data" | "groups" | "fields">("data");
  const [dataRecords, setDataRecords] = useState<ProjectDataRecord[]>(() =>
    id ? loadDataRecords(id, "student") : []
  );
  const [dataFields, setDataFields] = useState<ProjectDataField[]>(() =>
    id ? loadDataFields(id, "student") : []
  );
  const [dataGroups, setDataGroups] = useState<ProjectDataGroup[]>(() =>
    id ? loadDataGroups(id, "student") : []
  );
  const [dataFilter, setDataFilter] = useState("");
  const [dataSelectedIds, setDataSelectedIds] = useState<Set<string>>(new Set());
  const [isEditFieldsOpen, setIsEditFieldsOpen] = useState(false);
  const [editFieldsDraft, setEditFieldsDraft] = useState<ProjectDataField[]>([]);
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTemplateId, setNewGroupTemplateId] = useState("");
  const [newGroupFilters, setNewGroupFilters] = useState({ ...emptyNewGroupFilters });

  // Reload data from localStorage whenever project id or category changes
  useEffect(() => {
    if (!id) return;
    setDataRecords(loadDataRecords(id, dataCategory));
    setDataFields(loadDataFields(id, dataCategory));
    setDataGroups(loadDataGroups(id, dataCategory));
    setDataSelectedIds(new Set());
  }, [id, dataCategory]);

  // ── Data action dialog state ──
  const photoUploadRef = useRef<HTMLInputElement>(null);
  const bulkImageFolderRef = useRef<HTMLInputElement>(null);
  const bulkImageZipRef = useRef<HTMLInputElement>(null);
  const [imageUploadTarget, setImageUploadTarget] = useState("selection");
  const [isBulkImageUploadOpen, setIsBulkImageUploadOpen] = useState(false);

  const [bulkImageProcessing, setBulkImageProcessing] = useState(false);
  const [bulkImageResults, setBulkImageResults] = useState<{
    matched: { userId: string; name: string; filename: string; imageUrl: string }[];
    unmatched: { filename: string; reason: string }[];
    duplicates: { filename: string; allMatchNames: string[]; appliedName: string }[];
  } | null>(null);
  const [isAddDataOpen, setIsAddDataOpen] = useState(false);
  const [addDataDraft, setAddDataDraft] = useState<Record<string, string>>({});
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState("");
  const [bulkEditValue, setBulkEditValue] = useState("");
  const [aiProcessing, setAiProcessing] = useState<string | null>(null);
  const [isGenerateBarcodeOpen, setIsGenerateBarcodeOpen] = useState(false);
  const [barcodeField, setBarcodeField] = useState("");
  const [isGeneratePreviewOpen, setIsGeneratePreviewOpen] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewForm, setPreviewForm] = useState<PreviewGenerationForm>(emptyPreviewForm);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(50);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  // Saved Rule Builder rules for this project — used in rule-based Generate Preview
  const [projectRules, setProjectRules] = useState<PrintRule[]>([]);
  // Per-record template assignments computed by applying saved rules to selected records
  const [ruleAssignments, setRuleAssignments] = useState<Record<number, string> | null>(null);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);

  // Template dialog state
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateErrors, setTemplateErrors] = useState<{ templateName?: string; applicableFor?: string }>({});
  const [previewTemplate, setPreviewTemplate] = useState<ProjectTemplate | null>(null);
  const [brokenTemplatePreviewIds, setBrokenTemplatePreviewIds] = useState<Record<string, true>>({});
  const [bgGeneratedPreviews, setBgGeneratedPreviews] = useState<Record<string, string>>({});
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<PreviewTemplateOption | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [remoteTemplates, setRemoteTemplates] = useState<PreviewTemplateOption[]>(() => {
    // Serve stale-while-revalidate: show cached data instantly if available
    if (!id) return [];
    const cached = getProjectTemplateCacheData(id);
    return cached ? cached.map(mapApiTemplateToProjectTemplate) : [];
  });
  const [remoteTemplatesLoading, setRemoteTemplatesLoading] = useState(() => {
    if (!id) return false;
    return getProjectTemplateCacheData(id) === null;
  });
  const [remoteTemplatesError, setRemoteTemplatesError] = useState("");
  const [remoteTemplatesVersion, setRemoteTemplatesVersion] = useState(0);
  const [selectedFullTemplate, setSelectedFullTemplate] = useState<TemplateRecord | null>(null);
  const [selectedFullTemplateLoading, setSelectedFullTemplateLoading] = useState(false);
  const [fullTemplatesCache, setFullTemplatesCache] = useState<Record<string, TemplateRecord>>({}); // Cache for multiple templates

  const updateTemplateMargin = (key: keyof typeof emptyTemplateForm.margin, val: number) =>
    setTemplateForm((f) => ({ ...f, margin: { ...f.margin, [key]: val } }));
  const updateTemplateCanvas = (key: keyof typeof emptyTemplateForm.canvas, val: number) =>
    setTemplateForm((f) => ({ ...f, canvas: { ...f.canvas, [key]: val } }));

  useEffect(() => {
    let mounted = true;
    if (!id) {
      setProject(null);
      setProjectLoading(false);
      return;
    }

    setProjectLoading(true);
    apiFetchProjectById(id)
      .then((data) => {
        if (!mounted) return;
        setProject(data ? mapApiProjectToUi(data) : null);
        setProjectLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setProject(null);
        setProjectLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, version]);

  useEffect(() => {
    let mounted = true;
    if (!id) {
      setRemoteTemplates([]);
      setRemoteTemplatesError("");
      return;
    }

    // Skip fetch if cache is still fresh (version 0 = initial mount with no forced refresh)
    if (remoteTemplatesVersion === 0 && getProjectTemplateCacheData(id) !== null) {
      return;
    }

    const requestUrl = `${API_BASE}/templates?projectId=${encodeURIComponent(id)}`;
    // Only show skeleton when we have no templates to display yet — avoids
    // blanking out cached data while a background refresh is in progress.
    setRemoteTemplatesLoading((prev) => (remoteTemplates.length === 0 ? true : prev));
    setRemoteTemplatesError("");

    // When remoteTemplatesVersion > 0 it means a forced refresh was requested
    // (e.g. after attaching a template). Bypass the browser's HTTP cache so we
    // always get the freshest data from the server even if Cache-Control
    // max-age has not expired yet.
    fetch(requestUrl, { cache: remoteTemplatesVersion > 0 ? 'no-cache' : 'default' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || json?.success === false) {
          throw new Error(json?.error || "Failed to load templates");
        }
        const items = Array.isArray(json?.data) ? (json.data as TemplateRecord[]) : [];
        console.log("Fetched Templates:", items);
        return items;
      })
      .then((items) => {
        if (!mounted) return;
        // Populate the frontend cache for this project
        setProjectTemplateCacheData(id, items);

        const mapped = items.map(mapApiTemplateToProjectTemplate);
        const deduped = Array.from(new Map(mapped.map((t) => [t.id, t])).values());
        setRemoteTemplates(deduped);

        // Sync thumbnails/canvasJSON back to localStorage: if a local template has a remoteId
        // that matches an API template, and the local copy lacks a thumbnail or canvasJSON, update it.
        const apiById = new Map(deduped.map((t) => [t.id, t]));
        loadAllProjectTemplates().forEach((localTmpl) => {
          if (!localTmpl.remoteId) return;
          const apiTmpl = apiById.get(localTmpl.remoteId);
          if (!apiTmpl) return;
          const needsUpdate =
            (!localTmpl.thumbnail && apiTmpl.thumbnail) ||
            (!localTmpl.canvasJSON && apiTmpl.canvasJSON);
          if (needsUpdate) {
            updateProjectTemplate(localTmpl.id, {
              thumbnail: localTmpl.thumbnail || apiTmpl.thumbnail,
              canvasJSON: localTmpl.canvasJSON || apiTmpl.canvasJSON,
            });
          }
        });
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn("[preview] Failed to load templates", error);
        setRemoteTemplates([]);
        setRemoteTemplatesError((error as Error).message || "Failed to load templates");
      })
      .finally(() => {
        if (mounted) setRemoteTemplatesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, remoteTemplatesVersion]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToTemplateUpdates(id, () => {
      setRemoteTemplatesVersion((v) => v + 1);
    });
    return unsubscribe;
  }, [id]);

  // Load saved Rule Builder rules for this project
  useEffect(() => {
    if (!id) return;
    getRulesByProject(id)
      .then((rules) => setProjectRules(rules.filter((r) => r.isActive !== false)))
      .catch(() => setProjectRules([]));
  }, [id]);

  // Fetch full template data (with canvasJSON) when a template is selected in preview form
  useEffect(() => {
    if (!previewForm.templateId || !isGeneratePreviewOpen) {
      setSelectedFullTemplate(null);
      return;
    }

    const lookupId = String(previewForm.templateId || "").trim();
    if (!lookupId) {
      setSelectedFullTemplate(null);
      return;
    }

    let mounted = true;
    setSelectedFullTemplateLoading(true);

    // Check cache first (by local id or remote MongoDB id alias)
    const cached = fullTemplatesCache[previewForm.templateId] || fullTemplatesCache[lookupId];
    if (cached) {
      if (mounted) {
        setSelectedFullTemplate(cached);
        setSelectedFullTemplateLoading(false);
      }
      return;
    }

    if (!MONGODB_OBJECT_ID_RE.test(lookupId)) {
      setSelectedFullTemplateLoading(false);
      return;
    }

    // Fetch from API
    const fetchFullTemplate = async () => {
      try {
        const template = await getTemplateById(lookupId, { timeoutMs: 30000 });
        if (mounted) {
          setSelectedFullTemplate(template);
          setFullTemplatesCache((prev) => ({
            ...prev,
            [lookupId]: template,
            [previewForm.templateId]: template,
          }));
          setSelectedFullTemplateLoading(false);
        }
      } catch (error) {
        console.warn("[preview] Failed to fetch full template data:", error);
        if (mounted) {
          setSelectedFullTemplateLoading(false);
        }
      }
    };

    fetchFullTemplate();

    return () => {
      mounted = false;
    };
  }, [previewForm.templateId, isGeneratePreviewOpen, fullTemplatesCache]);

  // Fetch full template data for field-based mapping templates
  useEffect(() => {
    if (!previewForm.useFieldBasedMapping || !isGeneratePreviewOpen) return;

    const templateIds = new Set<string>();
    const resolveMappedId = (templateId: string): string => String(templateId || "").trim();
    
    // Collect all template IDs from mappings
    previewForm.templateMappings.forEach((mapping) => {
      if (mapping.templateId) templateIds.add(resolveMappedId(mapping.templateId));
    });
    if (previewForm.fallbackTemplateId) templateIds.add(resolveMappedId(previewForm.fallbackTemplateId));

    // Fetch any missing templates
    const toFetch = Array.from(templateIds).filter((templateId) => {
      if (!templateId) return false;
      if (!MONGODB_OBJECT_ID_RE.test(templateId)) return false;
      return !fullTemplatesCache[templateId];
    });
    if (toFetch.length === 0) return;

    let mounted = true;

    const fetchTemplates = async () => {
      for (const templateId of toFetch) {
        try {
          const template = await getTemplateById(templateId, { timeoutMs: 15000 });
          if (mounted) {
            setFullTemplatesCache((prev) => ({ ...prev, [templateId]: template }));
          }
        } catch (error) {
          console.warn(`[preview] Failed to fetch template ${templateId}:`, error);
        }
      }
    };

    fetchTemplates();

    return () => {
      mounted = false;
    };
  }, [previewForm.useFieldBasedMapping, previewForm.templateMappings, previewForm.fallbackTemplateId, isGeneratePreviewOpen, fullTemplatesCache]);

  // Load data
  const products = id ? loadProjectProducts(id) : [];
  const tasks = id ? loadProjectTasks(id) : [];
  const files = id ? loadProjectFiles(id) : [];
  const templates = id ? loadProjectTemplates(id, project?.clientId ?? "") : [];
  const previewTemplates = useMemo(() => {
    const merged = new Map<string, PreviewTemplateOption>();
    // Lookup: remoteId (MongoDB _id) → API template
    const apiById = new Map(remoteTemplates.map((t) => [t.id, t]));
    // Lookup: remoteId → local template (for skipping duplication)
    const localByRemoteId = new Map<string, PreviewTemplateOption>();
    templates.forEach((t) => {
      const rid = (t as any).remoteId as string | undefined;
      if (rid) localByRemoteId.set(rid, t);
    });

    // Add API-only templates (no matching local template)
    remoteTemplates.forEach((template) => {
      if (!localByRemoteId.has(template.id)) {
        merged.set(template.id, template);
      }
    });

    // Add local templates, enriching with API metadata (thumbnail, canvas) when available
    templates.forEach((template) => {
      if (merged.has(template.id)) return;
      const remoteId = (template as any).remoteId as string | undefined;
      const apiVersion = remoteId ? apiById.get(remoteId) : undefined;
      merged.set(template.id, {
        ...template,
        // Prefer absolute SFTP URL from API; only fall back to local if it's also absolute.
        // Relative paths (/uploads/...) are intentionally excluded here — they 404 in dev
        // and the API always has the authoritative persisted copy.
        thumbnail:
          (apiVersion?.thumbnail?.startsWith('http') ? apiVersion.thumbnail : null)
          || (template.thumbnail?.startsWith('http') ? template.thumbnail : null)
          || apiVersion?.thumbnail
          || template.thumbnail
          || undefined,
        // Use API canvas dimensions if local has 0x0
        canvas:
          template.canvas?.width && template.canvas?.height
            ? template.canvas
            : (apiVersion?.canvas ?? template.canvas),
        isGlobal: apiVersion?.isGlobal ?? (template as any).isGlobal ?? false,
      } as PreviewTemplateOption);
    });

    // Deduplicate by templateName: collapses cards from past duplicate-attach operations
    // (before the E11000 guard was added). Prefer entries with absolute thumbnail URLs;
    // if both have the same quality, keep the more recent one (larger ObjectId string).
    const dedupedByName = new Map<string, PreviewTemplateOption>();
    for (const t of merged.values()) {
      const existing = dedupedByName.get(t.templateName);
      if (!existing) {
        dedupedByName.set(t.templateName, t);
      } else {
        const tGlobal = Boolean(t.isGlobal);
        const exGlobal = Boolean(existing.isGlobal);
        const tMongo = MONGODB_OBJECT_ID_RE.test(String(t.id || ""));
        const exMongo = MONGODB_OBJECT_ID_RE.test(String(existing.id || ""));
        const tAbsolute = Boolean(t.thumbnail?.startsWith('http'));
        const exAbsolute = Boolean(existing.thumbnail?.startsWith('http'));
        if (tGlobal && !exGlobal) {
          dedupedByName.set(t.templateName, t);
        } else if (tMongo && !exMongo) {
          dedupedByName.set(t.templateName, t);
        } else if (tAbsolute && !exAbsolute) {
          dedupedByName.set(t.templateName, t);
        } else if (tAbsolute === exAbsolute && t.id > existing.id) {
          dedupedByName.set(t.templateName, t);
        }
      }
    }

    return Array.from(dedupedByName.values());
  }, [remoteTemplates, templates]);

  // Single source for preview dropdowns: live Template Gallery + project templates from API.
  // This intentionally avoids local-only template copies and grouped sections.
  const galleryTemplateOptions = useMemo(() => {
    const seenByName = new Set<string>();
    const deduped: PreviewTemplateOption[] = [];

    remoteTemplates.forEach((template) => {
      const key = String(template.templateName || "").trim().toLowerCase();
      if (!key || seenByName.has(key)) return;
      seenByName.add(key);
      deduped.push(template);
    });

    return deduped.sort((a, b) =>
      a.templateName.localeCompare(b.templateName, undefined, { sensitivity: "base" })
    );
  }, [remoteTemplates]);

  const availableTemplateFieldKeys = useMemo(() => {
    const keys = new Set<string>();

    dataFields.forEach((field) => {
      const fromKey = toCanonicalFieldKey(field.key);
      const fromLabel = toCanonicalFieldKey(field.label);
      if (fromKey) keys.add(fromKey);
      if (fromLabel) keys.add(fromLabel);
    });

    dataRecords.slice(0, 500).forEach((record) => {
      Object.keys(record).forEach((recordKey) => {
        const canonical = toCanonicalFieldKey(recordKey);
        if (canonical) keys.add(canonical);
      });
    });

    return keys;
  }, [dataFields, dataRecords]);

  const templateDiagnosticsMap = useMemo(() => {
    const diagnostics: Record<string, TemplatePreviewDiagnostics> = {};
    templates.forEach((template) => {
      diagnostics[template.id] = inspectTemplatePreview(template, availableTemplateFieldKeys);
    });
    return diagnostics;
  }, [templates, availableTemplateFieldKeys]);

  const previewTemplateDiagnosticsMap = useMemo(() => {
    const diagnostics: Record<string, TemplatePreviewDiagnostics> = {};
    previewTemplates.forEach((template) => {
      diagnostics[template.id] = inspectTemplatePreview(template, availableTemplateFieldKeys);
    });
    return diagnostics;
  }, [previewTemplates, availableTemplateFieldKeys]);

  const selectedPreviewTemplateDiagnostics = previewTemplate
    ? templateDiagnosticsMap[previewTemplate.id]
    : undefined;

  // These will be properly defined after selectedRecords, but stub here for dependency ordering
  let selectedGenerateTemplate: PreviewTemplateOption | null = null;
  let selectedGenerateTemplateSlug = "";
  let selectedGenerateTemplateDiagnostics: TemplatePreviewDiagnostics | undefined;

  const canRenderSelectedTemplateImage = Boolean(
    previewTemplate
    && (
      previewTemplate.thumbnail
      || bgGeneratedPreviews[previewTemplate.id]
      || bgGeneratedPreviews[((previewTemplate as any).remoteId as string) ?? ""]
    )
    && !brokenTemplatePreviewIds[previewTemplate.id]
  );

  const markTemplatePreviewBroken = (templateId: string) => {
    setBrokenTemplatePreviewIds((prev) => {
      if (prev[templateId]) return prev;
      return { ...prev, [templateId]: true };
    });
  };

  // Auto-generate missing previews in the background for templates without a thumbnail.
  // Only pass valid MongoDB IDs (24-char hex) — local TMPL-xxxx IDs won't be found by the API.
  const brokenUrlIdsSet = useMemo(
    () => new Set(Object.keys(brokenTemplatePreviewIds)),
    [brokenTemplatePreviewIds]
  );
  const missingPreviewTemplateIds = useMemo(() => {
    return previewTemplates
      .filter((t) => {
        const remoteId = (t as any).remoteId as string | undefined;
        const thumb = t.thumbnail || bgGeneratedPreviews[t.id] || bgGeneratedPreviews[remoteId ?? ""];
        return !thumb || brokenTemplatePreviewIds[t.id];
      })
      .map((t) => ((t as any).remoteId as string | undefined) || t.id)
      .filter((mongoId) => /^[0-9a-f]{24}$/i.test(mongoId));
  }, [previewTemplates, bgGeneratedPreviews, brokenTemplatePreviewIds]);

  const handleBgPreviewGenerated = useCallback((mongoId: string, url: string) => {
    setBgGeneratedPreviews((prev) => (prev[mongoId] === url ? prev : { ...prev, [mongoId]: url }));
  }, []);

  useGenerateMissingPreviews(missingPreviewTemplateIds, brokenUrlIdsSet, handleBgPreviewGenerated);

  const refresh = () => setVersion((v) => v + 1);

  /** Remove a template from this project only — does NOT touch the Template Gallery. */
  const handleDeleteProjectTemplate = useCallback(async (tmpl: PreviewTemplateOption) => {
    // Resolve the MongoDB ID (remoteId takes priority; fall back to id if it looks like one).
    const mongoId =
      MONGODB_OBJECT_ID_RE.test(String((tmpl as any).remoteId || ""))
        ? String((tmpl as any).remoteId)
        : MONGODB_OBJECT_ID_RE.test(String(tmpl.id || ""))
          ? String(tmpl.id)
          : "";

    // 1. Optimistically remove from remoteTemplates state so UI updates instantly.
    setRemoteTemplates((prev) =>
      prev.filter((t) => {
        if (t.id === tmpl.id) return false;
        if (mongoId && t.id === mongoId) return false;
        if (mongoId && String((t as any).remoteId || "") === mongoId) return false;
        return true;
      })
    );

    // 2. Remove ALL matching localStorage entries — by direct id AND by remoteId.
    //    Templates added via the Edit flow use 'TMPL-edit-<mongoId>' as their local id
    //    with remoteId pointing to the same MongoDB document. Both must be purged so
    //    they don't reappear from localStorage on the next render.
    const allLocal = loadAllProjectTemplates();
    const idsToDelete = new Set<string>();
    idsToDelete.add(tmpl.id);
    if (mongoId) idsToDelete.add(mongoId);
    allLocal.forEach((t) => {
      if (mongoId && String((t as any).remoteId || "") === mongoId) idsToDelete.add(t.id);
      if (t.templateName === tmpl.templateName && t.projectId === tmpl.projectId) idsToDelete.add(t.id);
    });
    idsToDelete.forEach((localId) => deleteProjectTemplate(localId));

    // 3. Immediately clear the per-project API cache from localStorage so that on
    //    page reload the stale data is not served and the skip-fetch guard doesn't fire.
    //    This must happen synchronously — before the async network call — so it takes
    //    effect even if the DELETE request fails or the user reloads during the await.
    if (id) invalidateTemplateCache(id);

    // 4. Delete from MongoDB if it has a backend record.
    //    Project-specific templates (isGlobal = false) are NOT in the Template Gallery,
    //    so this only removes the project copy — the gallery is unaffected.
    if (mongoId) {
      try {
        await deleteTemplate(mongoId);
      } catch {
        // Non-fatal: record is already removed from UI and cache is cleared.
      }
    }

    // 5. Force a background re-fetch from MongoDB to confirm the deletion persisted.
    //    This catches the edge case where the network delete failed — the template
    //    will reappear (expected), letting the user know the operation didn't succeed.
    setRemoteTemplatesVersion((v) => v + 1);

    toast.error(`"${tmpl.templateName}" removed from project.`);
  }, [id]);

  // Generation counter — incremented every time the user explicitly mutates records
  // (Delete All, CSV import, apply bulk images, etc.).  The hydrateFromBackend effect
  // snapshots this value before its async fetch and aborts applying the result if the
  // counter has advanced, preventing stale backend data from overwriting user changes.
  const hydrateGenerationRef = useRef(0);

  // Keep data records durable in both local storage and backend.
  const persistDataRecords = useCallback((records: ProjectDataRecord[]) => {
    if (!id) return;
    // Bump generation so any in-flight hydrateFromBackend fetch knows to discard its result.
    hydrateGenerationRef.current += 1;
    saveDataRecords(id, dataCategory, records);
    setDataRecords(records);
    void saveProjectRecords(id, dataCategory, records).then((ok) => {
      if (!ok) {
        console.warn("[ProjectDetail] Failed to sync records to backend; local copy is kept.");
      }
    });
  }, [id, dataCategory]);

  // Hydrate records from backend when available so refresh/navigation restores server state.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Snapshot the generation at the time the effect fires.  If persistDataRecords is
    // called while the fetch is in-flight, the counter will differ and we skip applying.
    const generation = hydrateGenerationRef.current;

    const hydrateFromBackend = async () => {
      const remote = await fetchProjectRecords(id, dataCategory);
      // Abort if the component unmounted or if the user made changes while we were fetching.
      if (cancelled || remote === null) return;
      if (hydrateGenerationRef.current !== generation) {
        // User has mutated records (Delete All / CSV import / apply photos) since this
        // fetch started — applying stale backend data would overwrite their changes.
        console.info('[ProjectDetail] hydrateFromBackend: skipping stale result (generation mismatch)');
        return;
      }

      const normalized: ProjectDataRecord[] = remote.map((record, idx) => {
        const rawId = String((record as Record<string, unknown>).id ?? "").trim();
        const safeId = rawId || `REC-${Date.now()}-${idx}`;
        return {
          ...record,
          id: safeId,
          projectId: id,
          category: dataCategory,
        } as ProjectDataRecord;
      });

      saveDataRecords(id, dataCategory, normalized);
      setDataRecords(normalized);
    };

    void hydrateFromBackend();
    return () => {
      cancelled = true;
    };
  }, [id, dataCategory]);

  useEffect(() => {
    if (!id) return;

    const projectFields = project?.dataFieldsByCategory?.[dataCategory];
    if (Array.isArray(projectFields) && projectFields.length > 0) {
      setDataFields(projectFields);
      saveDataFields(id, dataCategory, projectFields);
      return;
    }

    const localFields = loadDataFields(id, dataCategory);
    if (localFields.length > 0) {
      setDataFields(localFields);
      return;
    }

    const derivedFields = deriveDataFieldsFromRecords(dataRecords);
    if (derivedFields.length > 0) {
      setDataFields(derivedFields);
      saveDataFields(id, dataCategory, derivedFields);
    }
  }, [id, dataCategory, project, dataRecords]);

  // Persist field-based template mapping draft so it survives refresh/navigation.
  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(previewMappingStorageKey(id, dataCategory));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setPreviewForm((prev) => ({
        ...prev,
        useFieldBasedMapping: Boolean(parsed.useFieldBasedMapping),
        templateMappings: sanitizeTemplateMappings(parsed.templateMappings),
        fallbackTemplateId: String(parsed.fallbackTemplateId ?? ""),
      }));
    } catch {
      // Ignore malformed storage and continue with defaults.
    }
  }, [id, dataCategory]);

  useEffect(() => {
    if (!id) return;
    const draft = {
      useFieldBasedMapping: previewForm.useFieldBasedMapping,
      templateMappings: previewForm.templateMappings,
      fallbackTemplateId: previewForm.fallbackTemplateId,
    };
    try {
      localStorage.setItem(previewMappingStorageKey(id, dataCategory), JSON.stringify(draft));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [
    id,
    dataCategory,
    previewForm.useFieldBasedMapping,
    previewForm.templateMappings,
    previewForm.fallbackTemplateId,
  ]);

  // Handle returning from Template Gallery: switch to templates tab and refresh
  useEffect(() => {
    if (searchParams.get("tab") === "templates") {
      setActiveTab("templates");
    }
    const justAttached = (location.state as any)?.justAttachedTemplate;
    if (justAttached) {
      // Optimistic update: immediately insert the newly attached template so it
      // appears without waiting for the background re-fetch to complete.
      if (!justAttached.alreadyExists) {
        const mapped = mapApiTemplateToProjectTemplate(justAttached as TemplateRecord);
        setRemoteTemplates((prev) => {
          if (prev.some((t) => t.id === mapped.id)) return prev;
          return [...prev, mapped];
        });
      }
      // Also trigger a full background refresh for data consistency
      setVersion((v) => v + 1);
      setRemoteTemplatesVersion((v) => v + 1);
      setActiveTab("templates");
      // Clear the navigation state so this doesn't re-trigger on back/forward
      window.history.replaceState({}, "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, searchParams]);

  // ── Template handlers ──
  const validateTemplate = () => {
    const e: { templateName?: string; applicableFor?: string } = {};
    if (!templateForm.templateName.trim()) e.templateName = "Required";
    setTemplateErrors(e);
    return Object.keys(e).length === 0;
  };

  const createBlankTemplateThumbnail = (widthMm: number, heightMm: number) => {
    const pxPerMm = 96 / 25.4;
    const widthPx = Math.max(1, Math.round(widthMm * pxPerMm));
    const heightPx = Math.max(1, Math.round(heightMm * pxPerMm));
    const c = document.createElement("canvas");
    c.width = widthPx;
    c.height = heightPx;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, widthPx - 2, heightPx - 2);
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.max(12, Math.floor(Math.min(widthPx, heightPx) * 0.12));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.fillText("No Design", widthPx / 2, heightPx / 2);
    return c.toDataURL("image/png");
  };

  const handleCreateTemplate = async () => {
    if (!validateTemplate() || !id) return;
    const thumb = createBlankTemplateThumbnail(templateForm.canvas.width, templateForm.canvas.height);
    const localTemplate = addProjectTemplate({
      projectId: id,
      clientId: project?.clientId ?? "",
      templateName: templateForm.templateName,
      templateType: templateForm.templateType,
      canvas: templateForm.canvas,
      margin: templateForm.margin,
      applicableFor: templateForm.applicableFor,
      thumbnail: thumb,
      isPublic: templateForm.isPublic,
    });

    setTemplateForm(emptyTemplateForm);
    setTemplateErrors({});
    setIsCreateTemplateOpen(false);
    setActiveTab("templates");

    setIsTemplateSaving(true);
    try {
      const remoteTemplate = await createTemplate({
        projectId: id,
        templateName: localTemplate.templateName,
        preview_image: thumb,
        category: "Other",
        designData: {
          templateType: localTemplate.templateType,
          canvas: localTemplate.canvas,
          margin: localTemplate.margin,
          applicableFor: localTemplate.applicableFor,
        },
        isGlobal: localTemplate.isPublic,
        isPublic: localTemplate.isPublic,
      });

      updateProjectTemplate(localTemplate.id, { remoteId: remoteTemplate._id });
      const mappedRemote = mapApiTemplateToProjectTemplate(remoteTemplate);
      setRemoteTemplates((prev) => {
        const next = new Map(prev.map((item) => [item.id, item]));
        next.set(mappedRemote.id, mappedRemote);
        return Array.from(next.values());
      });
      setRemoteTemplatesVersion((v) => v + 1);
    } catch (error) {
      console.warn("[templates] Failed to persist project template to MongoDB", error);
    } finally {
      setIsTemplateSaving(false);
    }
  };

  const productTotal = products.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

  // â”€â”€ Product handlers â”€â”€
  const validateProduct = () => {
    const e: Partial<typeof emptyProductForm> = {};
    if (!productForm.productName.trim()) e.productName = "Required";
    if (!productForm.unitPrice || Number(productForm.unitPrice) <= 0) e.unitPrice = "Enter a valid price";
    if (!productForm.quantity || Number(productForm.quantity) <= 0) e.quantity = "Enter a valid qty";
    setProductErrors(e);
    return Object.keys(e).length === 0;
  };
  const handleAddProduct = () => {
    if (!validateProduct() || !id) return;
    addProjectProduct({
      projectId: id,
      productName: productForm.productName,
      spec: productForm.spec,
      quantity: Number(productForm.quantity),
      unitPrice: Number(productForm.unitPrice),
    });
    setProductForm(emptyProductForm);
    setProductErrors({});
    setIsAddProductOpen(false);
    refresh();
  };

  // â”€â”€ Task handlers â”€â”€
  const validateTask = () => {
    const e: Partial<typeof emptyTaskForm> = {};
    if (!taskForm.title.trim()) e.title = "Required";
    setTaskErrors(e);
    return Object.keys(e).length === 0;
  };
  const handleAddTask = () => {
    if (!validateTask() || !id) return;
    if (editingTask) {
      updateProjectTask(editingTask.id, { ...taskForm });
    } else {
      addProjectTask({ projectId: id, ...taskForm });
    }
    setTaskForm(emptyTaskForm);
    setTaskErrors({});
    setIsAddTaskOpen(false);
    setEditingTask(null);
    refresh();
  };
  const openEditTask = (t: ProjectTask) => {
    setEditingTask(t);
    setTaskForm({ title: t.title, assignee: t.assignee, dueDate: t.dueDate, status: t.status });
    setIsAddTaskOpen(true);
  };
  const toggleTaskStatus = (t: ProjectTask) => {
    const next = t.status === "done" ? "pending" : t.status === "pending" ? "in-progress" : "done";
    updateProjectTask(t.id, { status: next });
    refresh();
  };

  // â”€â”€ File handler â”€â”€
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, category: ProjectFile["category"]) => {
    const flist = e.target.files;
    if (!flist || !id) return;
    Array.from(flist).forEach((f) => {
      addProjectFile({
        projectId: id,
        name: f.name,
        size: `${(f.size / 1024).toFixed(1)} KB`,
        fileType: f.type || "unknown",
        category,
      });
    });
    e.target.value = "";
    refresh();
  };

  const handleAddFileDialogSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAddFileState({ file: f, name: f.name, category: "other" });
    e.target.value = "";
  };

  const handleAddFileSubmit = () => {
    if (!addFileState.file || !id) return;
    addProjectFile({
      projectId: id,
      name: addFileState.name.trim() || addFileState.file.name,
      size: `${(addFileState.file.size / 1024).toFixed(1)} KB`,
      fileType: addFileState.file.type || "unknown",
      category: addFileState.category,
    });
    setAddFileState({ file: null, name: "", category: "other" });
    setIsAddFileOpen(false);
    refresh();
  };

  // ── Project Data handlers ──
  const switchDataCategory = (cat: DataCategory) => {
    if (!id) return;
    setDataCategory(cat);
    setDataRecords(loadDataRecords(id, cat));
    setDataFields(loadDataFields(id, cat));
    setDataGroups(loadDataGroups(id, cat));
    setDataFilter("");
    setDataSelectedIds(new Set());
  };

  const handleDataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const projectId = id; // capture before async
    const category = dataCategory; // capture before async
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || "";
      // Parse CSV (simple implementation without external lib)
      const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
      if (lines.length < 2) return;
      const parseRow = (line: string): string[] => {
        const result: string[] = [];
        let cur = "";
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; }
          else if (ch === "," && !inQuote) { result.push(cur.trim()); cur = ""; }
          else { cur += ch; }
        }
        result.push(cur.trim());
        return result;
      };
      const headers = parseRow(lines[0]);
      const newFields: ProjectDataField[] = headers.map((h) => ({ key: h, label: h }));
      const records: ProjectDataRecord[] = lines.slice(1).map((line, i) => {
        const vals = parseRow(line);
        const rec: ProjectDataRecord = {
          id: `REC-${Date.now()}-${i}`,
          projectId,
          category,
        };
        headers.forEach((h, idx) => {
          // Never import the photo field from CSV — photos are set only via bulk upload.
          const normalizedKey = h.toLowerCase().replace(/[\s_-]/g, '');
          const isPhotoKey = ['photo', 'link', 'image', 'picture', 'profilepic', 'avatar', 'profilepicture', 'profileimage', 'studentphoto', 'photourl', 'imageurl', 'pictureurl'].includes(normalizedKey);
          if (isPhotoKey) {
            // Preserve bare filenames for exact bulk-upload matching.
            // Discard full URLs (http://…) — they are external links, not filenames.
            const raw = (vals[idx] ?? '').trim();
            if (raw && !raw.includes('://') && !raw.startsWith('/') && normalizedKey !== 'link') {
              rec['_photoFilename'] = raw;
            }
            return;
          }
          rec[h] = vals[idx] ?? "";
        });
        return rec;
      });
      saveDataFields(projectId, category, newFields);
      persistDataRecords(records);
      setDataFields(newFields);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filteredRecords = dataRecords.filter((r) => {
    if (!dataFilter) return true;
    return Object.values(r).some((v) =>
      String(v).toLowerCase().includes(dataFilter.toLowerCase())
    );
  });

  const groupFilterOptions = useMemo(() => {
    const collectOptions = (candidateKeys: readonly string[], fallback: readonly string[]): string[] => {
      const values = new Set<string>();
      dataRecords.forEach((record) => {
        for (const key of candidateKeys) {
          const value = record[key];
          if (value === undefined || value === null) continue;
          const text = String(value).trim();
          if (!text) continue;
          values.add(text);
          break;
        }
      });

      const sorted = Array.from(values).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );

      return sorted.length > 0 ? sorted : [...fallback];
    };

    return {
      classValue: collectOptions(GROUP_FILTER_SOURCE_KEYS.classValue, DEFAULT_GROUP_FILTER_OPTIONS.classValue),
      gender: collectOptions(GROUP_FILTER_SOURCE_KEYS.gender, DEFAULT_GROUP_FILTER_OPTIONS.gender),
      transport: collectOptions(GROUP_FILTER_SOURCE_KEYS.transport, DEFAULT_GROUP_FILTER_OPTIONS.transport),
      boarding: collectOptions(GROUP_FILTER_SOURCE_KEYS.boarding, DEFAULT_GROUP_FILTER_OPTIONS.boarding),
      house: collectOptions(GROUP_FILTER_SOURCE_KEYS.house, DEFAULT_GROUP_FILTER_OPTIONS.house),
    };
  }, [dataRecords]);

  const resetAddGroupDialog = () => {
    setNewGroupName("");
    setNewGroupTemplateId("");
    setNewGroupFilters({ ...emptyNewGroupFilters });
  };

  const toggleSelectAll = () => {
    if (dataSelectedIds.size === filteredRecords.length) {
      setDataSelectedIds(new Set());
    } else {
      setDataSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const deleteSelected = () => {
    if (!id) return;
    const updated = dataRecords.filter((record) => !dataSelectedIds.has(record.id));
    persistDataRecords(updated);
    setDataSelectedIds(new Set());
  };

  const handleSaveFields = () => {
    if (!id) return;
    saveDataFields(id, dataCategory, editFieldsDraft);
    setDataFields(editFieldsDraft);
    setIsEditFieldsOpen(false);
  };

  const handleAddGroup = () => {
    if (!id || !newGroupName.trim()) return;
    const g = addDataGroup({
      projectId: id,
      name: newGroupName.trim(),
      category: dataCategory,
      templateId: newGroupTemplateId || undefined,
      classFilter: newGroupFilters.classValue === GROUP_FILTER_ALL ? undefined : newGroupFilters.classValue,
      genderFilter: newGroupFilters.gender === GROUP_FILTER_ALL ? undefined : newGroupFilters.gender,
      transportFilter: newGroupFilters.transport === GROUP_FILTER_ALL ? undefined : newGroupFilters.transport,
      boardingFilter: newGroupFilters.boarding === GROUP_FILTER_ALL ? undefined : newGroupFilters.boarding,
      houseFilter: newGroupFilters.house === GROUP_FILTER_ALL ? undefined : newGroupFilters.house,
    });
    setDataGroups((prev) => [...prev, g]);
    resetAddGroupDialog();
    setIsAddGroupOpen(false);
  };

  const handleGroupTemplateChange = (groupId: string, templateId: string) => {
    updateDataGroup(groupId, { templateId: templateId || undefined });
    setDataGroups((prev) =>
      prev.map((g) => g.id === groupId ? { ...g, templateId: templateId || undefined } : g)
    );
  };

  // â”€â”€ Stage update â”€â”€

  // Download Excel (CSV)
  const handleDownloadExcel = () => {
    if (!dataFields.length || !filteredRecords.length) return;
    const headers = dataFields.map((f) => f.label);
    const rows = filteredRecords.map((r) => dataFields.map((f) => String(r[f.key] ?? "")));
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "data"}_${dataCategory}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download Image Zip
  const handleDownloadImageZip = async () => {
    const records = dataSelectedIds.size > 0
      ? filteredRecords.filter((r) => dataSelectedIds.has(r.id))
      : filteredRecords;
    const withPhotos = records.filter((r) => Boolean(getRecordPhotoUrl(r)));
    if (!withPhotos.length) return;
    const zip = new JSZip();
    const folder = zip.folder("photos")!;
    for (let i = 0; i < withPhotos.length; i += 1) {
      const r = withPhotos[i];
      const src = getRecordPhotoUrl(r);
      if (!src) continue;

      let ext = "jpg";
      let base64 = "";

      if (src.startsWith("data:image/")) {
        const mime = src.slice(5, src.indexOf(";"));
        ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
        base64 = src.split(",")[1] || "";
      } else {
        try {
          const response = await fetch(src);
          if (!response.ok) continue;
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Image conversion failed"));
            reader.readAsDataURL(blob);
          });
          const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
          ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
          base64 = dataUrl.split(",")[1] || "";
        } catch {
          continue;
        }
      }

      if (!base64) continue;
      const name = String(r["Name"] ?? r["name"] ?? `record_${i + 1}`).replace(/[^a-z0-9]/gi, "_");
      folder.file(`${name}.${ext}`, base64, { base64: true });
    }
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "photos"}_${dataCategory}_images.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Add Data
  const handleOpenAddData = () => {
    const draft: Record<string, string> = {};
    dataFields.forEach((f) => { draft[f.key] = ""; });
    setAddDataDraft(draft);
    setIsAddDataOpen(true);
  };

  const handleCommitAddData = () => {
    if (!id) return;
    const rec: ProjectDataRecord = {
      id: `REC-${Date.now()}`,
      projectId: id,
      category: dataCategory,
      ...addDataDraft,
    };
    const updated = [...dataRecords, rec];
    persistDataRecords(updated);
    setAddDataDraft({});
    setIsAddDataOpen(false);
  };

  // Bulk Edit
  const handleCommitBulkEdit = () => {
    if (!id || !bulkEditField) return;
    const targetIds = dataSelectedIds.size > 0
      ? dataSelectedIds
      : new Set(dataRecords.map((r) => r.id));
    const updated = dataRecords.map((r) =>
      targetIds.has(r.id) ? { ...r, [bulkEditField]: bulkEditValue } : r
    );
    persistDataRecords(updated);
    setIsBulkEditOpen(false);
    setBulkEditField("");
    setBulkEditValue("");
  };

  // AI Image Auto Crop (canvas center-crop to square)
  const handleAIAutoCrop = async () => {
    const targetIds = dataSelectedIds.size > 0
      ? dataSelectedIds
      : new Set(filteredRecords.map((r) => r.id));
    const toProcess = dataRecords.filter((r) => targetIds.has(r.id) && Boolean(getRecordPhotoUrl(r)));
    if (!toProcess.length) return;
    setAiProcessing("autocrop");
    const doCrop = (dataUrl: string): Promise<string> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const size = Math.min(img.width, img.height);
          const c = document.createElement("canvas");
          c.width = size; c.height = size;
          c.getContext("2d")!.drawImage(
            img,
            (img.width - size) / 2, (img.height - size) / 2, size, size,
            0, 0, size, size
          );
          resolve(c.toDataURL("image/jpeg", 0.9));
        };
        img.src = dataUrl;
      });
    const updated = [...dataRecords];
    for (const rec of toProcess) {
      const i = updated.findIndex((r) => r.id === rec.id);
      const source = getRecordPhotoUrl(rec);
      if (i >= 0 && source) updated[i] = { ...updated[i], photo: await doCrop(source) };
    }
    if (id) persistDataRecords(updated);
    setAiProcessing(null);
  };

  // AI Image Background Remover (canvas corner-color threshold)
  const handleAIBgRemove = async () => {
    const targetIds = dataSelectedIds.size > 0
      ? dataSelectedIds
      : new Set(filteredRecords.map((r) => r.id));
    const toProcess = dataRecords.filter((r) => targetIds.has(r.id) && Boolean(getRecordPhotoUrl(r)));
    if (!toProcess.length) return;
    setAiProcessing("bgremove");
    const doRemoveBg = (dataUrl: string): Promise<string> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height);
          const px = d.data;
          const [cr, cg, cb] = [px[0], px[1], px[2]];
          const thresh = 40;
          for (let i = 0; i < px.length; i += 4) {
            if (Math.abs(px[i] - cr) + Math.abs(px[i + 1] - cg) + Math.abs(px[i + 2] - cb) < thresh * 3)
              px[i + 3] = 0;
          }
          ctx.putImageData(d, 0, 0);
          resolve(c.toDataURL("image/png"));
        };
        img.src = dataUrl;
      });
    const updated = [...dataRecords];
    for (const rec of toProcess) {
      const i = updated.findIndex((r) => r.id === rec.id);
      const source = getRecordPhotoUrl(rec);
      if (i >= 0 && source) updated[i] = { ...updated[i], photo: await doRemoveBg(source) };
    }
    if (id) persistDataRecords(updated);
    setAiProcessing(null);
  };

  // Reset Photo
  const handleResetPhoto = () => {
    if (!id) return;
    const targetIds = dataSelectedIds.size > 0
      ? dataSelectedIds
      : new Set(filteredRecords.map((r) => r.id));
    const updated = dataRecords.map((r) => {
      if (!targetIds.has(r.id)) return r;
      const next = { ...r } as Record<string, unknown>;
      delete next.photo;
      return next as ProjectDataRecord;
    });
    persistDataRecords(updated);
  };

  // Image Upload (match by filename, or direct assign when target set)
  const handleImageUploadFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !id) return;
    Promise.all(
      files.map((file) =>
        new Promise<{ file: File; dataUrl: string }>((resolve) => {
          const r = new FileReader();
          r.onload = (ev) => resolve({ file, dataUrl: ev.target!.result as string });
          r.readAsDataURL(file);
        })
      )
    ).then((results) => {
      const updated = [...dataRecords];
      const tgt = imageUploadTarget;
      if (tgt !== "selection") {
        if (results.length > 0) {
          const i = updated.findIndex((r) => r.id === tgt);
          if (i >= 0) updated[i] = { ...updated[i], photo: results[0].dataUrl };
        }
      } else {
        const targets = dataSelectedIds.size > 0
          ? filteredRecords.filter((r) => dataSelectedIds.has(r.id))
          : filteredRecords;
        if (targets.length === 1 && results.length === 1) {
          const i = updated.findIndex((r) => r.id === targets[0].id);
          if (i >= 0) updated[i] = { ...updated[i], photo: results[0].dataUrl };
        } else {
          results.forEach(({ file: f, dataUrl }) => {
            const baseName = f.name.replace(/\.[^.]+$/, "").toLowerCase().trim();
            const match = targets.find((r) => {
              // 1. Match by SchoolCode_AdmissionNumber prefix (e.g. "44837_10_Nitin_.jpg")
              const schoolCode = String(
                r["School Code"] ?? r["schoolCode"] ?? r["school_code"] ?? ""
              ).trim();
              const admNo = String(
                r["Admission Number"] ?? r["admissionNumber"] ?? r["admission_number"] ?? ""
              ).trim();
              if (schoolCode && admNo) {
                const prefix = `${schoolCode}_${admNo}_`.toLowerCase();
                if (baseName.startsWith(prefix)) return true;
              }
              // 2. Match by student name
              const name = String(r["Name"] ?? r["name"] ?? "").toLowerCase().trim();
              if (name === baseName || baseName.startsWith(name) || name.startsWith(baseName)) return true;
              // 3. Match by name tokens appearing in filename segments
              //    e.g. filename "44837_10_nitin_" contains segment "nitin" which matches name "nitin"
              if (name) {
                const segments = baseName.split("_").filter(Boolean);
                const nameTokens = name.split(/\s+/);
                if (nameTokens.every((token) => segments.includes(token))) return true;
              }
              // 4. Match by the record's existing photo field filename (for CSV-imported records
              //    where the photo column contains a filename like "44837_10_Nitin_.jpg").
              const existingPhoto = String(getRecordPhoto(r) || "");
              const existingFilename = existingPhoto
                .split("/").pop()!
                .replace(/\.[^.]+$/, "")
                .toLowerCase().trim();
              return existingFilename.length > 0 && (
                existingFilename === baseName ||
                baseName.startsWith(existingFilename) ||
                existingFilename.startsWith(baseName)
              );
            });
            if (match) {
              const i = updated.findIndex((r) => r.id === match.id);
              if (i >= 0) updated[i] = { ...updated[i], photo: dataUrl };
            }
          });
        }
      }
      persistDataRecords(updated);
      setImageUploadTarget("selection");
    });
    e.target.value = "";
  };

  // ── Bulk Image Upload (ZIP or folder) ────────────────────────────────────
  const processBulkImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
    if (!imageFiles.length || !id) return;
    setBulkImageProcessing(true);
    setBulkImageResults(null);

    try {
      // Upload images to the server — retry once on transient server errors (e.g. backend restart)
      let imageUrls: string[];
      try {
        imageUrls = await uploadImages(imageFiles);
      } catch (uploadErr) {
        // Wait 3 seconds and retry once
        await new Promise((res) => setTimeout(res, 3000));
        imageUrls = await uploadImages(imageFiles);
      }
      const loaded = imageFiles.map((file, idx) => ({
        file,
        imageUrl: imageUrls[idx] || '/uploads/assets/default.jpg'
      }));

      const bulkResult = matchImages(
        loaded.map(({ file, imageUrl }) => ({ name: file.name, dataUrl: imageUrl })),
        dataRecords,
      );

      setBulkImageResults({
        matched: bulkResult.matched.map((m) => ({
          userId: m.userId,
          name: m.name,
          filename: m.filename,
          imageUrl: m.dataUrl,
        })),
        unmatched: bulkResult.unmatched.map((u) => ({
          filename: u.filename,
          reason: u.reason,
        })),
        duplicates: bulkResult.duplicates.map((d) => ({
          filename: d.filename,
          allMatchNames: d.allMatches.map((m) => `${m.name} (${m.score}%)`),
          appliedName: d.appliedName,
        })),
      });
    } catch (err) {
      console.error('[Bulk Images] Upload error:', err);
      setBulkImageResults({
        matched: [],
        unmatched: [{ filename: 'Upload failed', reason: (err as Error).message }],
        duplicates: [],
      });
    } finally {
      setBulkImageProcessing(false);
    }
  };

  const handleBulkImageFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await processBulkImageFiles(files);
  };

  const handleBulkImageZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const zipFile = e.target.files?.[0];
    e.target.value = "";
    if (!zipFile) return;
    setBulkImageProcessing(true);
    setBulkImageResults(null);
    try {
      const zip = new JSZip();
      const loaded = await zip.loadAsync(zipFile);
      const imageEntries = Object.values(loaded.files).filter(
        (entry) => !entry.dir && /\.(jpe?g|png|webp|gif|bmp)$/i.test(entry.name)
      );
      const files: File[] = await Promise.all(
        imageEntries.map(async (entry) => {
          const blob = await entry.async("blob");
          // Use only the basename (not nested folder path)
          const basename = entry.name.split("/").pop() ?? entry.name;
          return new File([blob], basename, { type: blob.type || "image/jpeg" });
        })
      );
      // processBulkImageFiles will handle setBulkImageProcessing(false)
      await processBulkImageFiles(files);
    } catch {
      setBulkImageProcessing(false);
    }
  };

  const handleApplyBulkImages = () => {
    if (!id || !bulkImageResults) return;
    const updated = [...dataRecords];
    bulkImageResults.matched.forEach(({ userId, imageUrl }) => {
      const i = updated.findIndex((r) => r.id === userId);
      if (i >= 0) updated[i] = { ...updated[i], photo: imageUrl };
    });
    persistDataRecords(updated);
    setIsBulkImageUploadOpen(false);
    setBulkImageResults(null);
  };

  // ── Generate Bar Code (draws Code128-style bars onto a canvas per record) ──
  const handleGenerateBarcodes = () => {
    if (!id || !barcodeField) return;
    const targets = dataSelectedIds.size > 0
      ? dataRecords.filter((r) => dataSelectedIds.has(r.id))
      : dataRecords;
    const updated = [...dataRecords];
    targets.forEach((rec) => {
      const val = String(rec[barcodeField] ?? rec.id);
      const c = document.createElement("canvas");
      c.width = 200; c.height = 60;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 200, 60);
      ctx.fillStyle = "#000";
      // Simple visual barcode: alternate bar widths based on char codes
      let x = 4;
      const chars = val.split("");
      const slotW = Math.floor(192 / Math.max(chars.length * 3, 1));
      chars.forEach((ch) => {
        const code = ch.charCodeAt(0);
        [1, 0, 1].forEach((on, idx) => {
          const w = slotW * (on ? ((code >> idx) & 1 ? 2 : 1) : 1);
          if (on) ctx.fillRect(x, 4, w, 44);
          x += w + 1;
        });
      });
      // Label
      ctx.font = "9px monospace";
      ctx.fillText(val.slice(0, 28), 4, 58);
      const dataUrl = c.toDataURL("image/png");
      const i = updated.findIndex((r) => r.id === rec.id);
      if (i >= 0) updated[i] = { ...updated[i], barcode: dataUrl };
    });
    persistDataRecords(updated);
    setIsGenerateBarcodeOpen(false);
    setBarcodeField("");
  };

  const selectedRecords = dataRecords.filter((record) => dataSelectedIds.has(record.id));

  // Helper to enrich a template with full canvas data from cache if available
  const enrichTemplateWithCanvas = (template: PreviewTemplateOption | null): PreviewTemplateOption | null => {
    if (!template) return template;
    const lookupId = resolveTemplateLookupId(template);
    const fullTemplate = fullTemplatesCache[template.id] || fullTemplatesCache[lookupId];
    if (!fullTemplate) return template;
    // Extract canvasJSON from designData if it exists there
    const designDataAsRecord = fullTemplate.designData as any;
    const canvasJSON = designDataAsRecord?.canvasJSON || designDataAsRecord?.canvasJson;
    const thumbnail = resolveTemplatePreview(fullTemplate, { fallbackToPlaceholder: false }) || template.thumbnail;
    return {
      ...template,
      ...(canvasJSON ? { canvasJSON } : {}),
      ...(thumbnail ? { thumbnail } : {}),
    };
  };

  const findPreviewTemplateByLookupId = (lookupId: string): PreviewTemplateOption | null => {
    const id = String(lookupId || "").trim();
    if (!id) return null;
    return (
      previewTemplates.find((t) => t.id === id)
      || previewTemplates.find((t) => String((t as any).remoteId || "").trim() === id)
      || null
    );
  };

  const getRecordValueForField = (record: ProjectDataRecord, fieldName: string): string => {
    const name = String(fieldName || "").trim();
    if (!name) return "";

    const direct = String(record[name] ?? "").trim();
    if (direct) return direct;

    const caseInsensitiveKey = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase());
    if (caseInsensitiveKey) {
      const caseInsensitiveValue = String(record[caseInsensitiveKey] ?? "").trim();
      if (caseInsensitiveValue) return caseInsensitiveValue;
    }

    const normalizeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedName = normalizeKey(name);
    const normalizedKey = Object.keys(record).find((key) => normalizeKey(key) === normalizedName);
    if (normalizedKey) {
      return String(record[normalizedKey] ?? "").trim();
    }

    // Semantic fallbacks for common student-data fields.
    if (normalizedName.includes("admission") || normalizedName.includes("roll")) {
      const admissionKey = Object.keys(record).find((key) => {
        const nk = normalizeKey(key);
        return nk.includes("admission") || nk.includes("roll");
      });
      if (admissionKey) {
        return String(record[admissionKey] ?? "").trim();
      }
    }

    if (normalizedName.includes("school") && normalizedName.includes("code")) {
      const schoolCodeKey = Object.keys(record).find((key) => {
        const nk = normalizeKey(key);
        return nk.includes("school") && nk.includes("code");
      });
      if (schoolCodeKey) {
        return String(record[schoolCodeKey] ?? "").trim();
      }
    }

    if (normalizedName.includes("name") || normalizedName.includes("student")) {
      const nameKey = Object.keys(record).find((key) => {
        const nk = normalizeKey(key);
        return nk.includes("name") || nk.includes("student");
      });
      if (nameKey) {
        return String(record[nameKey] ?? "").trim();
      }
    }

    return "";
  };

  // Helper function to get the appropriate template for a record based on field-based mappings
  const getTemplateForRecord = (record: ProjectDataRecord): PreviewTemplateOption | null => {
    if (!previewForm.useFieldBasedMapping || previewForm.templateMappings.length === 0) {
      // No field-based mapping enabled, use the single template
      return findPreviewTemplateByLookupId(previewForm.templateId);
    }

    // Try to find a matching mapping rule
    for (const mapping of previewForm.templateMappings) {
      if (mapping.fieldName && mapping.fieldValue && mapping.templateId) {
        const recordValue = getRecordValueForField(record, mapping.fieldName);
        const mappingValue = mapping.fieldValue.trim();
        const recordNumeric = Number(recordValue);
        const mappingNumeric = Number(mappingValue);
        const numericMatch = Number.isFinite(recordNumeric) && Number.isFinite(mappingNumeric) && recordNumeric === mappingNumeric;
        if (recordValue === mappingValue || numericMatch) {
          return findPreviewTemplateByLookupId(mapping.templateId);
        }
      }
    }

    // No matching rule found, use the main selected template as default.
    // This prevents mapped templates from becoming global defaults.
    return findPreviewTemplateByLookupId(previewForm.templateId)
      || findPreviewTemplateByLookupId(previewForm.fallbackTemplateId);
  };

  // Now compute the actual values for selectedGenerateTemplate, etc.
  selectedGenerateTemplate = previewForm.useFieldBasedMapping && selectedRecords.length > 0
    ? getTemplateForRecord(selectedRecords[0])
    : (previewForm.templateId
      ? (findPreviewTemplateByLookupId(previewForm.templateId))
      : null);

  // Merge full template data (with canvasJSON and thumbnail) if available
  if (selectedGenerateTemplate && selectedFullTemplate) {
    const designDataAsRecord = selectedFullTemplate.designData as any;
    const canvasJSON = designDataAsRecord?.canvasJSON || designDataAsRecord?.canvasJson;
    const thumbnail = resolveTemplatePreview(selectedFullTemplate, { fallbackToPlaceholder: false }) || selectedGenerateTemplate.thumbnail;
    if (canvasJSON || thumbnail) {
      selectedGenerateTemplate = {
        ...selectedGenerateTemplate,
        ...(canvasJSON ? { canvasJSON } : {}),
        ...(thumbnail ? { thumbnail } : {}),
      };
    }
  }

  if (selectedGenerateTemplate) {
    const selectedLookupId = resolveTemplateLookupId(selectedGenerateTemplate);
    const generatedThumb =
      bgGeneratedPreviews[selectedGenerateTemplate.id]
      || bgGeneratedPreviews[selectedLookupId]
      || "";
    if (generatedThumb && !selectedGenerateTemplate.thumbnail) {
      selectedGenerateTemplate = {
        ...selectedGenerateTemplate,
        thumbnail: generatedThumb,
      };
    }
  }

  selectedGenerateTemplateSlug = selectedGenerateTemplate
    ? getTemplateSlugForRender(selectedGenerateTemplate)
    : "";

  // Recompute diagnostics for the merged template (which now has canvasJSON)
  if (selectedGenerateTemplate) {
    selectedGenerateTemplateDiagnostics = inspectTemplatePreview(selectedGenerateTemplate, availableTemplateFieldKeys);
  } else {
    selectedGenerateTemplateDiagnostics = undefined;
  }

  const printLayout = useMemo(() => {
    const sheetWidthMm = Number(previewForm.sheetWidthMm);
    const sheetHeightMm = Number(previewForm.sheetHeightMm);
    const pageMarginTopMm = Number(previewForm.pageMarginTopMm);
    const pageMarginLeftMm = Number(previewForm.pageMarginLeftMm);
    const rowMarginMm = Number(previewForm.rowMarginMm || "0");
    const columnMarginMm = Number(previewForm.columnMarginMm || "0");

    const sheetWidthPx = Math.max(1, Math.round(Math.max(sheetWidthMm, 1) * MM_TO_PX));
    const sheetHeightPx = Math.max(1, Math.round(Math.max(sheetHeightMm, 1) * MM_TO_PX));
    const marginTopPx = Math.max(0, Math.round(Math.max(pageMarginTopMm, 0) * MM_TO_PX));
    const marginLeftPx = Math.max(0, Math.round(Math.max(pageMarginLeftMm, 0) * MM_TO_PX));
    const rowGapPx = Math.max(0, Math.round(Math.max(rowMarginMm, 0) * MM_TO_PX));
    const columnGapPx = Math.max(0, Math.round(Math.max(columnMarginMm, 0) * MM_TO_PX));

    const usableWidth = Math.max(1, sheetWidthPx - marginLeftPx * 2);
    const usableHeight = Math.max(1, sheetHeightPx - marginTopPx * 2);
    const cardWidthPx = Math.max(1, Math.round(Math.max(Number(previewForm.cardWidthMm) || 54, 1) * MM_TO_PX));
    const cardHeightPx = Math.max(1, Math.round(Math.max(Number(previewForm.cardHeightMm) || 86, 1) * MM_TO_PX));
    const columns = Math.max(1, Math.floor((usableWidth + columnGapPx) / (cardWidthPx + columnGapPx)));
    const rows = Math.max(1, Math.floor((usableHeight + rowGapPx) / (cardHeightPx + rowGapPx)));
    const cardsPerPage = Math.max(1, columns * rows);

    return {
      sheetWidthPx,
      sheetHeightPx,
      marginTopPx,
      marginLeftPx,
      rowGapPx,
      columnGapPx,
      columns,
      rows,
      cardsPerPage,
      sheetWidthMm,
      sheetHeightMm,
    };
  }, [
    previewForm.sheetWidthMm,
    previewForm.sheetHeightMm,
    previewForm.pageMarginTopMm,
    previewForm.pageMarginLeftMm,
    previewForm.rowMarginMm,
    previewForm.columnMarginMm,
    previewForm.cardWidthMm,
    previewForm.cardHeightMm,
  ]);

  // Auto-fit zoom whenever dialog opens or sheet dimensions change
  useEffect(() => {
    if (!isGeneratePreviewOpen) return;
    // Use rAF so the container has been painted and has a measurable size
    const rafId = requestAnimationFrame(() => {
      const container = previewContainerRef.current;
      if (!container) return;
      const availableW = container.clientWidth - 32; // 16px padding each side
      if (availableW <= 0) return;
      // Fit by WIDTH only — the page scrolls vertically like a real document viewer.
      // This keeps cards large and readable instead of shrinking to fit the full page height.
      const widthZoom = Math.floor((availableW / printLayout.sheetWidthPx) * 100);
      // Cap at 100% to avoid over-zooming on wide viewports; floor at 25%
      const fitZoom = Math.min(widthZoom, 100);
      setPreviewZoom(Math.max(25, Math.round(fitZoom / 5) * 5));
    });
    return () => cancelAnimationFrame(rafId);
  }, [isGeneratePreviewOpen, printLayout.sheetWidthPx, printLayout.sheetHeightPx]);

  // ── Rule-based helpers ──────────────────────────────────────────────────────

  /**
   * Determine if a rule is a "catch-all" (no conditions at all, or all condition groups
   * have 0 conditions). A catch-all rule should only be evaluated LAST.
   */
  const isEffectiveCatchAll = (rule: PrintRule) =>
    rule.conditionGroups.length === 0 ||
    rule.conditionGroups.every((g) => g.conditions.length === 0);

  /**
   * Build a row for rule evaluation from a ProjectDataRecord.
   * The key insight: CSV column names in rules (e.g. "admissionNo") may differ in casing
   * from how the same field is stored in project data records (e.g. "AdmissionNo").
   * This function builds a row that has BOTH the exact record keys AND adds entries for
   * each condition field by doing a normalized (lowercase, alphanumeric-only) key match.
   */
  const buildNormalizedRuleRow = (
    rawRecord: Record<string, unknown>,
    rules: PrintRule[]
  ): Record<string, string> => {
    const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Common field-name suffixes that may be present in one source but absent in another
    // e.g. "className" (condition) vs "Class" (record) → strip "name" → match
    const FIELD_SUFFIXES = ["name", "no", "num", "number", "code", "id"];

    const resolveFieldValue = (normField: string, lookup: Record<string, string>): string | undefined => {
      // 1. Direct normalized match
      if (normField in lookup) return lookup[normField];
      // 2. Condition field has extra suffix → strip it to match a shorter record key
      //    e.g. "classname" → strip "name" → "class" matches record key "Class"
      for (const suf of FIELD_SUFFIXES) {
        if (normField.length > suf.length + 2 && normField.endsWith(suf)) {
          const stripped = normField.slice(0, -suf.length);
          if (stripped in lookup) return lookup[stripped];
        }
      }
      // 3. Record field has extra suffix → condition key is a prefix of the record key
      //    e.g. condition "class", record key "className" → "classname" starts with "class", extra = "name"
      for (const [rk, rv] of Object.entries(lookup)) {
        if (rk.length > normField.length && rk.startsWith(normField)) {
          const extra = rk.slice(normField.length);
          if (FIELD_SUFFIXES.includes(extra)) return rv;
        }
      }
      return undefined;
    };

    // Store original record fields (exact key → string value)
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawRecord)) {
      row[k] = v == null ? "" : String(v);
    }

    // Build a normalized lookup: normKey → value
    const normLookup: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      const nk = normalizeKey(k);
      if (!(nk in normLookup)) normLookup[nk] = v;
    }

    // For each condition field used in rules, if not already in row with exact key,
    // find it via normalized + suffix-aware match and add it under the condition's field name.
    for (const rule of rules) {
      for (const group of rule.conditionGroups) {
        for (const condition of group.conditions) {
          if (!(condition.field in row)) {
            const normField = normalizeKey(condition.field);
            const val = resolveFieldValue(normField, normLookup);
            if (val !== undefined) {
              row[condition.field] = val;
            }
          }
        }
      }
    }

    return row;
  };

  const handleOpenGeneratePreview = async () => {
    if (!selectedRecords.length) return;

    // ── ALWAYS fetch the latest saved rules from the server before evaluating ──
    // This ensures any changes saved in the Rule Builder are picked up immediately
    // rather than relying on potentially stale in-memory state.
    let activeRules: typeof projectRules = [];
    if (id) {
      try {
        const freshRules = await getRulesByProject(id);
        const filtered = freshRules.filter((r) => r.isActive !== false);
        setProjectRules(filtered);
        activeRules = filtered;
      } catch {
        // Fall back to in-memory rules if the fetch fails
        activeRules = projectRules.filter((r) => r.isActive !== false);
      }
    } else {
      activeRules = projectRules.filter((r) => r.isActive !== false);
    }

    // ── Rule-based matching: apply saved rules to selected records ──
    if (activeRules.length > 0) {
      // Sort: specific rules (with conditions) first, catch-alls last, then by priority
      const sortedRules = [...activeRules]
        .filter((r) => Boolean(r.templateId)) // skip rules with no template assigned
        .sort((a, b) => {
          const aCatchAll = isEffectiveCatchAll(a);
          const bCatchAll = isEffectiveCatchAll(b);
          if (aCatchAll !== bCatchAll) return aCatchAll ? 1 : -1; // specific rules first
          return (a.priority ?? 0) - (b.priority ?? 0);
        });

      // Compute per-record template ID assignments using rule conditions
      const assignments: Record<number, string> = {};
      const matchLog: Array<{ idx: number; field?: string; value?: string; rule: string; templateId: string }> = [];

      selectedRecords.forEach((record, idx) => {
        // Build a case-insensitive normalized row so field name casing differences don't break matching
        const row = buildNormalizedRuleRow(record as Record<string, unknown>, sortedRules);

        // First matching rule wins (sorted: specific → catch-all)
        const matchedRule = sortedRules.find((rule) => evaluateRule(rule, row));
        if (matchedRule) {
          assignments[idx] = matchedRule.templateId;
          const firstCondition = matchedRule.conditionGroups[0]?.conditions[0];
          matchLog.push({
            idx,
            field: firstCondition?.field,
            value: firstCondition ? String(row[firstCondition.field] ?? "") : undefined,
            rule: matchedRule.templateName,
            templateId: matchedRule.templateId,
          });
        }
      });

      console.log(`[RulePreview] ${sortedRules.length} active rules · ${selectedRecords.length} records · ${Object.keys(assignments).length} matched`, matchLog.slice(0, 10));

      // ── Determine the fallback template ID (for records matched by no rule) ──
      // Priority: catch-all rule (0 conditions) → first rule
      const catchAllRule = sortedRules.find((r) => isEffectiveCatchAll(r));
      const fallbackRule = catchAllRule ?? sortedRules[0];
      const fallbackTemplateId = fallbackRule?.templateId ?? "";

      // Raw MongoDB ID of the fallback template – the backend can always resolve this
      // directly from DB even when findPreviewTemplateByLookupId() can't find it locally.
      const topTemplateId = fallbackTemplateId || (assignments[0] ?? "");

      // Try to resolve the fallback template locally for orientation/type hints.
      // Deliberately do NOT fall back to galleryTemplateOptions[0] here – that would
      // silently swap in an unrelated template as the catch-all for unmatched records.
      const defaultTemplate = findPreviewTemplateByLookupId(topTemplateId) ?? null;

      setRuleAssignments(assignments);
      setPreviewForm((prev) => ({
        ...prev,
        pageSize: "A4",
        // Always use the raw fallback template ID so the backend resolves it from DB.
        // If we found it locally, use the normalised lookup ID; otherwise keep raw.
        templateId: defaultTemplate
          ? resolveTemplateLookupId(defaultTemplate)
          : topTemplateId,
        fallbackTemplateId: topTemplateId,
        templateType: defaultTemplate?.templateType || prev.templateType,
        orientation:
          defaultTemplate?.canvas?.width && defaultTemplate?.canvas?.height
            ? defaultTemplate.canvas.width > defaultTemplate.canvas.height
              ? "landscape"
              : "portrait"
            : prev.orientation,
        sheetWidthMm: String(PAGE_SIZE_DIMENSIONS.A4.width),
        sheetHeightMm: String(PAGE_SIZE_DIMENSIONS.A4.height),
        fileName: `${project?.name || "project"}_${dataCategory}_preview`,
        useRuleBasedMapping: true,
        useFieldBasedMapping: false,
        templateMappings: [],
      }));
      setPreviewError("");
      setIsGeneratePreviewOpen(true);
      return;
    }

    // ── Fallback: existing single-template / field-based mode ──
    setRuleAssignments(null);
    const templateFromGroup = dataGroups
      .find((group) => selectedRecords.some((record) => record.groupId === group.id) && Boolean(group.templateId))
      ?.templateId;
    const defaultTemplate =
      findPreviewTemplateByLookupId(templateFromGroup || "") ||
      galleryTemplateOptions[0] ||
      previewTemplates[0] ||
      null;

    setPreviewForm((prev) => ({
      ...prev,
      pageSize: "A4",
      templateId: defaultTemplate ? resolveTemplateLookupId(defaultTemplate) : "",
      templateType: defaultTemplate?.templateType || prev.templateType,
      orientation:
        defaultTemplate?.canvas?.width && defaultTemplate?.canvas?.height
          ? defaultTemplate.canvas.width > defaultTemplate.canvas.height
            ? "landscape"
            : "portrait"
          : prev.orientation,
      sheetWidthMm: String(PAGE_SIZE_DIMENSIONS.A4.width),
      sheetHeightMm: String(PAGE_SIZE_DIMENSIONS.A4.height),
      fileName: `${project?.name || "project"}_${dataCategory}_preview`,
      useRuleBasedMapping: false,
    }));
    setPreviewError("");
    setIsGeneratePreviewOpen(true);
  };



  const handleGeneratePreviewPdf = async () => {
    if (!id) return;

    const sheetWidthMm = printLayout.sheetWidthMm;
    const sheetHeightMm = printLayout.sheetHeightMm;
    const pageMarginTopMm = Number(previewForm.pageMarginTopMm);
    const pageMarginLeftMm = Number(previewForm.pageMarginLeftMm);
    const rowMarginMm = Number(previewForm.rowMarginMm || "0");
    const columnMarginMm = Number(previewForm.columnMarginMm || "0");

    if (!selectedRecords.length) {
      setPreviewError("Please select at least one record.");
      return;
    }

    // Validate template selection based on mode
    if (previewForm.useRuleBasedMapping) {
      // Rule-based mode: just need a non-empty templateId for fallback (used when no rule matches)
      if (!previewForm.templateId) {
        setPreviewError("No template ID could be determined from the rules. Please configure rules first.");
        return;
      }
      // Don't require findPreviewTemplateByLookupId to succeed here — the backend will resolve
      // the template directly from MongoDB using the ID stored in the rules.
    } else if (previewForm.useFieldBasedMapping) {
      if (!previewForm.templateId) {
        setPreviewError("Please select the default template.");
        return;
      }
      if (previewForm.templateMappings.length === 0) {
        setPreviewError("Please add at least one template mapping.");
        return;
      }
      // Validate that all mapping templates exist
      for (const mapping of previewForm.templateMappings) {
        if (!mapping.fieldName || !mapping.fieldValue || !mapping.templateId) {
          setPreviewError("All mapping fields must be filled in.");
          return;
        }
        const tmpl = findPreviewTemplateByLookupId(mapping.templateId);
        if (!tmpl) {
          setPreviewError(`Template for mapping "${mapping.fieldValue}" not found.`);
          return;
        }
      }
      // Validate fallback template only if explicitly provided.
      if (previewForm.fallbackTemplateId) {
        const fallbackTemplate = findPreviewTemplateByLookupId(previewForm.fallbackTemplateId);
        if (!fallbackTemplate) {
          setPreviewError("Selected fallback template not found.");
          return;
        }
      }
    } else {
      // Single template mode
      if (!previewForm.templateId) {
        setPreviewError("Please select a template.");
        return;
      }
      const selectedTemplate = findPreviewTemplateByLookupId(previewForm.templateId);
      if (!selectedTemplate) {
        setPreviewError("Selected template not found.");
        return;
      }
    }

    if (!previewForm.fileName.trim()) {
      setPreviewError("File name is required.");
      return;
    }
    if (!Number.isFinite(sheetWidthMm) || !Number.isFinite(sheetHeightMm) || sheetWidthMm <= 0 || sheetHeightMm <= 0) {
      setPreviewError("Sheet size must be valid positive values.");
      return;
    }
    if (!Number.isFinite(pageMarginTopMm) || !Number.isFinite(pageMarginLeftMm) || pageMarginTopMm < 0 || pageMarginLeftMm < 0) {
      setPreviewError("Page margins cannot be negative.");
      return;
    }
    if (!Number.isFinite(rowMarginMm) || !Number.isFinite(columnMarginMm) || rowMarginMm < 0 || columnMarginMm < 0) {
      setPreviewError("Row and column margins cannot be negative.");
      return;
    }

    setPreviewError("");
    setIsGeneratingPreview(true);
    try {
      const requestTemplateId = previewForm.templateId;

      if (!requestTemplateId) {
        setPreviewError("Please select a template.");
        return;
      }

      const requestTemplate = findPreviewTemplateByLookupId(requestTemplateId);
      const templatePayload = requestTemplate
        ? {
            id: resolveTemplateLookupId(requestTemplate),
            templateName: requestTemplate.templateName,
            templateType: requestTemplate.templateType,
            templateSlug: getTemplateSlugForRender(requestTemplate),
            canvas: requestTemplate.canvas,
            thumbnail: requestTemplate.thumbnail,
            previewImageUrl: requestTemplate.thumbnail,
            layoutJSON: requestTemplate.canvasJSON || undefined,
          }
        : { id: requestTemplateId };

      const body = {
        selectedRecordIds: selectedRecords.map((record) => String(record.id || "")).filter(Boolean),
        selectedRecords,
        configuration: {
          pageSize: previewForm.pageSize,
          templateId: requestTemplateId,
          orientation: previewForm.orientation,
          templateType: previewForm.templateType,
          isSample: previewForm.isSample === "yes",
          sheetSize: {
            widthMm: sheetWidthMm,
            heightMm: sheetHeightMm,
          },
          pageMargin: {
            topMm: pageMarginTopMm,
            leftMm: pageMarginLeftMm,
          },
          cardSize: {
            widthMm: Number(previewForm.cardWidthMm) || 54,
            heightMm: Number(previewForm.cardHeightMm) || 86,
          },
          rowMarginMm,
          columnMarginMm,
          fileName: previewForm.fileName.trim(),
          // Rule-based mode: tell backend to evaluate saved PrintRules server-side
          useRuleBasedMapping: previewForm.useRuleBasedMapping,
          useFieldBasedMapping: previewForm.useRuleBasedMapping ? true : previewForm.useFieldBasedMapping,
          projectId: previewForm.useRuleBasedMapping ? id : undefined,
          fallbackTemplateId: previewForm.fallbackTemplateId || previewForm.templateId,
          templateMappings: previewForm.useRuleBasedMapping ? [] : previewForm.templateMappings.map((mapping) => ({
            fieldName: mapping.fieldName,
            fieldValue: mapping.fieldValue,
            templateId: mapping.templateId,
          })),
          // Send frontend-computed per-record assignments. The backend server-side evaluator
          // will re-evaluate and OVERRIDE these with authoritative results, but sending them
          // here provides a reliable fallback if the backend fetch somehow fails.
          // In rule-based mode we always include the key (even if empty) so the backend knows
          // to run server-side evaluation via useRuleBasedMapping=true + projectId.
          perRecordTemplateAssignments: previewForm.useRuleBasedMapping
            ? Object.fromEntries(
                Object.entries(ruleAssignments ?? {}).map(([k, v]) => [String(k), v])
              )
            : (ruleAssignments && Object.keys(ruleAssignments).length > 0
                ? Object.fromEntries(Object.entries(ruleAssignments).map(([k, v]) => [String(k), v]))
                : undefined),
        },
        template: templatePayload,
      };

      console.log('[PDF Generation] Request body:', {
        useFieldBasedMapping: body.configuration.useFieldBasedMapping,
        useRuleBasedMapping: previewForm.useRuleBasedMapping,
        perRecordAssignmentCount: Object.keys((body.configuration as any).perRecordTemplateAssignments || {}).length,
        perRecordAssignmentSample: Object.entries((body.configuration as any).perRecordTemplateAssignments || {}).slice(0, 5),
        templateMappings: body.configuration.templateMappings,
        fallbackTemplateId: body.configuration.fallbackTemplateId,
        selectedRecordCount: body.selectedRecords.length,
        sampleRecords: body.selectedRecords.slice(0, 3),
      });

      const response = await fetch(`${API_BASE}/preview/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMessage = `Failed to generate preview PDF (HTTP ${response.status})`;
        try {
          const errorJson = await response.json();
          const parsedMessage = String((errorJson as any)?.error || "").trim();
          if (parsedMessage) {
            errorMessage = parsedMessage;
          }
        } catch {
          // Ignore parse failures and use default message.
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error("Empty PDF response received.");
      }

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${previewForm.fileName.trim()}.pdf`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setIsGeneratePreviewOpen(false);
    } catch (error) {
      const errorMsg = (error as Error).message || "Failed to generate preview PDF.";
      setPreviewError(errorMsg);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // ── Delete All student/staff Data ──
  const handleDeleteAllData = () => {
    if (!id) return;
    // Bump generation so any in-flight hydrateFromBackend discards its stale result.
    hydrateGenerationRef.current += 1;
    // Clear local state immediately (optimistic update).
    saveDataRecords(id, dataCategory, []);
    setDataRecords([]);
    setDataSelectedIds(new Set());
    setIsDeleteAllOpen(false);
    // Backend: delete DB records AND remove photo files from the uploads directory.
    void deleteProjectRecords(id, dataCategory).then((ok) => {
      if (!ok) console.warn('[ProjectDetail] deleteProjectRecords: backend cleanup may have failed; photo files may remain on disk.');
    });
  };

  const handleStageChange = async (stage: string) => {
    if (!id) return;
    const updated = await apiUpdateProject(id, { stage });
    if (updated) {
      refresh();
    }
  };

  // â”€â”€ Stage change direct edit â”€â”€
  const updateProjectField = async (field: string, value: string) => {
    if (!id) return;
    const updated = await apiUpdateProject(id, { [field]: value });
    if (updated) {
      refresh();
    }
  };

  if (projectLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <p className="text-muted-foreground text-lg">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <p className="text-muted-foreground text-lg">Project not found.</p>
        <Link to="/projects">
          <Button variant="outline">Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const stageIndex = STAGES.indexOf(project.stage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold">{project.name}</h1>
            <Badge variant="secondary">{STAGE_LABELS[project.stage] ?? project.stage}</Badge>
            <Badge variant="outline">{project.priority.charAt(0).toUpperCase() + project.priority.slice(1)}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Client: <span className="font-medium text-foreground">{project.client}</span>
            &nbsp;Â·&nbsp;{project.id}
            &nbsp;Â·&nbsp;Created {project.createdAt}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={project.stage} onValueChange={handleStageChange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/clients/${project.clientId}`}>View Client</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => {
                if (!id) return;
                apiDeleteProject(id).then((ok) => {
                  if (ok) {
                    navigate("/projects");
                  }
                });
              }}>
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Client</p>
            <p className="font-semibold mt-1 truncate">{project.client}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Due Date</p>
            <p className="font-semibold mt-1">{project.dueDate || "—"}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Project Amount</p>
            <p className="font-semibold mt-1">₹{project.amount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Products Total</p>
            <p className="font-semibold mt-1">₹{productTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stage Progress Bar */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleStageChange(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    i < stageIndex
                      ? "bg-success/20 text-success"
                      : i === stageIndex
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {i < stageIndex ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  {STAGE_LABELS[s]}
                </button>
                {i < STAGES.length - 1 && (
                  <div className={`h-0.5 w-4 ${i < stageIndex ? "bg-success" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="details" className="gap-2"><Package className="h-4 w-4" />Details</TabsTrigger>
          <TabsTrigger value="templates" className="gap-2"><Layers className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="print-orders" className="gap-2"><Printer className="h-4 w-4" />Print Orders</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2"><ListTodo className="h-4 w-4" />Project Tasks</TabsTrigger>
          <TabsTrigger value="files" className="gap-2"><FolderOpen className="h-4 w-4" />Project Files</TabsTrigger>
          <TabsTrigger value="data" className="gap-2"><Database className="h-4 w-4" />Project Data</TabsTrigger>
        </TabsList>

        {/* â”€â”€ DETAILS TAB â”€â”€ */}
        <TabsContent value="details" className="space-y-4">
          {/* Products Section */}
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Products</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    const lines = ["Product,Spec,Qty,Unit Price,Total"];
                    products.forEach((p) =>
                      lines.push(`${p.productName},${p.spec},${p.quantity},${p.unitPrice},${p.quantity * p.unitPrice}`)
                    );
                    lines.push(`,,,,${productTotal}`);
                    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = `${project.id}-intent.csv`; a.click();
                    URL.revokeObjectURL(url);
                  }}>
                    <Download className="h-4 w-4 mr-1" />
                    Intent Letter
                  </Button>
                  <Dialog open={isAddProductOpen} onOpenChange={(o) => { setIsAddProductOpen(o); if (!o) { setProductForm(emptyProductForm); setProductErrors({}); } }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Product
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Product to Project</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label>Product Name <span className="text-destructive">*</span></Label>
                          <Select value={productForm.productName} onValueChange={(v) => setProductForm((f) => ({ ...f, productName: v }))}>
                            <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                            <SelectContent>
                              {PRODUCT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {productErrors.productName && <p className="text-xs text-destructive">{productErrors.productName}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label>Specification / Variant</Label>
                          <Input placeholder="e.g. PVC Card Single Side (86×54mm)" value={productForm.spec} onChange={(e) => setProductForm((f) => ({ ...f, spec: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Quantity <span className="text-destructive">*</span></Label>
                            <Input type="number" min={1} placeholder="1" value={productForm.quantity} onChange={(e) => setProductForm((f) => ({ ...f, quantity: e.target.value }))} />
                            {productErrors.quantity && <p className="text-xs text-destructive">{productErrors.quantity}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label>Unit Price (₹) <span className="text-destructive">*</span></Label>
                            <Input type="number" min={0} placeholder="0.00" value={productForm.unitPrice} onChange={(e) => setProductForm((f) => ({ ...f, unitPrice: e.target.value }))} />
                            {productErrors.unitPrice && <p className="text-xs text-destructive">{productErrors.unitPrice}</p>}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => { setIsAddProductOpen(false); setProductForm(emptyProductForm); setProductErrors({}); }}>Cancel</Button>
                        <Button onClick={handleAddProduct}>Add Product</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No products added yet. Click "Add Product" to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {products.map((p) => (
                    <div key={p.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm uppercase tracking-wide">{p.productName}</p>
                          {p.spec && <p className="text-sm text-muted-foreground mt-0.5">{p.spec}</p>}
                          <p className="text-xs text-muted-foreground mt-1">Qty: {p.quantity} × ₹{p.unitPrice.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-semibold">₹{(p.quantity * p.unitPrice).toLocaleString()}</p>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { deleteProjectProduct(p.id); refresh(); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-3 mt-2">
                    <p className="font-semibold text-sm">Total</p>
                    <p className="font-bold text-lg">₹{productTotal.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project Info */}
          <Card className="shadow-md">
            <CardHeader><CardTitle>Project Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Project Name</p>
                  <p className="font-medium mt-0.5">{project.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="font-medium mt-0.5">{project.client}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Assignee</p>
                  <p className="font-medium mt-0.5">{project.assignee || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <p className="font-medium mt-0.5 capitalize">{project.priority}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium mt-0.5">{project.dueDate || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-medium mt-0.5">{project.createdAt}</p>
                </div>
              </div>
              {project.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="mt-0.5">{project.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TEMPLATES TAB ── */}
        <TabsContent value="templates">
          {/* Create New Template Dialog */}
          <Dialog open={isCreateTemplateOpen} onOpenChange={(o) => { setIsCreateTemplateOpen(o); if (!o) { setTemplateForm(emptyTemplateForm); setTemplateErrors({}); } }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add new template</DialogTitle>
                <p className="text-sm text-muted-foreground">Fill in the details to create template.</p>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Template Name</Label>
                  <Input
                    placeholder="Template Name"
                    value={templateForm.templateName}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, templateName: e.target.value }))}
                    className={templateErrors.templateName ? "border-destructive" : ""}
                  />
                  {templateErrors.templateName && <p className="text-xs text-destructive">{templateErrors.templateName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Template Type</Label>
                  <Select value={templateForm.templateType} onValueChange={(v) => setTemplateForm((f) => ({ ...f, templateType: v as ProjectTemplate["templateType"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Page Format</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["a4", "13x19", "custom"] as PageFormat[]).map((fmt) => {
                      const { width, height } = PAGE_FORMAT_SIZES[fmt];
                      const lbls: Record<PageFormat, string> = { a4: "Page: A4", "13x19": "Page: 13\u00d719", custom: "Custom" };
                      const subs: Record<PageFormat, string> = { a4: "297\u00d7210mm", "13x19": "330\u00d7482mm", custom: "Custom size" };
                      return (
                        <button
                          key={fmt}
                          onClick={() => setTemplateForm((f) => ({ ...f, pageFormat: fmt, canvas: { width, height } }))}
                          className={`rounded-lg border-2 p-3 text-left transition-colors ${templateForm.pageFormat === fmt ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${templateForm.pageFormat === fmt ? "border-primary" : "border-muted-foreground"}`}>
                              {templateForm.pageFormat === fmt && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                            <div>
                              <p className="text-xs font-medium leading-tight">{lbls[fmt]}</p>
                              <p className="text-[10px] text-muted-foreground">{subs[fmt]}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {templateForm.pageFormat === "custom" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Width (mm)</Label>
                      <Input type="number" min={1} value={templateForm.canvas.width} onChange={(e) => updateTemplateCanvas("width", Number(e.target.value) || 1)} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Height (mm)</Label>
                      <Input type="number" min={1} value={templateForm.canvas.height} onChange={(e) => updateTemplateCanvas("height", Number(e.target.value) || 1)} className="h-9" />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Page margin (mm)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["top", "left", "right", "bottom"] as (keyof typeof emptyTemplateForm.margin)[]).map((side) => (
                      <div key={side} className="space-y-1">
                        <Label className="text-xs capitalize">{side}</Label>
                        <Input type="number" min={0} value={templateForm.margin[side]} onChange={(e) => updateTemplateMargin(side, Number(e.target.value) || 0)} className="h-9" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Applicable for</Label>
                  <Input placeholder="e.g. All Students, Class 10, Staff..." value={templateForm.applicableFor} onChange={(e) => setTemplateForm((f) => ({ ...f, applicableFor: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Public template
                    </Label>
                    <p className="text-xs text-muted-foreground">Visible across all client projects in the system</p>
                  </div>
                  <Switch
                    checked={templateForm.isPublic}
                    onCheckedChange={(v) => setTemplateForm((f) => ({ ...f, isPublic: v }))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsCreateTemplateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateTemplate} disabled={isTemplateSaving}>
                    {isTemplateSaving ? "Saving..." : "Create Template"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Template Preview Dialog */}
          <Dialog open={!!previewTemplate} onOpenChange={(o) => { if (!o) setPreviewTemplate(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Template Preview</DialogTitle></DialogHeader>
              {previewTemplate && (
                <div className="space-y-4">
                  <div className="bg-muted/40 rounded-lg p-4 flex items-center justify-center min-h-[200px]">
                    {canRenderSelectedTemplateImage ? (
                      <img
                        src={previewTemplate.thumbnail ||
                          bgGeneratedPreviews[previewTemplate.id] ||
                          bgGeneratedPreviews[(previewTemplate as any).remoteId ?? ""] || ""}
                        alt={previewTemplate.templateName}
                        className="max-w-full max-h-[320px] object-contain rounded shadow-md border border-border"
                        onError={() => markTemplatePreviewBroken(previewTemplate.id)}
                      />
                    ) : selectedPreviewTemplateDiagnostics?.hasDesignElements && previewTemplate.canvasJSON ? (
                      <TemplatePreviewCanvas
                        canvasJSON={previewTemplate.canvasJSON}
                        canvasConfig={previewTemplate.canvas}
                        maxWidth={352}
                        maxHeight={320}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                        <Layers className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No preview available. Open in designer to add content.
                        </p>
                      </div>
                    )}
                  </div>

                  {!selectedPreviewTemplateDiagnostics?.hasDesignElements
                    && !previewTemplate.thumbnail
                    && !bgGeneratedPreviews[previewTemplate.id]
                    && !bgGeneratedPreviews[((previewTemplate as any).remoteId as string) ?? ""] && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded px-2.5 py-2">
                      No preview available. Please configure the template.
                    </p>
                  )}

                  {Boolean(selectedPreviewTemplateDiagnostics?.missingFieldKeys.length) && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                      Missing field mapping: {selectedPreviewTemplateDiagnostics?.missingFieldKeys.map(formatFieldLabel).join(", ")}
                    </p>
                  )}

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{previewTemplate.templateType.replace("_"," ")}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Canvas</span><span className="font-medium">{previewTemplate.canvas.width} x {previewTemplate.canvas.height} mm</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Margin T/L/R/B</span><span className="font-medium">{previewTemplate.margin.top}/{previewTemplate.margin.left}/{previewTemplate.margin.right}/{previewTemplate.margin.bottom} mm</span></div>
                    {previewTemplate.applicableFor && <div className="flex justify-between"><span className="text-muted-foreground">For</span><span className="font-medium">{previewTemplate.applicableFor}</span></div>}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Project Templates</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/projects/${id}/rule-builder`)}>
                    <GitBranch className="h-4 w-4" />Rule Builder
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`/template-gallery?projectId=${encodeURIComponent(id ?? "")}`)}>
                    <LayoutGrid className="h-4 w-4" />Open Template Gallery
                  </Button>
                  <Button size="sm" className="gap-2" onClick={() => setIsCreateTemplateOpen(true)}>
                    <Plus className="h-4 w-4" />Create new template
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {remoteTemplatesLoading && remoteTemplates.length === 0 && !remoteTemplatesError ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border rounded-lg p-4 space-y-3 animate-pulse">
                      <div className="bg-muted/50 rounded h-28" />
                      <div className="bg-muted/50 rounded h-4 w-2/3" />
                      <div className="bg-muted/50 rounded h-3 w-1/2" />
                      <div className="flex gap-2">
                        <div className="bg-muted/50 rounded h-8 flex-1" />
                        <div className="bg-muted/50 rounded h-8 flex-1" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : previewTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No templates created yet</p>
                  <Button variant="outline" onClick={() => setIsCreateTemplateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />Create new template
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {previewTemplates.map((tmpl) => {
                    const previewDiagnostics = previewTemplateDiagnosticsMap[tmpl.id];
                    const remoteIdForTmpl = (tmpl as any).remoteId as string | undefined;
                    // When the primary thumbnail is broken, try bgGeneratedPreviews fallbacks.
                    // Also allow the remote API thumbnail (from remoteTemplates) as a fallback
                    // in case the local copy stored a relative/stale URL that 404s locally.
                    const apiVersionThumbnail = remoteIdForTmpl
                      ? (remoteTemplates.find(r => r.id === remoteIdForTmpl)?.thumbnail)
                      : undefined;
                    const isPrimaryBroken = brokenTemplatePreviewIds[tmpl.id];
                    // Always prefer absolute SFTP URL from API — it's the most reliable source.
                    // Only fall back to tmpl.thumbnail if it's also absolute (relative paths 404
                    // in dev). Background-generated previews are used as a last resort.
                    const effectiveThumbnail =
                      (apiVersionThumbnail?.startsWith('http') ? apiVersionThumbnail : null)
                      || (!isPrimaryBroken && tmpl.thumbnail?.startsWith('http') ? tmpl.thumbnail : null)
                      || bgGeneratedPreviews[tmpl.id]
                      || bgGeneratedPreviews[remoteIdForTmpl ?? ""]
                      || (!isPrimaryBroken ? tmpl.thumbnail : null)
                      || undefined;
                    const canRenderCardImage = Boolean(effectiveThumbnail);
                    const currentClientId = project?.clientId ?? "";
                    // Own project's template
                    const isOwnTemplate = tmpl.projectId === id;
                    // Same client but different project
                    const isSameClientTemplate = !isOwnTemplate
                      && Boolean(currentClientId)
                      && (tmpl.clientId === currentClientId);

                    return (
                      <div key={tmpl.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow space-y-3">
                        <div className="bg-muted/30 rounded flex items-center justify-center h-28 relative overflow-hidden">
                          {canRenderCardImage ? (
                            <img
                              src={effectiveThumbnail}
                              alt={tmpl.templateName}
                              className="max-h-full max-w-full object-contain rounded shadow"
                              onError={() => markTemplatePreviewBroken(tmpl.id)}
                            />
                          ) : previewDiagnostics?.hasDesignElements && tmpl.canvasJSON ? (
                            <TemplatePreviewCanvas
                              canvasJSON={tmpl.canvasJSON}
                              canvasConfig={tmpl.canvas}
                              maxWidth={160}
                              maxHeight={112}
                            />
                          ) : (
                            <div className="h-full w-full bg-muted/20 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
                              <Layers className="h-5 w-5 text-muted-foreground" />
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                No preview yet. Open in designer to add content.
                              </p>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm truncate">{tmpl.templateName}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] capitalize">{tmpl.templateType.replace("_"," ")}</Badge>
                            <Badge variant="outline" className="text-[10px]">{tmpl.canvas.width}x{tmpl.canvas.height}mm</Badge>
                            {isSameClientTemplate && (
                              <Badge variant="outline" className="text-[10px] gap-0.5 text-emerald-700 border-emerald-300 bg-emerald-50">
                                Client
                              </Badge>
                            )}
                            {tmpl.isGlobal && (
                              <Badge variant="outline" className="text-[10px] gap-0.5 text-primary border-primary/40 bg-primary/5">
                                <Globe className="h-2.5 w-2.5" />Global
                              </Badge>
                            )}
                          </div>
                          {!previewDiagnostics?.hasDesignElements && !effectiveThumbnail && (
                            <p className="text-[11px] text-destructive mt-1">
                              No preview available. Please configure the template.
                            </p>
                          )}
                          {Boolean(previewDiagnostics?.missingFieldKeys.length) && (
                            <p className="text-[11px] text-amber-700 mt-1">
                              Missing field mapping: {previewDiagnostics?.missingFieldKeys.map(formatFieldLabel).join(", ")}
                            </p>
                          )}
                          {tmpl.applicableFor && <p className="text-xs text-muted-foreground mt-1 truncate">For: {tmpl.applicableFor}</p>}
                          <p className="text-xs text-muted-foreground">{tmpl.createdAt}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => setPreviewTemplate(tmpl)}>
                            <Download className="h-3 w-3" />Preview
                          </Button>
                          <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs gap-1 text-primary hover:text-primary"
                                disabled={editingTemplateId === tmpl.id}
                                onClick={async () => {
                                  setEditingTemplateId(tmpl.id);
                                  try {
                                    const rawMargin = (tmpl as any).margin ?? {};
                                    const normalizedMargin = {
                                      top: Number(rawMargin.top ?? (tmpl as any).marginTop ?? 0) || 0,
                                      left: Number(rawMargin.left ?? (tmpl as any).marginLeft ?? 0) || 0,
                                      right: Number(rawMargin.right ?? (tmpl as any).marginRight ?? 0) || 0,
                                      bottom: Number(rawMargin.bottom ?? (tmpl as any).marginBottom ?? 0) || 0,
                                    };

                                    // Determine the MongoDB ID to fetch full canvas data
                                    const remoteIdForEdit = ((tmpl as any).remoteId as string | undefined) || tmpl.id;
                                    const isMongoId = /^[0-9a-f]{24}$/i.test(remoteIdForEdit);

                                    // Fetch full template (with canvasJSON) from API
                                    // because the list response strips canvasJSON for performance.
                                    let fullCanvasJSON = tmpl.canvasJSON || "";
                                    let resolvedCanvas = tmpl.canvas;
                                    if (isMongoId) {
                                      try {
                                        const full = await getTemplateById(remoteIdForEdit, { timeoutMs: 10000 });
                                        const dd = (full.designData || {}) as Record<string, any>;
                                        fullCanvasJSON =
                                          typeof dd.canvasJSON === "string" ? dd.canvasJSON
                                          : typeof dd.canvasJson === "string" ? dd.canvasJson
                                          : fullCanvasJSON;
                                        // Also refresh canvas dimensions from individual fetch
                                        if (dd.canvas?.width && dd.canvas?.height) {
                                          resolvedCanvas = { width: Number(dd.canvas.width), height: Number(dd.canvas.height) };
                                        }
                                      } catch {
                                        // Non-fatal – proceed with whatever data we have
                                      }
                                    }

                                    const designerConfig = {
                                      templateName: tmpl.templateName,
                                      templateType: tmpl.templateType,
                                      canvas: resolvedCanvas,
                                      margin: normalizedMargin,
                                    };

                                    // Build the synthetic template id for this session.
                                    // We use the remoteId so DesignerStudio's auto-save can
                                    // write back to the right localStorage entry later.
                                    const sessionTemplateId = `TMPL-edit-${remoteIdForEdit}`;

                                    // Try storing a lightweight entry in localStorage (no canvasJSON
                                    // to avoid QuotaExceededError on large base64 image templates).
                                    // DesignerStudio will read the full canvasJSON from sessionStorage.
                                    const existsLocally = loadAllProjectTemplates().some(
                                      (t) => t.id === sessionTemplateId
                                    );
                                    if (!existsLocally) {
                                      try {
                                        addProjectTemplate({
                                          projectId: id ?? "",
                                          clientId: project?.clientId ?? "",
                                          templateName: tmpl.templateName,
                                          templateType: tmpl.templateType,
                                          canvas: resolvedCanvas,
                                          margin: normalizedMargin,
                                          applicableFor: tmpl.applicableFor,
                                          // Omit canvasJSON — stored in sessionStorage below
                                          thumbnail: tmpl.thumbnail,
                                          isPublic: tmpl.isPublic ?? false,
                                          remoteId: remoteIdForEdit,
                                        } as any);
                                      } catch {
                                        // Quota exceeded for metadata too — skip, sessionStorage path handles it
                                      }
                                    } else {
                                      try {
                                        updateProjectTemplate(sessionTemplateId, {
                                          canvas: resolvedCanvas,
                                        });
                                      } catch { /* quota — skip */ }
                                    }

                                    // Pass heavy canvasJSON via sessionStorage to avoid quota errors.
                                    // DesignerStudio reads DESIGNER_PRELOAD_KEY on mount and clears it.
                                    if (fullCanvasJSON) {
                                      try {
                                        sessionStorage.setItem("vendor_designer_preload", JSON.stringify({
                                          templateId: sessionTemplateId,
                                          canvasJSON: fullCanvasJSON,
                                          config: designerConfig,
                                        }));
                                      } catch {
                                        // sessionStorage also full — DesignerStudio API fallback handles it
                                      }
                                    }

                                    localStorage.setItem("vendor_designer_template_config", JSON.stringify(designerConfig));
                                    // Use the real MongoDB ID so DesignerStudio loads the project
                                    // copy from the API (not a synthetic TMPL-edit- prefix).
                                    // This ensures auto-save writes back to the correct document
                                    // and saveIsPublic is initialised from the copy's isPublic=false.
                                    localStorage.setItem(DESIGNER_CONTEXT_KEY, JSON.stringify({
                                      projectId: project.id,
                                      templateId: remoteIdForEdit,
                                      projectName: project.name,
                                      templateName: tmpl.templateName,
                                    }));
                                    navigate("/designer-studio");
                                  } finally {
                                    setEditingTemplateId(null);
                                  }
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                                {editingTemplateId === tmpl.id ? "Loading…" : "Edit"}
                              </Button>
                              {isOwnTemplate && (
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteTemplate(tmpl)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€ PRINT ORDERS TAB â”€â”€ */}
        <TabsContent value="print-orders">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Print Orders</CardTitle>
                <Button size="sm" className="gap-2" onClick={() => {
                  if (products.length === 0) {
                    alert("Add products to the project first before creating a print order.");
                    return;
                  }
                  handleStageChange("printing");
                }}>
                  <Printer className="h-4 w-4" />
                  Create Print Order
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {project.stage === "printing" || project.stage === "dispatched" || project.stage === "delivered" ? (
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">Print Order #{project.id}</p>
                        <p className="text-xs text-muted-foreground">Created {project.createdAt}</p>
                      </div>
                      <Badge className={
                        project.stage === "delivered" ? "bg-success text-success-foreground" :
                        project.stage === "dispatched" ? "bg-blue-500 text-white" :
                        "bg-orange-500 text-white"
                      }>
                        {STAGE_LABELS[project.stage]}
                      </Badge>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Spec</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.productName}</TableCell>
                            <TableCell className="text-muted-foreground">{p.spec}</TableCell>
                            <TableCell>{p.quantity}</TableCell>
                            <TableCell className="text-right">₹{(p.quantity * p.unitPrice).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={3} className="font-bold">Total</TableCell>
                          <TableCell className="text-right font-bold">₹{productTotal.toLocaleString()}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Printer className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">No print orders yet</p>
                  <p className="text-xs text-muted-foreground">Add products and click "Create Print Order" to begin printing</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€ PROJECT TASKS TAB â”€â”€ */}
        <TabsContent value="tasks">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Project Tasks</CardTitle>
                <Dialog open={isAddTaskOpen} onOpenChange={(o) => { setIsAddTaskOpen(o); if (!o) { setTaskForm(emptyTaskForm); setTaskErrors({}); setEditingTask(null); } }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Add Task</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{editingTask ? "Edit Task" : "Add Task"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label>Task Title <span className="text-destructive">*</span></Label>
                        <Input placeholder="Task description" value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} />
                        {taskErrors.title && <p className="text-xs text-destructive">{taskErrors.title}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Assignee</Label>
                        <Input placeholder="Name" value={taskForm.assignee} onChange={(e) => setTaskForm((f) => ({ ...f, assignee: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Due Date</Label>
                          <Input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select value={taskForm.status} onValueChange={(v) => setTaskForm((f) => ({ ...f, status: v as ProjectTask["status"] }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in-progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => { setIsAddTaskOpen(false); setTaskForm(emptyTaskForm); setTaskErrors({}); setEditingTask(null); }}>Cancel</Button>
                      <Button onClick={handleAddTask}>{editingTask ? "Save Changes" : "Add Task"}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="text-center py-12">
                  <ListTodo className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No tasks yet. Add tasks to track project progress.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                      <button onClick={() => toggleTaskStatus(t)} className="flex-shrink-0">
                        {t.status === "done" ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : t.status === "in-progress" ? (
                          <Clock className="h-5 w-5 text-warning" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {t.title}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {t.assignee && <span className="text-xs text-muted-foreground">{t.assignee}</span>}
                          {t.dueDate && <span className="text-xs text-muted-foreground">Due: {t.dueDate}</span>}
                        </div>
                      </div>
                      <Badge variant={t.status === "done" ? "default" : t.status === "in-progress" ? "secondary" : "outline"} className="text-xs">
                        {t.status === "in-progress" ? "In Progress" : t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                      </Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTask(t)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => { deleteProjectTask(t.id); refresh(); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    {tasks.filter((t) => t.status === "done").length} of {tasks.length} completed
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* â”€â”€ PROJECT FILES TAB â”€â”€ */}
        <TabsContent value="files">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Project Files</CardTitle>
                <Button size="sm" className="gap-2" onClick={() => {
                  setAddFileState({ file: null, name: "", category: "other" });
                  setIsAddFileOpen(true);
                }}>
                  <Plus className="h-4 w-4" />
                  Add File
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {files.filter((f) => f.category === "other" || f.category === "print").length === 0 && files.filter((f) => f.category === "template").length === 0 && files.filter((f) => f.category === "data").length === 0 ? (
                <div
                  className="border-2 border-dashed rounded-lg p-12 text-center hover:border-secondary transition-colors cursor-pointer"
                  onClick={() => {
                    setAddFileState({ file: null, name: "", category: "other" });
                    setIsAddFileOpen(true);
                  }}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Click to upload or drag and drop files here</p>
                  <p className="text-xs text-muted-foreground mt-1">Any file type supported</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            {f.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{f.category}</Badge>
                        </TableCell>
                        <TableCell>{f.size}</TableCell>
                        <TableCell>{f.uploadedAt}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { deleteProjectFile(f.id); refresh(); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ── Add File Dialog ── */}
          <Dialog open={isAddFileOpen} onOpenChange={(open) => {
            setIsAddFileOpen(open);
            if (!open) setAddFileState({ file: null, name: "", category: "other" });
          }}>
            <DialogContent className="sm:max-w-[460px]">
              <DialogHeader>
                <DialogTitle>Add New File</DialogTitle>
              </DialogHeader>

              {/* Step 1: Choose file */}
              {!addFileState.file ? (
                <div
                  className="mt-2 border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary hover:bg-muted/40 transition-colors"
                  onClick={() => addFileDialogInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) setAddFileState({ file: f, name: f.name, category: "other" });
                  }}
                >
                  <FilePlus className="h-10 w-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Click to choose a file</p>
                    <p className="text-xs text-muted-foreground mt-1">or drag and drop here</p>
                  </div>
                  <input
                    ref={addFileDialogInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleAddFileDialogSelect}
                  />
                </div>
              ) : (
                /* Step 2: Fill in name & type, then upload */
                <div className="mt-2 space-y-4">
                  {/* Selected file preview */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40">
                    <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{addFileState.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(addFileState.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Remove selected file"
                      onClick={() => setAddFileState({ file: null, name: "", category: "other" })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="add-file-name">File Name</Label>
                    <Input
                      id="add-file-name"
                      value={addFileState.name}
                      onChange={(e) => setAddFileState((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Enter file name"
                    />
                  </div>

                  {/* File Type */}
                  <div className="space-y-1.5">
                    <Label>File Type</Label>
                    <Select
                      value={addFileState.category}
                      onValueChange={(v) => setAddFileState((s) => ({ ...s, category: v as ProjectFile["category"] }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select file type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="other">General / Other</SelectItem>
                        <SelectItem value="print">Print File</SelectItem>
                        <SelectItem value="template">Template</SelectItem>
                        <SelectItem value="data">Data File</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setIsAddFileOpen(false);
                        setAddFileState({ file: null, name: "", category: "other" });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1 gap-2" onClick={handleAddFileSubmit}>
                      <Upload className="h-4 w-4" />
                      Add File
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* â”€â”€ PROJECT DATA TAB â”€â”€ */}
        <TabsContent value="data">
          <div className="space-y-4">

            {/* Sub-tabs: Data / Groups / Fields */}
            <div className="flex items-center gap-6 border-b pb-0">
              {(["data", "groups", "fields"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDataSubTab(tab)}
                  className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                    dataSubTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Category toggle: Staff / Student */}
            <div className="flex gap-2">
              {(["staff", "student"] as const).map((cat) => (
                <Button
                  key={cat}
                  variant={dataCategory === cat ? "default" : "outline"}
                  size="sm"
                  className="capitalize"
                  onClick={() => switchDataCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>

            {/* ── DATA sub-tab ── */}
            {dataSubTab === "data" && (
              <div className="space-y-4">
                {(dataRecords.length === 0 || showImportWizard) ? (
                  <BulkImportWizard
                    projectId={id ?? ""}
                    category={dataCategory}
                    onComplete={(fields, records) => {
                      if (!id) return;
                      saveDataFields(id, dataCategory, fields);
                      persistDataRecords(records);
                      setDataFields(fields);
                      setShowImportWizard(false);
                    }}
                    onCancel={dataRecords.length > 0 ? () => setShowImportWizard(false) : undefined}
                  />
                ) : (
                  <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">
                            Total Records: {filteredRecords.length}
                          </Badge>
                          {dataSelectedIds.size > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {dataSelectedIds.size} selected
                            </Badge>
                          )}
                          {aiProcessing && (
                            <Badge variant="default" className="text-xs gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {aiProcessing === "autocrop" ? "Auto-cropping…" : "Removing background…"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Search…"
                            value={dataFilter}
                            onChange={(e) => setDataFilter(e.target.value)}
                            className="h-8 text-xs w-48"
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-xs h-8"
                                disabled={dataSelectedIds.size === 0}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                Selected Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => void handleOpenGeneratePreview()} disabled={dataSelectedIds.size === 0}>
                                <Download className="h-4 w-4 mr-2" /> Generate preview
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={deleteSelected}
                                disabled={dataSelectedIds.size === 0}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete selected records
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                            <Filter className="h-3.5 w-3.5" />
                            Filter
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => setShowImportWizard(true)}>
                                <Upload className="h-4 w-4 mr-2" /> Import Data
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={handleDownloadExcel} disabled={!filteredRecords.length}>
                                <FileDown className="h-4 w-4 mr-2" /> Download Excel
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleDownloadImageZip()} disabled={!filteredRecords.some((r) => Boolean(getRecordPhoto(r)))}>
                                <Archive className="h-4 w-4 mr-2" /> Download Image Zip
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={handleOpenAddData} disabled={!dataFields.length}>
                                <UserPlus className="h-4 w-4 mr-2" /> Add Data
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setBulkEditField(""); setBulkEditValue(""); setIsBulkEditOpen(true); }}>
                                <Edit className="h-4 w-4 mr-2" /> Bulk Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => void handleAIAutoCrop()} disabled={!!aiProcessing}>
                                {aiProcessing === "autocrop"
                                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  : <Crop className="h-4 w-4 mr-2" />}
                                AI Image Auto Crop
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleAIBgRemove()} disabled={!!aiProcessing}>
                                {aiProcessing === "bgremove"
                                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  : <Wand2 className="h-4 w-4 mr-2" />}
                                AI Image Background Remover
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={handleResetPhoto}>
                                <RotateCcw className="h-4 w-4 mr-2" /> Reset Photo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setImageUploadTarget("selection"); photoUploadRef.current?.click(); }}>
                                <ImageIcon className="h-4 w-4 mr-2" /> Image Upload
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setBulkImageResults(null); setIsBulkImageUploadOpen(true); }} disabled={!dataRecords.length}>
                                <Archive className="h-4 w-4 mr-2" /> Bulk Image Upload
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setBarcodeField(dataFields[0]?.key ?? ""); setIsGenerateBarcodeOpen(true); }}>
                                <QrCode className="h-4 w-4 mr-2" /> Generate Bar Code
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={handleOpenAddData} disabled={!dataFields.length}>
                                <UserRound className="h-4 w-4 mr-2" /> Add New User
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setIsDeleteAllOpen(true)}
                                disabled={!dataRecords.length}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete All {dataCategory} Data
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">
                                <input
                                  type="checkbox"
                                  checked={dataSelectedIds.size === filteredRecords.length && filteredRecords.length > 0}
                                  onChange={toggleSelectAll}
                                  className="rounded"
                                />
                              </TableHead>
                              <TableHead className="w-12">S.No.</TableHead>
                              <TableHead>Name</TableHead>
                              {dataFields
                                .filter((f) => f.key !== "Name" && f.key !== "name" && !isPhotoFieldKey(f.key))
                                .slice(0, 8)
                                .map((f) => (
                                  <TableHead key={f.key}>{f.label}</TableHead>
                                ))}
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRecords.map((rec, idx) => {
                              const resolvedUrl = getRecordPhotoUrl(rec);
                              const imageUrl = resolvedUrl || DEFAULT_AVATAR;
                              const nameVal = String(rec["Name"] ?? rec["name"] ?? "—");
                              const isChecked = dataSelectedIds.has(rec.id);
                              return (
                                <TableRow key={rec.id} className={isChecked ? "bg-muted/50" : ""}>
                                  <TableCell>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setDataSelectedIds((prev) => {
                                          const next = new Set(prev);
                                          next.has(rec.id) ? next.delete(rec.id) : next.add(rec.id);
                                          return next;
                                        });
                                      }}
                                      className="rounded"
                                    />
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2.5">
                                      <img
                                        src={imageUrl}
                                        alt={nameVal}
                                        className="h-9 w-9 rounded-full object-cover shrink-0"
                                        onError={(event) => {
                                          const img = event.currentTarget;
                                          img.onerror = null;
                                          img.src = DEFAULT_AVATAR;
                                        }}
                                      />
                                      <div>
                                        <p className="text-sm font-medium leading-none">{nameVal}</p>
                                        {rec.groupId && (
                                          <Badge variant="secondary" className="text-[10px] mt-0.5 h-4">
                                            {dataGroups.find((g) => g.id === rec.groupId)?.name ?? ""}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </TableCell>
                                  {dataFields
                                    .filter((f) => f.key !== "Name" && f.key !== "name" && !isPhotoFieldKey(f.key))
                                    .slice(0, 8)
                                    .map((f) => (
                                      <TableCell key={f.key} className="text-sm">
                                        {String(rec[f.key] ?? "—")}
                                      </TableCell>
                                    ))}
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                        title="Upload photo"
                                        onClick={() => {
                                          setImageUploadTarget(rec.id);
                                          photoUploadRef.current?.click();
                                        }}
                                      >
                                        <Camera className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => {
                                          if (!id) return;
                                          deleteDataRecord(rec.id);
                                          setDataRecords(loadDataRecords(id, dataCategory));
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <input
                        ref={photoUploadRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUploadFiles}
                      />
                      {/* Bulk image upload — folder */}
                      <input
                        ref={bulkImageFolderRef}
                        type="file"
                        accept="image/*"
                        multiple
                        // @ts-expect-error webkitdirectory is non-standard
                        webkitdirectory=""
                        className="hidden"
                        onChange={handleBulkImageFolderChange}
                      />
                      {/* Bulk image upload — ZIP */}
                      <input
                        ref={bulkImageZipRef}
                        type="file"
                        accept=".zip,application/zip,application/x-zip-compressed"
                        className="hidden"
                        onChange={handleBulkImageZipChange}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── GROUPS sub-tab ── */}
            {dataSubTab === "groups" && (
              <Card className="shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Groups
                      <Badge variant="outline">{dataGroups.length}</Badge>
                    </CardTitle>
                    <Button size="sm" className="gap-1.5 text-xs" onClick={() => setIsAddGroupOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Add Group
                    </Button>
                  </div>
                  {templates.length === 0 && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mt-2">
                      No templates found for this project. Go to the <strong>Templates</strong> tab to create one first.
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {dataGroups.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg p-10 text-center text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">No groups yet</p>
                      <p className="text-xs mt-1">Create a group and assign a template to organise records for printing.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dataGroups.map((g) => {
                        const assignedTemplate = templates.find((t) => t.id === g.templateId);
                        const recordCount = dataRecords.filter((r) => r.groupId === g.id).length;
                        const appliedFilters = [
                          { label: "Class", value: g.classFilter },
                          { label: "Gender", value: g.genderFilter },
                          { label: "Transport", value: g.transportFilter },
                          { label: "Boarding", value: g.boardingFilter },
                          { label: "House", value: g.houseFilter },
                        ].filter((item) => Boolean(item.value));
                        return (
                          <div key={g.id} className="flex items-center gap-3 px-3 py-3 rounded-lg border bg-muted/30">
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                            {/* Group name + record count */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{g.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {recordCount} {recordCount === 1 ? "record" : "records"}
                                </Badge>
                              </div>

                              {appliedFilters.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {appliedFilters.map((item) => (
                                    <Badge key={`${g.id}-${item.label}`} variant="outline" className="text-[10px] h-5">
                                      {item.label}: {item.value}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* Template selector per group */}
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <Select
                                  value={g.templateId ?? "__none__"}
                                  onValueChange={(val) => handleGroupTemplateChange(g.id, val === "__none__" ? "" : val)}
                                >
                                  <SelectTrigger className="h-6 text-xs w-48 border-dashed">
                                    <SelectValue placeholder="Assign template…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">No template</SelectItem>
                                    {templates.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.templateName}
                                        <span className="ml-1.5 text-muted-foreground text-[10px]">({t.templateType})</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {assignedTemplate && (
                                  <Badge variant="outline" className="text-[10px] h-5 gap-1 border-primary/40 text-primary">
                                    <Layers className="h-2.5 w-2.5" />
                                    {assignedTemplate.templateName}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Delete */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                              onClick={() => {
                                deleteDataGroup(g.id);
                                setDataGroups((prev) => prev.filter((x) => x.id !== g.id));
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── FIELDS sub-tab ── */}
            {dataSubTab === "fields" && (
              <Card className="shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GripVertical className="h-4 w-4" />
                      Fields
                      <Badge variant="outline">{dataFields.length}</Badge>
                    </CardTitle>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        setEditFieldsDraft(dataFields.length ? [...dataFields] : [{ key: "Name", label: "Name" }]);
                        setIsEditFieldsOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Fields
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {dataFields.length === 0 ? (
                    <div className="border-2 border-dashed rounded-lg p-10 text-center text-muted-foreground">
                      <Settings2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No fields defined. Upload a CSV or edit fields manually.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dataFields.map((f, i) => (
                        <div key={f.key} className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-muted/30">
                          <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                          <span className="text-sm font-medium flex-1">{f.label}</span>
                          <Badge variant="outline" className="text-xs font-mono">{f.key}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Generate Preview Dialog ── */}
          <Dialog open={isGeneratePreviewOpen} onOpenChange={(open) => {
            if (isGeneratingPreview) return;
            setIsGeneratePreviewOpen(open);
            if (!open) { setPreviewError(""); setPreviewPageIndex(0); setRuleAssignments(null); }
          }}>
            <DialogContent className="!w-[90vw] !max-w-none !h-[90vh] !p-0 !gap-0 flex flex-col overflow-hidden">
              {/* ── Header ── */}
              <DialogHeader className="flex-shrink-0 px-5 py-3 border-b bg-background">
                <div className="flex items-center gap-3">
                  <div>
                    <DialogTitle className="text-base font-semibold leading-tight">Generate Preview</DialogTitle>
                    <p className="text-xs text-muted-foreground">
                      {selectedRecords.length} selected record(s)
                    </p>
                  </div>
                </div>
              </DialogHeader>

              {/* ── Body: split layout ── */}
              <div className="flex flex-1 overflow-hidden min-h-0">

                {/* ─────────────── LEFT PANEL (30%) ─────────────── */}
                <div className="w-[30%] min-w-[270px] flex-shrink-0 flex flex-col border-r overflow-hidden bg-background">
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

                    {/* Rule-based matching indicator */}
                    {previewForm.useRuleBasedMapping && projectRules.length > 0 && (
                      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                        <GitBranch className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-primary">Rule-Based Matching Active</p>
                          <p className="text-muted-foreground">{projectRules.length} rule{projectRules.length !== 1 ? "s" : ""} applied · {Object.keys(ruleAssignments || {}).length}/{selectedRecords.length} records matched</p>
                        </div>
                      </div>
                    )}

                    {/* 1. Output Setup */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex-shrink-0">1</span>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output Setup</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Page Size</Label>
                          <Select
                            value={previewForm.pageSize}
                            onValueChange={(value) => {
                              const size = value as PreviewPageSize;
                              setPreviewForm((prev) => {
                                if (size === "Custom") return { ...prev, pageSize: size };
                                const dims = PAGE_SIZE_DIMENSIONS[size];
                                return { ...prev, pageSize: size, sheetWidthMm: String(dims.width), sheetHeightMm: String(dims.height) };
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select page size" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                              <SelectItem value="A3">A3 (297 × 420 mm)</SelectItem>
                              <SelectItem value="Letter">Letter (216 × 279 mm)</SelectItem>
                              <SelectItem value="Legal">Legal (216 × 356 mm)</SelectItem>
                              <SelectItem value="Custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Orientation</Label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Button
                              type="button"
                              variant={previewForm.orientation === "portrait" ? "default" : "outline"}
                              className="h-7 text-xs"
                              onClick={() => setPreviewForm((prev) => ({ ...prev, orientation: "portrait" }))}
                            >
                              Portrait
                            </Button>
                            <Button
                              type="button"
                              variant={previewForm.orientation === "landscape" ? "default" : "outline"}
                              className="h-7 text-xs"
                              onClick={() => setPreviewForm((prev) => ({ ...prev, orientation: "landscape" }))}
                            >
                              Landscape
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-border" />

                    {/* 2. PDF Settings */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex-shrink-0">2</span>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PDF Settings</h3>
                      </div>

                      {/* Page Settings card */}
                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded bg-blue-100 dark:bg-blue-950 flex items-center justify-center flex-shrink-0">
                            <FileText className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <span className="text-xs font-medium">Page Settings</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">{previewForm.sheetWidthMm}×{previewForm.sheetHeightMm} mm</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Size (mm)</Label>
                            <div className="flex gap-1">
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">W</Label>
                                <Input type="number" value={previewForm.sheetWidthMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, sheetWidthMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">H</Label>
                                <Input type="number" value={previewForm.sheetHeightMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, sheetHeightMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Margins (mm)</Label>
                            <div className="flex gap-1">
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">H</Label>
                                <Input type="number" value={previewForm.pageMarginLeftMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, pageMarginLeftMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">V</Label>
                                <Input type="number" value={previewForm.pageMarginTopMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, pageMarginTopMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Settings card */}
                      <div className="rounded-md border bg-card p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
                            <LayoutGrid className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span className="text-xs font-medium">Card Settings</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Card Size (mm)</Label>
                            <div className="flex gap-1">
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">W</Label>
                                <Input type="number" value={previewForm.cardWidthMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, cardWidthMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">H</Label>
                                <Input type="number" value={previewForm.cardHeightMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, cardHeightMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Gap (mm)</Label>
                            <div className="flex gap-1">
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">H</Label>
                                <Input type="number" value={previewForm.columnMarginMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, columnMarginMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                              <div className="flex-1">
                                <Label className="text-[9px] text-muted-foreground">V</Label>
                                <Input type="number" value={previewForm.rowMarginMm} onChange={(e) => setPreviewForm((prev) => ({ ...prev, rowMarginMm: e.target.value }))} className="h-7 text-xs px-1.5" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Summary Stats — 2×2 compact grid */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Fits/page</p>
                          <p className="text-xs font-bold">{printLayout.columns}×{printLayout.rows}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Cards</p>
                          <p className="text-xs font-bold">{printLayout.cardsPerPage}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Pages</p>
                          <p className="text-xs font-bold">{Math.ceil(selectedRecords.length / printLayout.cardsPerPage)}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Records</p>
                          <p className="text-xs font-bold">{selectedRecords.length}</p>
                        </div>
                      </div>

                    </div>

                    <div className="h-px bg-border" />

                    {/* 3. File */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex-shrink-0">3</span>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">File</h3>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Output File Name</Label>
                        <Input
                          value={previewForm.fileName}
                          onChange={(e) => setPreviewForm((prev) => ({ ...prev, fileName: e.target.value }))}
                          placeholder="Enter file name"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {previewError && (
                      <p className="text-xs text-destructive">{previewError}</p>
                    )}

                  </div>{/* end scrollable */}

                  {/* Sticky action buttons */}
                  <div className="border-t px-4 py-3 flex gap-2 flex-shrink-0 bg-background">
                    <Button
                      variant="outline"
                      className="flex-1 h-9 text-sm"
                      disabled={isGeneratingPreview}
                      onClick={() => setIsGeneratePreviewOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 h-9 text-sm gap-1.5"
                      disabled={isGeneratingPreview}
                      onClick={() => void handleGeneratePreviewPdf()}
                    >
                      {isGeneratingPreview
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Download className="h-3.5 w-3.5" />}
                      Generate
                    </Button>
                  </div>
                </div>{/* end left panel */}

                {/* ─────────────── RIGHT PANEL (70%) ─────────────── */}
                {(() => {
                  const totalPreviewPages = Math.max(1, Math.ceil(selectedRecords.length / printLayout.cardsPerPage));
                  const safePageIndex = Math.min(previewPageIndex, totalPreviewPages - 1);
                  const pageRecords = selectedRecords.slice(
                    safePageIndex * printLayout.cardsPerPage,
                    (safePageIndex + 1) * printLayout.cardsPerPage
                  );
                  return (
                    <div className="flex-1 flex flex-col overflow-hidden">

                      {/* Preview toolbar */}
                      <div className="flex items-center justify-between px-5 py-2.5 border-b bg-background flex-shrink-0">
                        <span className="text-sm font-semibold">Live Preview</span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPreviewZoom((z) => Math.max(25, z - 25))}
                            disabled={previewZoom <= 25}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-sm font-mono min-w-[3.5rem] text-center select-none tabular-nums">
                            {previewZoom}%
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPreviewZoom((z) => Math.min(200, z + 25))}
                            disabled={previewZoom >= 200}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          <div className="w-px h-5 bg-border mx-1.5" />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => {
                              const container = previewContainerRef.current;
                              if (!container) { setPreviewZoom(90); return; }
                              const w = container.clientWidth - 32;
                              const wz = Math.floor((w / printLayout.sheetWidthPx) * 100);
                              setPreviewZoom(Math.max(25, Math.round(Math.min(wz, 100) / 5) * 5));
                            }}
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                            Fit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => setPreviewZoom(100)}
                          >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            Grid
                          </Button>
                        </div>
                      </div>

                      {/* Thumbnails + main preview */}
                      <div className="flex flex-1 overflow-hidden min-h-0">

                        {/* Page thumbnails sidebar */}
                        <div className="w-[100px] border-r bg-muted/40 overflow-y-auto py-2.5 px-2 flex flex-col gap-2 flex-shrink-0">
                          {Array.from({ length: totalPreviewPages }, (_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setPreviewPageIndex(i)}
                              title={`Page ${i + 1}`}
                              className={`w-full rounded-md overflow-hidden border-2 transition-all ${
                                safePageIndex === i
                                  ? "border-primary ring-1 ring-primary/30 bg-primary/5"
                                  : "border-transparent hover:border-muted-foreground/30 hover:bg-background/80"
                              }`}
                            >
                              <div
                                className={`w-full flex items-center justify-center text-[9px] font-semibold bg-white shadow-sm ${
                                  safePageIndex === i ? "text-primary" : "text-muted-foreground"
                                }`}
                                style={{ aspectRatio: `${previewForm.sheetWidthMm} / ${previewForm.sheetHeightMm}` }}
                              >
                                {i + 1}
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Main preview area */}
                        <div
                          ref={previewContainerRef}
                          className="flex-1 overflow-auto bg-slate-100/80 dark:bg-slate-900/40 flex items-start justify-center"
                          style={{ padding: "16px" }}
                        >
                          {!selectedGenerateTemplate ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-3 w-full">
                              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                              </div>
                              <p className="text-sm text-muted-foreground">Select a template to see preview</p>
                            </div>
                          ) : selectedFullTemplateLoading ? (
                            <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 w-full">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              <p className="text-sm text-muted-foreground">Loading template design…</p>
                            </div>
                          ) : (
                            /* Outer div matches the visual (scaled) size so layout flow is correct */
                            <div
                              style={{
                                width: `${printLayout.sheetWidthPx * previewZoom / 100}px`,
                                height: `${printLayout.sheetHeightPx * previewZoom / 100}px`,
                                flexShrink: 0,
                                position: "relative",
                              }}
                            >
                              {/* Inner div applies the CSS transform from top-left origin */}
                              <div
                                style={{
                                  transform: `scale(${previewZoom / 100})`,
                                  transformOrigin: "top left",
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: `${printLayout.sheetWidthPx}px`,
                                  height: `${printLayout.sheetHeightPx}px`,
                                }}
                              >
                                <div
                                  className="bg-white shadow-2xl"
                                  style={{
                                    width: `${printLayout.sheetWidthPx}px`,
                                    minHeight: `${printLayout.sheetHeightPx}px`,
                                    padding: `${printLayout.marginTopPx}px ${printLayout.marginLeftPx}px`,
                                    boxSizing: "border-box",
                                  }}
                                >
                                  <IdCardGrid
                                    students={pageRecords}
                                    template={selectedGenerateTemplate}
                                    containerClassName="p-0"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>{/* end thumbnails + main */}

                      {/* Pagination footer */}
                      <div className="border-t bg-background px-5 py-2.5 flex items-center justify-between flex-shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {totalPreviewPages} pages &bull; {selectedRecords.length} records
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={safePageIndex <= 0}
                            onClick={() => setPreviewPageIndex((p) => Math.max(0, p - 1))}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm font-medium min-w-[110px] text-center tabular-nums">
                            Page {safePageIndex + 1} of {totalPreviewPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={safePageIndex >= totalPreviewPages - 1}
                            onClick={() => setPreviewPageIndex((p) => Math.min(totalPreviewPages - 1, p + 1))}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                    </div>
                  );
                })()}

              </div>{/* end body split */}
            </DialogContent>
          </Dialog>

          {/* ── Generate Bar Code Dialog ── */}
          <Dialog open={isGenerateBarcodeOpen} onOpenChange={setIsGenerateBarcodeOpen}>
            <DialogContent className="sm:max-w-[380px]">
              <DialogHeader>
                <DialogTitle>Generate Bar Code</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <p className="text-sm text-muted-foreground">
                  Select which field value to encode as a barcode. Barcodes will be saved to
                  {dataSelectedIds.size > 0 ? ` ${dataSelectedIds.size} selected` : " all"} records.
                </p>
                <div className="space-y-1.5">
                  <Label>Field to encode</Label>
                  <Select value={barcodeField} onValueChange={setBarcodeField}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select a field…" />
                    </SelectTrigger>
                    <SelectContent>
                      {dataFields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setIsGenerateBarcodeOpen(false)}>Cancel</Button>
                <Button className="flex-1 gap-1.5" disabled={!barcodeField} onClick={handleGenerateBarcodes}>
                  <QrCode className="h-4 w-4" /> Generate
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Bulk Image Upload Dialog ── */}
          <Dialog open={isBulkImageUploadOpen} onOpenChange={(o) => { setIsBulkImageUploadOpen(o); if (!o) setBulkImageResults(null); }}>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Bulk Image Upload
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-1">
                {/* Upload buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="gap-2 h-20 flex-col text-sm"
                    disabled={bulkImageProcessing}
                    onClick={() => bulkImageZipRef.current?.click()}
                  >
                    <Archive className="h-6 w-6 text-muted-foreground" />
                    Upload ZIP File
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 h-20 flex-col text-sm"
                    disabled={bulkImageProcessing}
                    onClick={() => bulkImageFolderRef.current?.click()}
                  >
                    <FolderOpen className="h-6 w-6 text-muted-foreground" />
                    Upload Folder
                  </Button>
                </div>

                {/* Processing indicator */}
                {bulkImageProcessing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing images…
                  </div>
                )}

                {/* Results */}
                {bulkImageResults && !bulkImageProcessing && (
                  <div className="space-y-2.5">

                    {/* ── MATCHED ── */}
                    <details className="rounded-lg border border-green-200 bg-green-50 overflow-hidden" open>
                      <summary className="flex items-center gap-1.5 px-3 py-2.5 cursor-pointer select-none text-sm font-medium text-green-800 [list-style:none] [&::-webkit-details-marker]:hidden">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>{bulkImageResults.matched.length} image{bulkImageResults.matched.length !== 1 ? 's' : ''} matched</span>
                        <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-50" />
                      </summary>
                      {bulkImageResults.matched.length > 0 && (
                        <ul className="text-xs text-green-700 space-y-0.5 max-h-36 overflow-y-auto px-3 pb-2.5 pt-1.5 border-t border-green-200">
                          {bulkImageResults.matched.map((m) => (
                            <li key={m.userId} className="flex gap-1.5 items-center">
                              <img src={m.imageUrl} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                              <span className="truncate">{m.filename} → <strong>{m.name}</strong></span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>

                    {/* ── DUPLICATES ── */}
                    {bulkImageResults.duplicates.length > 0 && (
                      <details className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                        <summary className="flex items-center gap-1.5 px-3 py-2.5 cursor-pointer select-none text-sm font-medium text-amber-800 [list-style:none] [&::-webkit-details-marker]:hidden">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{bulkImageResults.duplicates.length} ambiguous match{bulkImageResults.duplicates.length !== 1 ? 'es' : ''}</span>
                          <span className="text-xs font-normal ml-1 opacity-60">(not applied — review manually)</span>
                          <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-50" />
                        </summary>
                        <ul className="text-xs space-y-3 max-h-52 overflow-y-auto px-3 pb-3 pt-2 border-t border-amber-200">
                          {bulkImageResults.duplicates.map((d, i) => (
                            <li key={i}>
                              <p className="font-semibold text-amber-900 truncate mb-1">📄 {d.filename}</p>
                              <p className="text-amber-700 mb-1 italic">{d.appliedName}</p>
                              <ul className="pl-3 space-y-0.5">
                                {d.allMatchNames.map((name, ni) => (
                                  <li key={ni} className="text-amber-800">{ni + 1}. {name}</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {/* ── UNMATCHED ── */}
                    {bulkImageResults.unmatched.length > 0 && (
                      <details open className="rounded-lg border border-muted bg-muted/30 overflow-hidden">
                        <summary className="flex items-center gap-1.5 px-3 py-2.5 cursor-pointer select-none text-sm font-medium text-muted-foreground [list-style:none] [&::-webkit-details-marker]:hidden">
                          <X className="h-4 w-4 shrink-0" />
                          <span>{bulkImageResults.unmatched.length} file{bulkImageResults.unmatched.length !== 1 ? 's' : ''} unmatched</span>
                          <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-50" />
                        </summary>
                        <ul className="text-xs space-y-2 max-h-52 overflow-y-auto px-3 pb-3 pt-2 border-t border-muted">
                          {bulkImageResults.unmatched.map((u, i) => (
                            <li key={i}>
                              <p className="font-medium text-foreground/80 truncate">📄 {u.filename}</p>
                              <p className="text-[11px] pl-3 text-muted-foreground mt-0.5 break-all select-all">↳ {u.reason}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setIsBulkImageUploadOpen(false); setBulkImageResults(null); }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!bulkImageResults || bulkImageResults.matched.length === 0 || bulkImageProcessing}
                  onClick={handleApplyBulkImages}
                >
                  Apply {bulkImageResults?.matched.length ? `(${bulkImageResults.matched.length})` : ""} Images
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Delete All Data Confirm Dialog ── */}
          <Dialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
            <DialogContent className="sm:max-w-[380px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Delete All {dataCategory === "student" ? "Student" : "Staff"} Data
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-2">
                This will permanently delete all <strong>{dataRecords.length} {dataCategory}</strong> records
                and their fields for this project. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setIsDeleteAllOpen(false)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={handleDeleteAllData}>Delete All</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Add Data Dialog ── */}
          <Dialog open={isAddDataOpen} onOpenChange={setIsAddDataOpen}>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Add Record</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto py-1">
                {dataFields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      value={addDataDraft[f.key] ?? ""}
                      onChange={(e) => setAddDataDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setIsAddDataOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleCommitAddData}>Add Record</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Bulk Edit Dialog ── */}
          <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>
                  Bulk Edit
                  {dataSelectedIds.size > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-2 align-middle">
                      ({dataSelectedIds.size} records selected)
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="space-y-1.5">
                  <Label>Field to update</Label>
                  <Select value={bulkEditField} onValueChange={setBulkEditField}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select a field…" />
                    </SelectTrigger>
                    <SelectContent>
                      {dataFields.map((f) => (
                        <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>New value</Label>
                  <Input
                    value={bulkEditValue}
                    onChange={(e) => setBulkEditValue(e.target.value)}
                    placeholder="Enter new value…"
                    className="h-8 text-xs"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {dataSelectedIds.size > 0
                    ? `Will update ${dataSelectedIds.size} selected record(s)`
                    : `Will update all ${dataRecords.length} record(s)`}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setIsBulkEditOpen(false)}>Cancel</Button>
                <Button className="flex-1" disabled={!bulkEditField} onClick={handleCommitBulkEdit}>Apply</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Edit Fields Dialog ── */}
          <Dialog open={isEditFieldsOpen} onOpenChange={setIsEditFieldsOpen}>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Edit Fields</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-80 overflow-y-auto py-1">
                {editFieldsDraft.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={f.key}
                      onChange={(e) => setEditFieldsDraft((d) => d.map((x, j) => j === i ? { ...x, key: e.target.value } : x))}
                      placeholder="Key"
                      className="h-8 text-xs font-mono flex-1"
                    />
                    <Input
                      value={f.label}
                      onChange={(e) => setEditFieldsDraft((d) => d.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder="Label"
                      className="h-8 text-xs flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setEditFieldsDraft((d) => d.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs w-full"
                onClick={() => setEditFieldsDraft((d) => [...d, { key: "", label: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Add Field
              </Button>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setIsEditFieldsOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleSaveFields}>Save Fields</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Add Group Dialog ── */}
          <Dialog open={isAddGroupOpen} onOpenChange={(open) => { setIsAddGroupOpen(open); if (!open) { resetAddGroupDialog(); } }}>
            <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
              <DialogHeader>
                <div className="border-b bg-muted/30 px-6 py-4">
                  <DialogTitle>Add Group</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create a print group and assign a template for grouped records.
                  </p>
                </div>
              </DialogHeader>
              <div className="space-y-5 px-6 py-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Group Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g. Class A, Good Quality"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(); }}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>School</Label>
                    <Input value={project?.client || "-"} readOnly className="h-9 bg-muted/40" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Select value={newGroupTemplateId || "__none__"} onValueChange={(val) => setNewGroupTemplateId(val === "__none__" ? "" : val)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={previewTemplates.length === 0 ? "No templates available" : "Select a template"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No template</SelectItem>
                      {previewTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                            {t.templateName}
                            <span className="text-muted-foreground text-xs">({t.templateType})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {previewTemplates.length === 0 && (
                    <p className="text-xs text-muted-foreground">Create templates in the Templates tab first.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Filters</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Class</Label>
                      <Select
                        value={newGroupFilters.classValue}
                        onValueChange={(value) => setNewGroupFilters((prev) => ({ ...prev, classValue: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GROUP_FILTER_ALL}>All</SelectItem>
                          {groupFilterOptions.classValue.map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Gender</Label>
                      <Select
                        value={newGroupFilters.gender}
                        onValueChange={(value) => setNewGroupFilters((prev) => ({ ...prev, gender: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Gender" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GROUP_FILTER_ALL}>All</SelectItem>
                          {groupFilterOptions.gender.map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Transport</Label>
                      <Select
                        value={newGroupFilters.transport}
                        onValueChange={(value) => setNewGroupFilters((prev) => ({ ...prev, transport: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Transport" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GROUP_FILTER_ALL}>All</SelectItem>
                          {groupFilterOptions.transport.map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Boarding</Label>
                      <Select
                        value={newGroupFilters.boarding}
                        onValueChange={(value) => setNewGroupFilters((prev) => ({ ...prev, boarding: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Boarding" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GROUP_FILTER_ALL}>All</SelectItem>
                          {groupFilterOptions.boarding.map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">House</Label>
                      <Select
                        value={newGroupFilters.house}
                        onValueChange={(value) => setNewGroupFilters((prev) => ({ ...prev, house: value }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="House" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GROUP_FILTER_ALL}>All</SelectItem>
                          {groupFilterOptions.house.map((value) => (
                            <SelectItem key={value} value={value}>{value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  Selected records can be assigned to this group from the Data tab after creating it.
                </div>
              </div>

              <div className="flex gap-3 px-6 pb-6">
                <Button variant="outline" className="flex-1" onClick={() => setIsAddGroupOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleAddGroup} disabled={!newGroupName.trim()}>Create Group</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Confirmation dialog for removing a template from the project */}
      <AlertDialog
        open={!!confirmDeleteTemplate}
        onOpenChange={(open) => { if (!open) setConfirmDeleteTemplate(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>&ldquo;{confirmDeleteTemplate?.templateName}&rdquo;</strong>{" "}
              from this project? This will not affect the Template Gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteTemplate) {
                  handleDeleteProjectTemplate(confirmDeleteTemplate);
                  setConfirmDeleteTemplate(null);
                }
              }}
            >
              Yes, Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


