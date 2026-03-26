import { useParams, Link, useNavigate } from "react-router";
import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft, Plus, Trash2, Edit, Upload, FileText,
  CheckCircle2, Circle, Clock, MoreVertical, Download,
  Package, ListTodo, FolderOpen, Database, Layers, Printer, Pencil, FilePlus, X,
  Filter, MoreHorizontal, UserCircle, FileSpreadsheet, Settings2, Users, GripVertical,
  Crop, Wand2, RotateCcw, ImageIcon, UserPlus, FileDown, Archive, Camera, Loader2,
  QrCode, UserRound, AlertTriangle,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
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
  loadProjectTemplates, addProjectTemplate, deleteProjectTemplate, updateProjectTemplate,
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
} from "../../lib/apiService";
import { DESIGNER_CONTEXT_KEY } from "../../lib/fabricUtils";
import { BulkImportWizard } from "../components/BulkImportWizard";

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
const emptyTemplateForm = {
  templateName: "",
  templateType: "id_card" as ProjectTemplate["templateType"],
  pageFormat: "a4" as PageFormat,
  canvas: { width: 297, height: 210 },
  margin: { top: 1, left: 1, right: 1, bottom: 1 },
  applicableFor: "",
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
    createdAt: String(p.createdAt || new Date().toISOString()),
  };
};

const getRecordPhoto = (rec: ProjectDataRecord): string => {
  const candidate =
    rec.profilePic
    ?? rec.profilepic
    ?? rec.link
    ?? rec.photoUrl
    ?? rec.photo_url
    ?? rec.imageUrl
    ?? rec.image_url
    ?? rec.photo
    ?? rec.Photo
    ?? rec.image
    ?? rec.Image
    ?? rec.avatar
    ?? rec.Avatar
    ?? rec.picture
    ?? rec.Picture;
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

function getRecordPhotoUrl(rec: ProjectDataRecord): string {
  const value = getRecordPhoto(rec);
  return resolveProfileImageUrl(value);
}
const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Ccircle cx='18' cy='18' r='18' fill='%23e2e8f0'/%3E%3Ccircle cx='18' cy='14' r='6' fill='%2394a3b8'/%3E%3Cellipse cx='18' cy='30' rx='10' ry='7' fill='%2394a3b8'/%3E%3C/svg%3E";

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
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
  const [imageUploadTarget, setImageUploadTarget] = useState("selection");
  const [isAddDataOpen, setIsAddDataOpen] = useState(false);
  const [addDataDraft, setAddDataDraft] = useState<Record<string, string>>({});
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState("");
  const [bulkEditValue, setBulkEditValue] = useState("");
  const [aiProcessing, setAiProcessing] = useState<string | null>(null);
  const [isGenerateBarcodeOpen, setIsGenerateBarcodeOpen] = useState(false);
  const [barcodeField, setBarcodeField] = useState("");
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);

  // Template dialog state
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateErrors, setTemplateErrors] = useState<{ templateName?: string; applicableFor?: string }>({});
  const [previewTemplate, setPreviewTemplate] = useState<ProjectTemplate | null>(null);

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

  // Load data
  const products = id ? loadProjectProducts(id) : [];
  const tasks = id ? loadProjectTasks(id) : [];
  const files = id ? loadProjectFiles(id) : [];
  const templates = id ? loadProjectTemplates(id) : [];

  const refresh = () => setVersion((v) => v + 1);

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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);
    return c.toDataURL("image/png");
  };

  const handleCreateTemplate = () => {
    if (!validateTemplate() || !id) return;
    const thumb = createBlankTemplateThumbnail(templateForm.canvas.width, templateForm.canvas.height);
    addProjectTemplate({
      projectId: id,
      templateName: templateForm.templateName,
      templateType: templateForm.templateType,
      canvas: templateForm.canvas,
      margin: templateForm.margin,
      applicableFor: templateForm.applicableFor,
      thumbnail: thumb,
      isPublic: true,
    });
    setTemplateForm(emptyTemplateForm);
    setTemplateErrors({});
    setIsCreateTemplateOpen(false);
    refresh();
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
        headers.forEach((h, idx) => { rec[h] = vals[idx] ?? ""; });
        return rec;
      });
      saveDataFields(projectId, category, newFields);
      saveDataRecords(projectId, category, records);
      setDataFields(newFields);
      setDataRecords(records);
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

  const toggleSelectAll = () => {
    if (dataSelectedIds.size === filteredRecords.length) {
      setDataSelectedIds(new Set());
    } else {
      setDataSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const deleteSelected = () => {
    if (!id) return;
    dataSelectedIds.forEach((rid) => deleteDataRecord(rid));
    const updated = loadDataRecords(id, dataCategory);
    setDataRecords(updated);
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
    });
    setDataGroups((prev) => [...prev, g]);
    setNewGroupName("");
    setNewGroupTemplateId("");
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
    saveDataRecords(id, dataCategory, updated);
    setDataRecords(updated);
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
    saveDataRecords(id, dataCategory, updated);
    setDataRecords(updated);
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
    if (id) saveDataRecords(id, dataCategory, updated);
    setDataRecords(updated);
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
    if (id) saveDataRecords(id, dataCategory, updated);
    setDataRecords(updated);
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
    saveDataRecords(id, dataCategory, updated);
    setDataRecords(updated);
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
      saveDataRecords(id, dataCategory, updated);
      setDataRecords(updated);
      setImageUploadTarget("selection");
    });
    e.target.value = "";
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
    saveDataRecords(id, dataCategory, updated);
    setDataRecords(updated);
    setIsGenerateBarcodeOpen(false);
    setBarcodeField("");
  };

  // ── Delete All student/staff Data ──
  const handleDeleteAllData = () => {
    if (!id) return;
    saveDataRecords(id, dataCategory, []);
    saveDataFields(id, dataCategory, []);
    setDataRecords([]);
    setDataFields([]);
    setDataSelectedIds(new Set());
    setIsDeleteAllOpen(false);
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
      <Tabs defaultValue="details" className="space-y-4">
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
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsCreateTemplateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateTemplate}>Create Template</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Template Preview Dialog */}
          <Dialog open={!!previewTemplate} onOpenChange={(o) => { if (!o) setPreviewTemplate(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Template Preview</DialogTitle></DialogHeader>
              {previewTemplate && (
                <div className="space-y-4">
                  <div className="bg-muted/40 rounded-lg p-6 flex items-center justify-center">
                    <div className="bg-white shadow-md rounded border border-border relative overflow-hidden flex items-center justify-center"
                      style={{ width: Math.min(220, previewTemplate.canvas.width * 0.6), height: Math.min(280, previewTemplate.canvas.height * 0.6) }}>
                      {previewTemplate.thumbnail ? (
                        <img
                          src={previewTemplate.thumbnail}
                          alt={previewTemplate.templateName}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Layers className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{previewTemplate.templateType.replace("_"," ")}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Canvas</span><span className="font-medium">{previewTemplate.canvas.width} \u00d7 {previewTemplate.canvas.height} mm</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Margin T/L/R/B</span><span className="font-medium">{previewTemplate.margin.top}/{previewTemplate.margin.left}/{previewTemplate.margin.right}/{previewTemplate.margin.bottom} mm</span></div>
                    {previewTemplate.applicableFor && <div className="flex justify-between"><span className="text-muted-foreground">For</span><span className="font-medium">{previewTemplate.applicableFor}</span></div>}
                  </div>
                  <pre className="bg-muted rounded p-3 text-[10px] overflow-auto max-h-40">
                    {JSON.stringify({ templateName: previewTemplate.templateName, templateType: previewTemplate.templateType, canvas: previewTemplate.canvas, margin: previewTemplate.margin }, null, 2)}
                  </pre>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Project Templates</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => templates.length > 0 && setPreviewTemplate(templates[0])} disabled={templates.length === 0}>
                    <Download className="h-4 w-4" />Generate Preview
                  </Button>
                  <Button size="sm" className="gap-2" onClick={() => setIsCreateTemplateOpen(true)}>
                    <Plus className="h-4 w-4" />Create new template
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No templates created yet</p>
                  <Button variant="outline" onClick={() => setIsCreateTemplateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />Create new template
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((tmpl) => (
                    <div key={tmpl.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow space-y-3">
                      <div className="bg-muted/30 rounded flex items-center justify-center h-28 relative overflow-hidden">
                        {tmpl.thumbnail ? (
                          <img
                            src={tmpl.thumbnail}
                            alt={tmpl.templateName}
                            className="max-h-full max-w-full object-contain rounded shadow"
                          />
                        ) : (
                          <div className="bg-white shadow rounded relative overflow-hidden flex items-center justify-center"
                            style={{ width: Math.min(80, tmpl.canvas.width), height: Math.min(96, tmpl.canvas.height) }}>
                            <Layers className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm truncate">{tmpl.templateName}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] capitalize">{tmpl.templateType.replace("_"," ")}</Badge>
                          <Badge variant="outline" className="text-[10px]">{tmpl.canvas.width}\u00d7{tmpl.canvas.height}mm</Badge>
                        </div>
                        {tmpl.applicableFor && <p className="text-xs text-muted-foreground mt-1 truncate">For: {tmpl.applicableFor}</p>}
                        <p className="text-xs text-muted-foreground">{tmpl.createdAt}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => setPreviewTemplate(tmpl)}>
                          <Download className="h-3 w-3" />Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs gap-1 text-primary hover:text-primary"
                          onClick={() => {
                            const rawMargin = (tmpl as any).margin ?? {};
                            const normalizedMargin = {
                              top: Number(rawMargin.top ?? (tmpl as any).marginTop ?? 0) || 0,
                              left: Number(rawMargin.left ?? (tmpl as any).marginLeft ?? 0) || 0,
                              right: Number(rawMargin.right ?? (tmpl as any).marginRight ?? 0) || 0,
                              bottom: Number(rawMargin.bottom ?? (tmpl as any).marginBottom ?? 0) || 0,
                            };
                            // Save template config to designer storage key so DesignerStudio picks it up
                            const designerConfig = {
                              templateName: tmpl.templateName,
                              templateType: tmpl.templateType,
                              canvas: tmpl.canvas,
                              margin: normalizedMargin,
                            };
                            localStorage.setItem("vendor_designer_template_config", JSON.stringify(designerConfig));
                            // Write context so DesignerStudio can save back to this exact template
                            localStorage.setItem(DESIGNER_CONTEXT_KEY, JSON.stringify({
                              projectId: project.id,
                              templateId: tmpl.id,
                              projectName: project.name,
                              templateName: tmpl.templateName,
                            }));
                            navigate("/designer-studio");
                          }}
                        >
                          <Pencil className="h-3 w-3" />Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { deleteProjectTemplate(tmpl.id); refresh(); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
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
                      saveDataRecords(id, dataCategory, records);
                      setDataFields(fields);
                      setDataRecords(records);
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
          <Dialog open={isAddGroupOpen} onOpenChange={(open) => { setIsAddGroupOpen(open); if (!open) { setNewGroupName(""); setNewGroupTemplateId(""); } }}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Add Group</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="space-y-1.5">
                  <Label>Group Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Class A, Good Quality…"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Select value={newGroupTemplateId || "__none__"} onValueChange={(val) => setNewGroupTemplateId(val === "__none__" ? "" : val)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={templates.length === 0 ? "No templates available" : "Select a template…"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No template</SelectItem>
                      {templates.map((t) => (
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
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground">Create templates in the Templates tab first.</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setIsAddGroupOpen(false)}>Cancel</Button>
                <Button className="flex-1" onClick={handleAddGroup} disabled={!newGroupName.trim()}>Add Group</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}


