import { useState, useRef, useEffect, useCallback, type DragEvent } from "react";
import { useNavigate } from "react-router";
import * as fabric from "fabric";
import jsPDF from "jspdf";
import {
  ArrowLeft,
  MousePointer2, ZoomIn, ZoomOut, Hand, Layers, Square, Circle as CircleIcon,
  Type, ImagePlus, Pen, QrCode, Barcode, Grid3x3, Triangle, Minus,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  Undo2, Redo2, Copy, Trash2, Download, FolderOpen, Plus, X, Eye,
  ChevronDown, ChevronLeft, ChevronRight, Save, Globe, Pencil,
  FileImage, Palette, SlidersHorizontal, LayoutGrid, Rows3,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../components/ui/tooltip";
import { Slider } from "../components/ui/slider";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Label } from "../components/ui/label";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { FabricCanvas, type FabricCanvasHandle } from "../components/designer/FabricCanvas";
import { PropertiesPanel, type CustomFont } from "../components/designer/PropertiesPanel";
import { BackgroundPanel } from "../components/designer/BackgroundPanel";
import { MaskPanel } from "../components/designer/MaskPanel";
import { ContextToolbar } from "../components/designer/ContextToolbar";
import { ShapesGallery } from "../components/designer/ShapesGallery";
import { HRuler, VRuler, RULER_THICKNESS } from "../components/designer/Ruler";
import {
  loadDesignerConfig, DEFAULT_CONFIG, DESIGNER_SAVE_KEY, DESIGNER_CONTEXT_KEY,
  mmToPx, PAGE_PRESETS, type TemplateConfig, type DesignerContext,
} from "../../lib/fabricUtils";
import {
  loadProjects, loadProjectTemplates, addProjectTemplate,
  updateProjectTemplate, type Project,
} from "../../lib/projectStore";
import { fetchProjects as apiFetchProjects } from "../../lib/apiService";
import { type ShapeItem } from "../../lib/shapesGallery";

// ─── Types ────────────────────────────────────────────────────────────────────

type DesignPage = { id: string; name: string; canvas: object };

type ToolId =
  | "select" | "zoom" | "hand"
  | "background" | "layers"
  | "shapes" | "text" | "image" | "draw"
  | "qrcode" | "barcode" | "alignment";

const EMPTY_CANVAS_JSON = { objects: [] as object[] };
const DESIGNER_IMPORT_MODE_KEY = "vendor_designer_import_mode";

function PagePreviewItem({
  page,
  index,
  isActive,
  activeLiveThumb,
  thumbZoom,
  sourceCanvasWidth,
  sourceCanvasHeight,
  onOpen,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  page: DesignPage;
  index: number;
  isActive: boolean;
  activeLiveThumb: string;
  thumbZoom: number;
  sourceCanvasWidth: number;
  sourceCanvasHeight: number;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string>("");

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (isActive && activeLiveThumb) {
      setThumbUrl(activeLiveThumb);
      return;
    }

    let cancelled = false;
    const canvasEl = document.createElement("canvas");
    const thumbW = Math.max(32, Math.round(sourceCanvasWidth));
    const thumbH = Math.max(32, Math.round(sourceCanvasHeight));
    const sc = new fabric.StaticCanvas(canvasEl, {
      width: thumbW,
      height: thumbH,
      renderOnAddRemove: false,
    });

    sc.loadFromJSON(JSON.stringify(page.canvas ?? EMPTY_CANVAS_JSON)).then(() => {
      sc.renderAll();
      if (!cancelled) {
        setThumbUrl(
          sc.toDataURL({
            format: "png",
            multiplier: 0.22,
            enableRetinaScaling: false,
          })
        );
      }
      sc.dispose();
    });

    return () => {
      cancelled = true;
      sc.dispose();
    };
  }, [isVisible, page.canvas, isActive, activeLiveThumb, sourceCanvasWidth, sourceCanvasHeight]);

  const scale = thumbZoom / 100;
  const frameHeightPx = Math.max(56, Math.round(84 * scale));

  return (
    <div
      ref={hostRef}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative rounded-md border transition-all cursor-pointer ${
        isActive
          ? "border-primary ring-1 ring-primary/40 bg-primary/5"
          : "border-border/70 hover:border-primary/40 hover:bg-muted/40"
      }`}
      onClick={onOpen}
    >
      <div className="px-1.5 pt-1 text-[10px] text-muted-foreground truncate">
        {index + 1}. {page.name}
      </div>
      <div className="p-1.5">
        <div
          className="w-full rounded border bg-white overflow-hidden flex items-center justify-center"
          style={{ height: `${frameHeightPx}px` }}
        >
          {thumbUrl ? (
            <img src={thumbUrl} alt={page.name} className="max-w-full max-h-full object-contain" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-muted/40 animate-pulse" />
          )}
        </div>
      </div>

      <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate();
          }}
          className="h-5 w-5 rounded bg-background/90 border border-border flex items-center justify-center hover:bg-accent"
          title="Duplicate page"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="h-5 w-5 rounded bg-background/90 border border-border flex items-center justify-center hover:bg-destructive/10 hover:text-destructive"
          title="Delete page"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Layers List ──────────────────────────────────────────────────────────────

function LayersList({
  canvasRef, onRefresh,
}: { canvasRef: React.RefObject<FabricCanvasHandle | null>; onRefresh: () => void }) {
  const fc = canvasRef.current?.getCanvas();
  const objects = fc ? fc.getObjects().filter((o) => !(o as any).excludeFromExport) : [];
  return (
    <div className="p-3">
      {objects.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          No layers yet. Add elements to the canvas.
        </p>
      ) : (
        <ul className="space-y-1">
          {[...objects].reverse().map((obj, i) => {
            const label =
              obj.type === "i-text" || obj.type === "textbox"
                ? `Text: "${((obj as fabric.IText).text ?? "").slice(0, 20)}"`
                : obj.type ? obj.type.charAt(0).toUpperCase() + obj.type.slice(1) : "Object";
            const isActive = fc?.getActiveObject() === obj;
            return (
              <li
                key={i}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                  isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                }`}
                onClick={() => { fc?.setActiveObject(obj); fc?.renderAll(); onRefresh(); }}
              >
                <span className="flex-1 truncate">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Alignment Tools ──────────────────────────────────────────────────────────

function AlignmentTools({
  canvasRef, onRefresh,
}: { canvasRef: React.RefObject<FabricCanvasHandle | null>; onRefresh: () => void }) {
  const align = (dir: Parameters<FabricCanvasHandle["alignToPage"]>[0]) => {
    canvasRef.current?.alignToPage(dir);
    onRefresh();
  };
  const btns: { dir: Parameters<FabricCanvasHandle["alignToPage"]>[0]; Icon: React.ElementType; label: string }[] = [
    { dir: "left",   Icon: AlignStartVertical,   label: "Left"   },
    { dir: "center", Icon: AlignCenterVertical,   label: "Center" },
    { dir: "right",  Icon: AlignEndVertical,      label: "Right"  },
    { dir: "top",    Icon: AlignStartHorizontal,  label: "Top"    },
    { dir: "middle", Icon: AlignCenterHorizontal, label: "Middle" },
    { dir: "bottom", Icon: AlignEndHorizontal,    label: "Bottom" },
  ];
  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Align to Page
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {btns.map(({ dir, Icon, label }) => (
          <Button
            key={dir} variant="outline" size="sm"
            className="h-10 flex-col gap-0.5 text-[10px] px-1"
            onClick={() => align(dir)}
          >
            <Icon className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─── ToolBtn ──────────────────────────────────────────────────────────────────

function ToolBtn({
  id, icon: Icon, label, activeTool, onClick,
}: {
  id: ToolId; icon: React.ElementType; label: string;
  activeTool: ToolId; onClick: (id: ToolId) => void;
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onClick(id)}
            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
              activeTool === id
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <Icon style={{ width: 18, height: 18 }} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DesignerStudio() {
  const navigate = useNavigate();
  const canvasRef       = useRef<FabricCanvasHandle | null>(null);
  const imageInputRef   = useRef<HTMLInputElement>(null);
  const svgInputRef     = useRef<HTMLInputElement>(null);
  const loadTplInputRef = useRef<HTMLInputElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  // ── Core state ─────────────────────────────────────────────────────────────
  const [config, setConfig] = useState<TemplateConfig>(
    () => loadDesignerConfig() ?? DEFAULT_CONFIG
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [showMargins,   setShowMargins]   = useState(true);
  const [showTopLabel,  setShowTopLabel]  = useState(true);
  const [selected, setSelected] = useState<fabric.FabricObject | null>(null);
  const [tick,     setTick]     = useState(0);
  const [currentBg, setCurrentBg] = useState<string>("#ffffff");
  const [userZoom, setUserZoom] = useState(100);
  const [safeZoneWarn, setSafeZoneWarn] = useState(false);
  const [rightTab, setRightTab] = useState<"background" | "properties" | "mask" | "layers" | "alignment">("background");

  // ── Custom fonts ────────────────────────────────────────────────────────────
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  // ── Tool state ─────────────────────────────────────────────────────────────
  const [activeTool,      setActiveTool]      = useState<ToolId>("select");
  const [shapesPopupOpen, setShapesPopupOpen] = useState(false);
  const [galleryOpen,     setGalleryOpen]     = useState(false);
  const [canUndo,         setCanUndo]         = useState(false);
  const [canRedo,         setCanRedo]         = useState(false);

  // ── Dialogs ────────────────────────────────────────────────────────────────
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrText,       setQrText]       = useState("https://example.com");
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [barcodeText,       setBarcodeText]       = useState("1234567890");
  const [previewOpen,  setPreviewOpen]  = useState(false);
  const [previewUrl,   setPreviewUrl]   = useState("");

  // ── Pages ──────────────────────────────────────────────────────────────────
  const [pages, setPages] = useState<DesignPage[]>([
    { id: "page-1", name: "Page 1", canvas: EMPTY_CANVAS_JSON },
  ]);
  const [activePageId,  setActivePageId]  = useState("page-1");
  const [pageCounter,   setPageCounter]   = useState(1);
  const [pageViewMode, setPageViewMode] = useState<"grid" | "strip">("grid");
  const [pagePanelCollapsed, setPagePanelCollapsed] = useState(false);
  const [thumbZoom, setThumbZoom] = useState(100);
  const [activeLiveThumb, setActiveLiveThumb] = useState("");
  const [dragPageId, setDragPageId] = useState<string | null>(null);
  const [pageLoadNonce, setPageLoadNonce] = useState(0);
  const activeCanvasHashRef = useRef("");

  // ── Designer context ───────────────────────────────────────────────────────
  const [designerContext] = useState<DesignerContext | null>(() => {
    try { const raw = localStorage.getItem(DESIGNER_CONTEXT_KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  });

  // ── Save dialog ────────────────────────────────────────────────────────────
  const [saveDialogOpen,   setSaveDialogOpen]   = useState(false);
  const [projects, setProjects]                 = useState<Project[]>([]);
  const [saveProjectId,    setSaveProjectId]    = useState(() => designerContext?.projectId ?? "");
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [isSaving,         setIsSaving]         = useState(false);
  const [importMode, setImportMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DESIGNER_IMPORT_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [saveIsPublic,     setSaveIsPublic]      = useState<boolean>(() => {
    if (designerContext?.templateId) {
      try {
        const t = loadProjectTemplates(designerContext.projectId)
          .find((t) => t.id === designerContext.templateId);
        return t?.isPublic ?? true;
      } catch { return true; }
    }
    return true;
  });

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    // Update undo/redo button states
    setCanUndo(canvasRef.current?.canUndo?.() ?? false);
    setCanRedo(canvasRef.current?.canRedo?.() ?? false);
  }, []);

  useEffect(() => {
    let mounted = true;

    apiFetchProjects()
      .then((data) => {
        if (!mounted || !Array.isArray(data)) return;
        const mapped: Project[] = data.map((p: any) => {
          const populatedClient = typeof p.clientId === "object" && p.clientId !== null ? p.clientId : null;
          const stage = String(p.stage || p.status || "draft");
          return {
            id: String(p._id || p.id),
            name: String(p.name || "Untitled Project"),
            client: String(p.client || populatedClient?.clientName || "Unknown Client"),
            clientId: String(populatedClient?._id || p.clientId || ""),
            stage,
            priority: (p.priority || "medium") as Project["priority"],
            dueDate: String(p.dueDate || ""),
            assignee: String(p.assignee || ""),
            amount: Number(p.amount || 0),
            description: String(p.description || ""),
            workflowType: (p.workflowType || "variable_data") as Project["workflowType"],
            createdAt: String(p.createdAt || new Date().toISOString()),
          };
        });

        setProjects(mapped);
        if (!designerContext?.projectId && mapped.length > 0) {
          setSaveProjectId((prev) => prev || mapped[0].id);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setProjects(loadProjects());
      });

    return () => {
      mounted = false;
    };
  }, [designerContext?.projectId]);

  // ── Canvas pixel dimensions ────────────────────────────────────────────────
  const canvasPxW  = mmToPx(config.canvas.width);
  const canvasPxH  = mmToPx(config.canvas.height);
  const MAX_W = 680; const MAX_H = 640;
  const fitScale       = Math.min(MAX_W / canvasPxW, MAX_H / canvasPxH, 1);
  const effectiveScale = fitScale * (userZoom / 100);
  const displayPxW     = Math.round(canvasPxW * effectiveScale);
  const displayPxH     = Math.round(canvasPxH * effectiveScale);
  const rulerScale     = (96 / 25.4) * effectiveScale;

  // ── Safe zone check ────────────────────────────────────────────────────────
  useEffect(() => {
    const fc = canvasRef.current?.getCanvas();
    if (!fc) return;
    const check = () => {
      const { margin, canvas } = config;
      const lPx = mmToPx(margin.left) * effectiveScale;
      const tPx = mmToPx(margin.top)  * effectiveScale;
      const rPx = mmToPx(canvas.width  - margin.right)  * effectiveScale;
      const bPx = mmToPx(canvas.height - margin.bottom) * effectiveScale;
      const violation = fc.getObjects()
        .filter((o) => !(o as any).excludeFromExport && !(o as any).isBgImage)
        .some((obj) => {
          const l = obj.left ?? 0; const t = obj.top ?? 0;
          return l < lPx || t < tPx ||
            l + obj.getScaledWidth()  > rPx ||
            t + obj.getScaledHeight() > bPx;
        });
      setSafeZoneWarn(violation);
    };
    fc.on("object:modified", check);
    fc.on("object:added",    check);
    fc.on("object:removed",  check);
    return () => {
      fc.off("object:modified", check);
      fc.off("object:added",    check);
      fc.off("object:removed",  check);
    };
  }, [config, effectiveScale, tick]);

  // ── Tool mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const fc = canvasRef.current?.getCanvas();
    if (!fc) return;
    if (activeTool === "hand") {
      fc.selection = false;
      fc.isDrawingMode = false;
      fc.defaultCursor = "grab";
      fc.hoverCursor   = "grab";
    } else if (activeTool === "draw") {
      fc.selection = false;
      fc.isDrawingMode = true;
      // Initialize brush with PencilBrush if not already set
      if (!fc.freeDrawingBrush) {
        fc.freeDrawingBrush = new fabric.PencilBrush(fc);
      }
      // Configure brush properties
      fc.freeDrawingBrush.color = "#000000";
      fc.freeDrawingBrush.width = 3;
      fc.defaultCursor = "crosshair";
    } else {
      fc.selection = true;
      fc.isDrawingMode = false;
      fc.defaultCursor = "default";
      fc.hoverCursor   = "move";
    }
    fc.renderAll();
  }, [activeTool, tick]);

  // ── Mouse-wheel / trackpad pinch zoom (Ctrl+scroll) ─────────────────────
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const STEP = 10;
      const delta = e.deltaY < 0 ? STEP : -STEP;
      setUserZoom((z) => Math.min(300, Math.max(25, Math.round((z + delta) / 5) * 5)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Pan on scroll container when hand tool is active ──────────────────────
  useEffect(() => {
    if (activeTool !== "hand" || !canvasScrollRef.current) return;
    const el = canvasScrollRef.current;
    let dragging = false; let lx = 0; let ly = 0;
    const down  = (e: MouseEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; el.style.cursor = "grabbing"; };
    const move  = (e: MouseEvent) => {
      if (!dragging) return;
      el.scrollLeft -= e.clientX - lx; el.scrollTop -= e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
    };
    const up = () => { dragging = false; el.style.cursor = "grab"; };
    el.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      el.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [activeTool]);

  // ── Tool click ─────────────────────────────────────────────────────────────
  const handleToolClick = useCallback((id: ToolId) => {
    switch (id) {
      case "text":
        canvasRef.current?.addText(); refresh();
        setActiveTool("select"); setShapesPopupOpen(false);
        break;
      case "image":
        imageInputRef.current?.click(); setShapesPopupOpen(false);
        break;
      case "qrcode":
        setQrDialogOpen(true); setShapesPopupOpen(false);
        break;
      case "barcode":
        setBarcodeDialogOpen(true); setShapesPopupOpen(false);
        break;
      case "shapes":
        setGalleryOpen(true);
        setActiveTool("select");
        break;
      case "zoom":
        setUserZoom((z) => Math.min(300, Math.round(z / 10) * 10 + 20));
        setShapesPopupOpen(false);
        break;
      default:
        setShapesPopupOpen(false);
        setActiveTool(id);
    }
  }, [refresh]);

  // ── Gallery item handler ───────────────────────────────────────────────────
  const handleGalleryItemSelect = useCallback((item: ShapeItem) => {
    if (item.type === "shape") {
      canvasRef.current?.addShapeFromGallery(item.id);
      refresh();
    } else if (item.type === "icon" && item.preview) {
      // For icons, add as SVG
      canvasRef.current?.addSVG(item.preview);
      refresh();
    }
    setActiveTool("select");
  }, [refresh]);

  // ── Page helpers ───────────────────────────────────────────────────────────
  const buildPagesSnapshot = useCallback(() => {
    const cur = canvasRef.current?.toJSON() ?? EMPTY_CANVAS_JSON;
    return pages.map((p) => p.id === activePageId ? { ...p, canvas: cur } : p);
  }, [activePageId, pages]);

  const normalizePages = useCallback((raw: unknown): DesignPage[] => {
    if (!Array.isArray(raw) || raw.length === 0)
      return [{ id: "page-1", name: "Page 1", canvas: EMPTY_CANVAS_JSON }];
    return raw.map((item, idx) => {
      const c = item as Partial<DesignPage>;
      return {
        id:     typeof c.id   === "string" && c.id   ? c.id   : `page-${idx + 1}`,
        name:   typeof c.name === "string" && c.name.trim() ? c.name : `Page ${idx + 1}`,
        canvas: c.canvas && typeof c.canvas === "object" ? c.canvas : EMPTY_CANVAS_JSON,
      };
    });
  }, []);

  const switchPage = useCallback((nextId: string) => {
    if (nextId === activePageId) return;
    const cur = canvasRef.current?.toJSON() ?? EMPTY_CANVAS_JSON;
    setPages((prev) => prev.map((p) => p.id === activePageId ? { ...p, canvas: cur } : p));
    setActivePageId(nextId); setSelected(null);
  }, [activePageId]);

  const activePageIdx = pages.findIndex((p) => p.id === activePageId);
  const canGoPrev = activePageIdx > 0;
  const canGoNext = activePageIdx < pages.length - 1;

  const addPage = useCallback(() => {
    const next = pageCounter + 1; const id = `page-${Date.now()}`;
    const cur  = canvasRef.current?.toJSON() ?? EMPTY_CANVAS_JSON;
    setPages((prev) => {
      const synced = prev.map((p) => p.id === activePageId ? { ...p, canvas: cur } : p);
      return [...synced, { id, name: `Page ${next}`, canvas: EMPTY_CANVAS_JSON }];
    });
    setPageCounter(next); setActivePageId(id); setSelected(null);
  }, [activePageId, pageCounter]);

  const removePage = useCallback((pageId: string) => {
    if (pages.length <= 1) { toast.error("At least one page is required"); return; }
    const cur    = canvasRef.current?.toJSON() ?? EMPTY_CANVAS_JSON;
    const synced = pages.map((p) => p.id === activePageId ? { ...p, canvas: cur } : p);
    const idx    = synced.findIndex((p) => p.id === pageId);
    const rest   = synced.filter((p) => p.id !== pageId);
    setPages(rest);
    if (pageId === activePageId) {
      setActivePageId(rest[Math.max(0, Math.min(idx, rest.length - 1))].id);
      setSelected(null);
    }
  }, [activePageId, pages]);

  const duplicatePage = useCallback((pageId: string) => {
    const cur = canvasRef.current?.toJSON() ?? EMPTY_CANVAS_JSON;
    setPages((prev) => {
      const synced = prev.map((p) => (p.id === activePageId ? { ...p, canvas: cur } : p));
      const idx = synced.findIndex((p) => p.id === pageId);
      if (idx < 0) return synced;
      const source = synced[idx];
      const id = `page-${Date.now()}`;
      const nextCounter = pageCounter + 1;
      const clone: DesignPage = {
        id,
        name: `${source.name} Copy`,
        canvas: source.canvas,
      };
      const next = [...synced.slice(0, idx + 1), clone, ...synced.slice(idx + 1)];
      setPageCounter(nextCounter);
      setActivePageId(id);
      setSelected(null);
      return next;
    });
  }, [activePageId, pageCounter]);

  const reorderPages = useCallback((dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === dragId);
      const to = prev.findIndex((p) => p.id === dropId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!designerContext?.templateId) return;
    const tmpl = loadProjectTemplates(designerContext.projectId)
      .find((t) => t.id === designerContext.templateId);
    if (!tmpl?.canvasJSON) return;
    const timer = setTimeout(() => {
      try {
        const parsed = JSON.parse(tmpl.canvasJSON!);
        if (parsed?.config) setConfig(parsed.config as TemplateConfig);
        if (Array.isArray(parsed?.pages)) {
          const loaded = normalizePages(parsed.pages);
          const nextActive = loaded.some((p) => p.id === parsed.activePageId)
            ? parsed.activePageId : loaded[0].id;
          setPages(loaded); setPageCounter(Math.max(loaded.length, 1)); setActivePageId(nextActive);
          setPageLoadNonce((n) => n + 1);
        } else if (parsed?.canvas) {
          setPages([{ id: "page-1", name: "Page 1", canvas: parsed.canvas }]);
          setActivePageId("page-1"); setPageCounter(1);
          setPageLoadNonce((n) => n + 1);
        }
        refresh();
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { localStorage.setItem(DESIGNER_SAVE_KEY, JSON.stringify(config)); }, [config]);

  useEffect(() => {
    const activePage = pages.find((p) => p.id === activePageId);
    if (!activePage) return;
    const t = setTimeout(() => {
      canvasRef.current?.loadFromJSON(activePage.canvas ?? EMPTY_CANVAS_JSON);
      canvasRef.current?.resetHistory();
      setSelected(null); refresh();
    }, 80);
    return () => clearTimeout(t);
  }, [activePageId, pageLoadNonce, refresh]);

  useEffect(() => {
    const fc = canvasRef.current?.getCanvas();
    if (!fc) return;

    let rafId = 0;
    const syncActive = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const json = canvasRef.current?.toJSON() ?? EMPTY_CANVAS_JSON;
        const hash = JSON.stringify(json);
        if (hash !== activeCanvasHashRef.current) {
          activeCanvasHashRef.current = hash;
          setPages((prev) => prev.map((p) => (p.id === activePageId ? { ...p, canvas: json } : p)));
        }

        try {
          const dataUrl = fc.toDataURL({
            format: "png",
            multiplier: 0.22,
            enableRetinaScaling: false,
          });
          setActiveLiveThumb(dataUrl);
        } catch {
          // Ignore transient canvas serialization errors while drawing.
        }
      });
    };

    const events = [
      "object:added",
      "object:removed",
      "object:modified",
      "path:created",
      "text:changed",
    ] as const;
    events.forEach((eventName) => fc.on(eventName, syncActive));
    syncActive();

    return () => {
      events.forEach((eventName) => fc.off(eventName, syncActive));
      cancelAnimationFrame(rafId);
    };
  }, [activePageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        canvasRef.current?.deleteSelected(); setSelected(null); refresh();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); canvasRef.current?.undo(); refresh(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault(); canvasRef.current?.redo(); refresh();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); canvasRef.current?.duplicate(); refresh(); }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") { setActiveTool("select"); setShapesPopupOpen(false); }
        if (e.key === "h" || e.key === "H") { setActiveTool("hand");   setShapesPopupOpen(false); }
        if (e.key === "t" || e.key === "T") handleToolClick("text");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh, handleToolClick]);

  const updateConfig = useCallback((partial: Partial<TemplateConfig>) =>
    setConfig((prev) => ({ ...prev, ...partial })), []);

  // ── Image upload ────────────────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { canvasRef.current?.addImage(ev.target?.result as string); refresh(); };
    reader.readAsDataURL(file); e.target.value = ""; setActiveTool("select");
  };

  // ── SVG upload ──────────────────────────────────────────────────────────────
  const handleSVGUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      canvasRef.current?.addSVG(ev.target?.result as string);
      refresh();
      toast.success("SVG added to canvas");
    };
    reader.readAsText(file); e.target.value = ""; setActiveTool("select");
  };

  // ── Save/export ─────────────────────────────────────────────────────────────
  const handleSaveClick = () => {
    if (importMode) {
      setSaveTemplateName((config.templateName || "Template") + " Copy");
      setSaveProjectId((prev) => prev || projects[0]?.id || "");
      setSaveDialogOpen(true);
      return;
    }

    if (designerContext) {
      saveToProject(designerContext.projectId, designerContext.templateId, config.templateName);
    } else {
      setSaveTemplateName(config.templateName || "");
      setSaveProjectId(projects.length > 0 ? projects[0].id : "");
      setSaveDialogOpen(true);
    }
  };

  const saveToProject = (projectId: string, existingId: string | null, tName: string) => {
    if (!projectId) { toast.error("Please select a project"); return; }
    const name    = tName.trim() || config.templateName || "Untitled Template";
    const snap    = buildPagesSnapshot();
    const canJSON = JSON.stringify({ config, pages: snap, activePageId,
      canvas: snap.find((p) => p.id === activePageId)?.canvas ?? EMPTY_CANVAS_JSON });
    const thumb   = canvasRef.current?.toPNG() ?? undefined;
    setIsSaving(true);
    try {
      const hasExisting = Boolean(existingId) && loadProjectTemplates(projectId).some((t) => t.id === existingId);
      if (existingId && hasExisting) {
        updateProjectTemplate(existingId, {
          templateName: name, templateType: config.templateType,
          canvas: config.canvas, margin: config.margin,
          canvasJSON: canJSON, thumbnail: thumb, isPublic: saveIsPublic,
        });
        toast.success(`Template "${name}" updated`);
      } else {
        const proj = projects.find((p) => p.id === projectId);
        addProjectTemplate({
          projectId, templateName: name, templateType: config.templateType,
          canvas: config.canvas, margin: config.margin, applicableFor: proj?.name ?? "",
          canvasJSON: canJSON, thumbnail: thumb, isPublic: saveIsPublic,
        });
        const saved = loadProjectTemplates(projectId).at(-1);
        if (saved) {
          const ctx: DesignerContext = {
            projectId, templateId: saved.id,
            projectName: proj?.name, templateName: name,
          };
          localStorage.setItem(DESIGNER_CONTEXT_KEY, JSON.stringify(ctx));
        }
        toast.success(`Template "${name}" saved`);
      }
      localStorage.removeItem(DESIGNER_IMPORT_MODE_KEY);
      setImportMode(false);
      setSaveDialogOpen(false);
    } finally { setIsSaving(false); }
  };

  const exportPNG = () => {
    const url = canvasRef.current?.toPNG(); if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = `${config.templateName || "template"}.png`; a.click();
    toast.success("PNG exported");
  };
  const exportJPG = () => {
    const url = canvasRef.current?.toJPG(); if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = `${config.templateName || "template"}.jpg`; a.click();
    toast.success("JPG exported");
  };
  const exportPDF = () => {
    const url = canvasRef.current?.toPNG(); if (!url) return;
    const w = config.canvas.width * 2.8346; const h = config.canvas.height * 2.8346;
    const doc = new jsPDF({ orientation: w > h ? "l" : "p", unit: "pt", format: [w, h] });
    doc.addImage(url, "PNG", 0, 0, w, h);
    doc.save(`${config.templateName || "template"}.pdf`);
    toast.success("PDF exported");
  };
  const exportJSON = () => {
    const snap = buildPagesSnapshot();
    const blob = new Blob([JSON.stringify({
      config, pages: snap, activePageId,
      canvas: snap.find((p) => p.id === activePageId)?.canvas ?? EMPTY_CANVAS_JSON,
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${config.templateName || "template"}.json`; a.click();
    URL.revokeObjectURL(url); toast.success("JSON downloaded");
  };

  const loadTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.config) setConfig(parsed.config);
        if (Array.isArray(parsed.pages)) {
          const loaded = normalizePages(parsed.pages);
          const nextActive = loaded.some((p) => p.id === parsed.activePageId)
            ? parsed.activePageId : loaded[0].id;
          setPages(loaded); setPageCounter(Math.max(loaded.length, 1)); setActivePageId(nextActive);
          setPageLoadNonce((n) => n + 1);
        } else if (parsed.canvas) {
          setPages([{ id: "page-1", name: "Page 1", canvas: parsed.canvas }]);
          setActivePageId("page-1"); setPageCounter(1);
          setPageLoadNonce((n) => n + 1);
        }
        refresh(); toast.success("Template loaded");
      } catch { toast.error("Invalid template file"); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const handlePreview = () => {
    const url = canvasRef.current?.toPNG();
    if (url) { setPreviewUrl(url); setPreviewOpen(true); }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const sizeLabel = (() => {
    const p = PAGE_PRESETS.find((p) =>
      p.id !== "custom" && p.width === config.canvas.width && p.height === config.canvas.height
    );
    return p ? p.label : `${config.canvas.width}×${config.canvas.height}mm`;
  })();

  // Auto-switch to properties tab when an element is selected
  useEffect(() => {
    if (!selected) return;
    if (selected.type === "image") {
      setRightTab("mask");
      return;
    }
    setRightTab("properties");
  }, [selected]);

  // Auto-switch when layers / background / alignment tool is activated from left bar
  useEffect(() => {
    if (activeTool === "layers")     setRightTab("layers");
    if (activeTool === "background") setRightTab("background");
    if (activeTool === "alignment")  setRightTab("alignment");
  }, [activeTool]);

  const TOOLS: { id: ToolId; icon: React.ElementType; label: string; sep?: boolean }[] = [
    { id: "select",     icon: MousePointer2, label: "Select / Pointer (V)" },
    { id: "zoom",       icon: ZoomIn,        label: "Zoom In (+20%)" },
    { id: "hand",       icon: Hand,          label: "Hand / Pan Canvas (H)", sep: true },
    { id: "background", icon: Palette,       label: "Background" },
    { id: "layers",     icon: Layers,        label: "Layers", sep: true },
    { id: "shapes",     icon: Square,        label: "Shapes (Rect, Circle…)" },
    { id: "text",       icon: Type,          label: "Text Tool (T)" },
    { id: "image",      icon: ImagePlus,     label: "Image Upload" },
    { id: "draw",       icon: Pen,           label: "Pen / Freehand Draw", sep: true },
    { id: "qrcode",     icon: QrCode,        label: "QR Code" },
    { id: "barcode",    icon: Barcode,       label: "Barcode" },
    { id: "alignment",  icon: Grid3x3,       label: "Alignment / Grid" },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-h-[620px] bg-background overflow-hidden">

      {/* ══════ TOP ACTION BAR ══════ */}
      <header className="flex items-center gap-2 px-3 h-12 border-b bg-card shrink-0 z-30">

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => navigate("/projects")}
          title="Back to Projects"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 mr-1 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Pen className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-xs font-bold hidden sm:block">Design Studio</span>
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* Editable project name */}
        <div className="flex items-center gap-1 min-w-0">
          {isEditingName ? (
            <Input
              value={config.templateName}
              autoFocus
              onChange={(e) => updateConfig({ templateName: e.target.value })}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
              className="h-7 text-sm font-medium w-44"
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors group"
            >
              <span className="text-sm font-medium truncate max-w-[150px]">
                {config.templateName || "Untitled Design"}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Product size selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0">
              <span className="truncate max-w-[130px]">{sizeLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {PAGE_PRESETS.filter((p) => p.id !== "custom").map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => updateConfig({ canvas: { width: preset.width, height: preset.height } })}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const w = parseFloat(window.prompt("Width (mm):", String(config.canvas.width)) ?? "");
                const h = parseFloat(window.prompt("Height (mm):", String(config.canvas.height)) ?? "");
                if (w > 0 && h > 0) updateConfig({ canvas: { width: w, height: h } });
              }}
            >
              Custom size…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <Button
          variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => {
            setPages([{ id: "page-1", name: "Page 1", canvas: EMPTY_CANVAS_JSON }]);
            setActivePageId("page-1"); setPageCounter(1);
            setPageLoadNonce((n) => n + 1);
            setConfig(DEFAULT_CONFIG); setSelected(null); refresh();
            toast.success("New design created");
          }}
        >
          <Plus className="h-3.5 w-3.5" /> New
        </Button>

        <Button
          variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => loadTplInputRef.current?.click()}
        >
          <FolderOpen className="h-3.5 w-3.5" /> Open
        </Button>
        <input ref={loadTplInputRef} type="file" accept=".json" className="hidden" onChange={loadTemplate} />

        <Button variant="default" size="sm" className="h-7 gap-1 text-xs" onClick={handleSaveClick}>
          <Save className="h-3.5 w-3.5" />
          {designerContext ? "Save" : "Save to Project"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700">
              <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportPNG}><FileImage className="h-4 w-4 mr-2" /> Export PNG</DropdownMenuItem>
            <DropdownMenuItem onClick={exportJPG}><FileImage className="h-4 w-4 mr-2" /> Export JPG</DropdownMenuItem>
            <DropdownMenuItem onClick={exportPDF}><Download className="h-4 w-4 mr-2" /> Export PDF</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportJSON}><FolderOpen className="h-4 w-4 mr-2" /> Download JSON</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-1.5 shrink-0">
          <Globe className={`h-3.5 w-3.5 ${saveIsPublic ? "text-primary" : "text-muted-foreground"}`} />
          <Switch checked={saveIsPublic} onCheckedChange={setSaveIsPublic} className="scale-75" />
          <span className="text-xs text-muted-foreground hidden lg:block">
            {saveIsPublic ? "Public" : "Private"}
          </span>
        </div>

        <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-xs text-primary-foreground font-bold shrink-0">
          S
        </div>
      </header>

      {/* Context toolbar */}
      <ContextToolbar
        selected={selected}
        canvasRef={canvasRef}
        onRefresh={refresh}
        onDelete={() => { canvasRef.current?.deleteSelected(); setSelected(null); refresh(); }}
      />

      {/* ══════ BODY ══════ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ══════ LEFT TOOLBAR ══════ */}
        <aside className="w-14 border-r bg-card flex flex-col items-center py-2 gap-0.5 shrink-0 z-20 relative overflow-visible">

          {shapesPopupOpen && (
            <div className="absolute left-14 top-0 z-50 bg-popover border rounded-xl shadow-2xl p-2 w-44">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
                Shapes
              </p>
              <div className="grid grid-cols-2 gap-1">
                {([
                  { label: "Rectangle", Icon: Square,      action: () => { canvasRef.current?.addRect();   refresh(); } },
                  { label: "Circle",    Icon: CircleIcon,  action: () => { canvasRef.current?.addCircle(); refresh(); } },
                  { label: "Triangle",  Icon: Triangle,    action: () => { canvasRef.current?.addTriangle(); refresh(); } },
                  { label: "Line",      Icon: Minus,       action: () => { canvasRef.current?.addLine();   refresh(); } },
                  { label: "SVG",       Icon: FileImage,   action: () => { svgInputRef.current?.click(); } },
                ] as { label: string; Icon: React.ElementType; action: () => void }[]).map(({ label, Icon, action }) => (
                  <button
                    key={label}
                    onClick={() => { action(); setShapesPopupOpen(false); setActiveTool("select"); }}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-accent text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Icon style={{ width: 20, height: 20 }} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {TOOLS.map(({ id, icon, label, sep }) => (
            <div key={id} className="flex flex-col items-center w-full">
              <ToolBtn id={id} icon={icon} label={label} activeTool={activeTool} onClick={handleToolClick} />
              {sep && <div className="w-7 h-px bg-border my-1" />}
            </div>
          ))}
        </aside>

        {/* ══════ CENTER CANVAS AREA ══════ */}
        <main
          ref={canvasScrollRef}
          className={`min-w-0 flex-1 overflow-auto bg-muted/40 flex flex-col ${activeTool === "hand" ? "cursor-grab" : ""}`}
          onClick={() => shapesPopupOpen && setShapesPopupOpen(false)}
        >
          <div className="shrink-0 px-4 pt-3 pb-1 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={showMargins}
                  onChange={(e) => setShowMargins(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary" />
                <span className="text-xs text-muted-foreground">Show Guides</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={showTopLabel}
                  onChange={(e) => setShowTopLabel(e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary" />
                <span className="text-xs text-muted-foreground">Show "TOP" Indicator</span>
              </label>
            </div>

            {safeZoneWarn && (
              <div className="flex items-center gap-2 bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium shadow-lg">
                <span className="font-bold">WARNING:</span>
                Keep elements in the safe zone for best print results.
              </div>
            )}

            <div className="text-xs text-muted-foreground font-mono shrink-0">
              {config.canvas.width}×{config.canvas.height}mm &nbsp;|&nbsp; {userZoom}%
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-8">
            <div style={{ display: "inline-block", position: "relative" }} className="group">

              {showTopLabel && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none"
                  style={{ top: RULER_THICKNESS - 20 }}
                >
                  <span className="text-muted-foreground text-[11px] font-mono tracking-widest">^TOP^</span>
                </div>
              )}

              <div style={{ display: "flex" }}>
                <div
                  style={{ width: RULER_THICKNESS, height: RULER_THICKNESS, flexShrink: 0 }}
                  className="bg-muted border-b border-r border-border"
                />
                <HRuler canvasPxW={displayPxW} canvasMmW={config.canvas.width} scale={rulerScale} />
              </div>

              <div style={{ display: "flex" }}>
                <VRuler canvasPxH={displayPxH} canvasMmH={config.canvas.height} scale={rulerScale} />
                <FabricCanvas
                  ref={canvasRef}
                  config={config}
                  showMargins={showMargins}
                  displayScale={effectiveScale}
                  onBgChange={(bg) => setCurrentBg(bg || "none")}
                  onSelectionChange={(obj) => { setSelected(obj); refresh(); }}
                />
              </div>
            </div>
          </div>
        </main>

        {/* ══════ RIGHT PROPERTIES PANEL ══════ */}
        <aside className="w-[300px] min-w-[300px] max-w-[300px] border-l bg-card flex flex-col shrink-0 overflow-hidden">
          <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as typeof rightTab)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <TabsList className="grid grid-cols-4 m-2 mb-0 shrink-0 h-8">
              <TabsTrigger value="background" className="text-[10px] gap-0.5 px-1">
                <Palette className="h-3 w-3" /> BG
              </TabsTrigger>
              <TabsTrigger value="properties" className="text-[10px] gap-0.5 px-1">
                <SlidersHorizontal className="h-3 w-3" /> Props
              </TabsTrigger>
              <TabsTrigger value="mask" className="text-[10px] gap-0.5 px-1">
                <Square className="h-3 w-3" /> Mask
              </TabsTrigger>
              <TabsTrigger value="layers" className="text-[10px] gap-0.5 px-1">
                <Layers className="h-3 w-3" /> Layers
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 min-h-0">
              <TabsContent value="background" className="mt-2 p-0">
                <BackgroundPanel
                  currentBg={currentBg}
                  onSetColor={(color) => { setCurrentBg(color); canvasRef.current?.setBackgroundColor(color); }}
                  onSetImage={(dataUrl, fitMode) => { 
                    setCurrentBg("image"); 
                    canvasRef.current?.setBackgroundImage(dataUrl, fitMode); 
                  }}
                  onSetSVG={(svgString, fitMode) => { 
                    setCurrentBg("svg"); 
                    canvasRef.current?.setBackgroundSVG(svgString, fitMode); 
                  }}
                  onSetBackgroundFitMode={(fitMode) => {
                    canvasRef.current?.setBackgroundFitMode(fitMode);
                  }}
                  onMoveBackground={(offsetX, offsetY) => {
                    canvasRef.current?.moveBackground(offsetX, offsetY);
                  }}
                  onResetBackgroundPosition={() => {
                    canvasRef.current?.resetBackgroundPosition();
                  }}
                  onClearBackground={() => { setCurrentBg("none"); canvasRef.current?.clearBackground(); }}
                />
              </TabsContent>

              <TabsContent value="properties" className="mt-2 p-0">
                {selected ? (
                  <PropertiesPanel
                    selected={selected}
                    canvasRef={canvasRef}
                    onRefresh={refresh}
                    displayScale={effectiveScale}
                    customFonts={customFonts}
                    onAddCustomFont={(font) => setCustomFonts((prev) => [
                      ...prev.filter((f) => f.name !== font.name), font
                    ])}
                  />
                ) : (
                  <div className="p-5 text-center">
                    <MousePointer2 className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Select an element to edit position, size, rotation, opacity, borders, and more.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="mask" className="mt-2 p-0">
                <MaskPanel
                  selected={selected}
                  canvasRef={canvasRef}
                  onRefresh={refresh}
                />
              </TabsContent>

              <TabsContent value="layers" className="mt-2 p-0">
                <LayersList canvasRef={canvasRef} onRefresh={refresh} />
              </TabsContent>

              <TabsContent value="alignment" className="mt-2 p-0">
                <AlignmentTools canvasRef={canvasRef} onRefresh={refresh} />
              </TabsContent>
            </ScrollArea>
          </Tabs>

          {/* Pages manager at bottom of right panel */}
          <div className="border-t p-2 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</span>
                <span className="text-[10px] text-muted-foreground/70">({pages.length})</span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  variant={pageViewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-6 w-6"
                  title="Grid view"
                  onClick={() => setPageViewMode("grid")}
                >
                  <LayoutGrid className="h-3 w-3" />
                </Button>
                <Button
                  variant={pageViewMode === "strip" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-6 w-6"
                  title="Strip view"
                  onClick={() => setPageViewMode("strip")}
                >
                  <Rows3 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title="Collapse previews"
                  onClick={() => setPagePanelCollapsed((v) => !v)}
                >
                  {pagePanelCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Add page" onClick={addPage}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {!pagePanelCollapsed && (
              <>
                <div className="mb-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Thumb</span>
                    <Slider
                      value={[thumbZoom]}
                      min={70}
                      max={140}
                      step={5}
                      onValueChange={([v]) => setThumbZoom(v)}
                      className="flex-1"
                    />
                  </div>
                </div>

                {pageViewMode === "grid" ? (
                  <div className="h-56 overflow-y-auto overscroll-contain pr-1">
                    <div className="grid grid-cols-2 gap-1.5">
                      {pages.map((page, index) => (
                        <PagePreviewItem
                          key={page.id}
                          page={page}
                          index={index}
                          isActive={page.id === activePageId}
                          activeLiveThumb={activeLiveThumb}
                          thumbZoom={thumbZoom}
                          sourceCanvasWidth={displayPxW}
                          sourceCanvasHeight={displayPxH}
                          onOpen={() => switchPage(page.id)}
                          onDuplicate={() => duplicatePage(page.id)}
                          onDelete={() => pages.length > 1 && removePage(page.id)}
                          onDragStart={() => setDragPageId(page.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (dragPageId) reorderPages(dragPageId, page.id);
                            setDragPageId(null);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-56 w-full overflow-y-auto overscroll-contain pr-1 scroll-smooth">
                    <div className="flex flex-col gap-1.5 pb-1">
                      {pages.map((page, index) => (
                        <PagePreviewItem
                          key={page.id}
                          page={page}
                          index={index}
                          isActive={page.id === activePageId}
                          activeLiveThumb={activeLiveThumb}
                          thumbZoom={thumbZoom}
                          sourceCanvasWidth={displayPxW}
                          sourceCanvasHeight={displayPxH}
                          onOpen={() => switchPage(page.id)}
                          onDuplicate={() => duplicatePage(page.id)}
                          onDelete={() => pages.length > 1 && removePage(page.id)}
                          onDragStart={() => setDragPageId(page.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (dragPageId) reorderPages(dragPageId, page.id);
                            setDragPageId(null);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ══════ BOTTOM CONTROL BAR ══════ */}
      <footer className="flex items-center gap-1.5 px-3 h-11 border-t bg-card shrink-0 z-20">

        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                disabled={!canUndo}
                onClick={() => { canvasRef.current?.undo(); refresh(); }}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                disabled={!canRedo}
                onClick={() => { canvasRef.current?.redo(); refresh(); }}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Redo (Ctrl+Y / Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-5" />

        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => { canvasRef.current?.duplicate(); refresh(); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Duplicate (Ctrl+D)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => { canvasRef.current?.deleteSelected(); setSelected(null); refresh(); }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Delete (Del)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canGoPrev}
            onClick={() => canGoPrev && switchPage(pages[activePageIdx - 1].id)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium w-12 text-center tabular-nums">
            {activePageIdx + 1} / {pages.length}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canGoNext}
            onClick={() => canGoNext && switchPage(pages[activePageIdx + 1].id)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Add page" onClick={addPage}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setUserZoom((z) => Math.max(25, z - 20))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Slider
            value={[userZoom]} min={25} max={300} step={5}
            onValueChange={([v]) => setUserZoom(v)}
            className="w-24"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setUserZoom((z) => Math.min(300, z + 20))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <button
            onClick={() => setUserZoom(100)}
            className="text-xs text-muted-foreground hover:text-foreground w-12 text-center font-mono transition-colors"
          >
            {userZoom}%
          </button>
        </div>

        <div className="flex-1" />

        <Button className="h-8 gap-1.5 text-xs" onClick={handlePreview}>
          <Eye className="h-3.5 w-3.5" /> Preview
        </Button>
      </footer>

      {/* ══════ HIDDEN FILE INPUTS ══════ */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      <input ref={svgInputRef}   type="file" accept=".svg,image/svg+xml" className="hidden" onChange={handleSVGUpload} />

      {/* ══════ QR CODE DIALOG ══════ */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4" /> Add QR Code
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="qr-url" className="text-xs">URL or Text</Label>
              <Input
                id="qr-url" value={qrText}
                onChange={(e) => setQrText(e.target.value)}
                placeholder="https://example.com" className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    canvasRef.current?.addQRCode(qrText); refresh();
                    setQrDialogOpen(false); setActiveTool("select");
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setQrDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              canvasRef.current?.addQRCode(qrText); refresh();
              setQrDialogOpen(false); setActiveTool("select");
            }}>
              Add QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={barcodeDialogOpen} onOpenChange={setBarcodeDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Barcode className="h-4 w-4" /> Add Barcode
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="barcode-text" className="text-xs">Barcode Text</Label>
              <Input
                id="barcode-text" value={barcodeText}
                onChange={(e) => setBarcodeText(e.target.value)}
                placeholder="1234567890" className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    canvasRef.current?.addBarcode(barcodeText); refresh();
                    setBarcodeDialogOpen(false); setActiveTool("select");
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBarcodeDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => {
              canvasRef.current?.addBarcode(barcodeText); refresh();
              setBarcodeDialogOpen(false); setActiveTool("select");
            }}>
              Add Barcode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ PREVIEW DIALOG ══════ */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[90vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Preview — {config.templateName || "Design"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4 min-h-[200px]">
            {previewUrl && (
              <img
                src={previewUrl} alt="Design Preview"
                className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-xl"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>Close</Button>
            <Button size="sm" onClick={exportPNG}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ SAVE TO PROJECT DIALOG ══════ */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Save Template to Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project</Label>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects found. Create a project first.</p>
              ) : (
                <Select value={saveProjectId} onValueChange={setSaveProjectId}>
                  <SelectTrigger><SelectValue placeholder="Select a project…" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                placeholder="My Design Template" className="h-8"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={saveIsPublic} onCheckedChange={setSaveIsPublic} id="save-pub" />
              <Label htmlFor="save-pub" className="cursor-pointer text-sm">
                {saveIsPublic ? "Public — visible to all users" : "Private — only you can see this"}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button
              onClick={() => saveToProject(saveProjectId, null, saveTemplateName)}
              disabled={isSaving || !saveProjectId}
            >
              {isSaving ? "Saving…" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ SHAPES GALLERY MODAL ══════ */}
      <ShapesGallery
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSelectItem={handleGalleryItemSelect}
        onDragStart={(item, e) => {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData("application/json", JSON.stringify(item));
        }}
      />
    </div>
  );
}
