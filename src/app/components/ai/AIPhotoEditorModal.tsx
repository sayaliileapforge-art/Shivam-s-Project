/**
 * AI Photo Studio Editor
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen dark-mode photo editor matching the v7.4 Colab reference UI.
 *
 * Layout: Left (preview + before/after) + Right (scrollable control panel)
 *
 * Sections:
 *   • 5 Precision Sliders  (Enhance / Exposure / Color Temp / Sharpness / Skin)
 *   • Composition          (Padding / Headroom / Crop Mode)
 *   • Background           (Color / Shadow / Gradient / Glow / Shadow Soft/Dist)
 *   • Output               (Format / JPEG Quality / Watermark / checkboxes)
 *   • Action Buttons       (Download / Before/After / Compliance / Batch / Reset)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Upload, RefreshCw, Download, Layers, ShieldCheck,
  Loader2, CheckCircle2, AlertCircle, Sliders, Zap, ChevronDown,
  SwitchCamera,
} from "lucide-react";
import type { ProjectDataRecord } from "../../../lib/projectStore";
import {
  photoEditorUpload,
  photoEditorRender,
  photoEditorBatch,
  type PhotoEditorSettings,
} from "../../../lib/aiImageService";
import { API_BASE, uploadImages } from "../../../lib/apiService";
import { toast } from "sonner";

// Derive the Express backend origin (strips "/api" suffix if present)
const BACKEND_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface AIPhotoEditorProps {
  open: boolean;
  onClose: () => void;
  records: ProjectDataRecord[];
  getPhotoSrc: (rec: ProjectDataRecord) => string;
  onApply: (updates: Array<{ id: string; photo: string }>) => void;
}

const DEFAULT_SETTINGS: PhotoEditorSettings = {
  enhance: 3.0,        // reduced from 5.0 — less compound over-processing
  exposure: 0.0,
  colorTemp: 0.0,
  sharpness: 4.0,      // reduced from 5.0
  skin: 2.5,           // reduced from 5.0 — prevents plastic skin look
  colorGrade: "natural",
  cropMode: "manual",
  padding: 4.5,
  headroom: 0.20,
  bgColor: "#FFFFFF",
  shadowColor: "#222222",
  gradient: "None",
  glow: 8,             // reduced from 40 — was bleeding into subject
  shadowSoft: 12,      // reduced from 51 — was creating 103px kernel dark halo
  shadowDist: 6,       // reduced from 15
  format: "1024×1024 (Standard)",
  jpegQuality: 88,     // increased from 82 — better output quality
  watermark: "",
  balanceSkin: true,
  cleanHair: true,
  gfpgan: false,
};

const GRADIENT_OPTIONS = [
  "None", "🌫 Studio Grey", "🌊 Studio Blue", "🌿 Mint",
  "🌸 Rose", "☀️ Warm Gold", "🌙 Night", "🪵 Ivory",
];

const FORMAT_OPTIONS = [
  "1024×1024 (Standard)", "Passport 35×45mm", "Visa 51×51mm",
  "US Passport 2×2in", "Web 800×800",
];

/** Quality presets — mirror QUALITY_PRESETS in photo_editor.py */
const QUALITY_PRESETS: Record<string, Partial<PhotoEditorSettings>> = {
  Natural:  { enhance: 3.0, sharpness: 4.0, skin: 2.5,  colorGrade: "natural", glow: 8,  shadowSoft: 12, shadowDist: 6  },
  Studio:   { enhance: 5.5, sharpness: 5.5, skin: 4.5,  colorGrade: "natural", glow: 18, shadowSoft: 20, shadowDist: 10 },
  Soft:     { enhance: 4.0, sharpness: 3.0, skin: 5.5,  colorGrade: "soft",    glow: 12, shadowSoft: 15, shadowDist: 8  },
  Passport: { enhance: 2.5, sharpness: 5.0, skin: 1.5,  colorGrade: "natural", glow: 0,  shadowSoft: 0,  shadowDist: 0  },
  "ID Card":{ enhance: 2.0, sharpness: 4.5, skin: 1.0,  colorGrade: "natural", glow: 0,  shadowSoft: 0,  shadowDist: 0  },
};

// ── Slider component ──────────────────────────────────────────────────────────

interface SliderRowProps {
  emoji: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  tags?: string[];
  tagLine?: string;
  color?: string;
  onChange: (v: number) => void;
}

function SliderRow({ emoji, label, value, min, max, step = 0.1, tags, tagLine, color = "#818cf8", onChange }: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-[13px] font-medium text-gray-200 w-24 truncate">{label}</span>
        <div className="flex-1 relative h-[5px] rounded-full bg-[#2a2a2a] cursor-pointer group mx-2"
          style={{ minWidth: 0 }}>
          <input
            type="range"
            min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          {/* Track fill */}
          <div
            className="h-full rounded-full transition-all pointer-events-none"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
          />
          {/* Thumb indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[13px] h-[13px] rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
            style={{ left: `calc(${pct}% - 6px)`, background: color, boxShadow: `0 0 6px ${color}88` }}
          />
        </div>
        <span className="text-[13px] font-mono text-gray-300 w-10 text-right tabular-nums">
          {value.toFixed(2)}
        </span>
      </div>
      {tagLine && (
        <p className="text-[10px] text-gray-500 ml-7 mt-0.5 leading-tight">{tagLine}</p>
      )}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-7 mt-1">
          {tags.map((t) => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e1e] text-gray-400 border border-[#2a2a2a]">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Int slider (whole number) ─────────────────────────────────────────────────

interface IntSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  color?: string;
  onChange: (v: number) => void;
}

function IntSliderRow({ label, value, min, max, step = 1, hint, color = "#64748b", onChange }: IntSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-gray-400 w-20 shrink-0">{label}</span>
        <div className="flex-1 relative h-[4px] rounded-full bg-[#2a2a2a] mx-2">
          <input
            type="range"
            min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[11px] h-[11px] rounded-full border-2 border-white shadow pointer-events-none"
            style={{ left: `calc(${pct}% - 5px)`, background: color }}
          />
        </div>
        <span className="text-[12px] font-mono text-gray-300 w-8 text-right tabular-nums">{value}</span>
      </div>
      {hint && <p className="text-[9px] text-gray-500 ml-22 mt-0.5 ml-[88px]">{hint}</p>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ children, color = "#3b82f6" }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-[11px] font-semibold tracking-wider uppercase" style={{ color }}>
        {children}
      </span>
      <div className="flex-1 h-px bg-[#2a2a2a]" />
    </div>
  );
}

// ── Styled select ─────────────────────────────────────────────────────────────

function DarkSelect({ value, onChange, options, className = "" }: {
  value: string; onChange: (v: string) => void; options: string[]; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-[#1e1e1e] border border-[#333] text-gray-200 text-[12px] rounded px-2 py-1.5 pr-6 focus:outline-none focus:border-[#4f4f4f] cursor-pointer"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={12} />
    </div>
  );
}

// ── Color input row ───────────────────────────────────────────────────────────

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[12px] text-gray-400 w-24 shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-[12px] text-gray-200 font-mono focus:outline-none focus:border-[#555]"
      />
      <input
        type="color"
        value={value.startsWith("#") && value.length === 7 ? value : "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border border-[#444] bg-transparent p-0.5"
      />
    </div>
  );
}

// ── Checkbox row ──────────────────────────────────────────────────────────────

function CheckRow({ checked, onChange, children }: {
  checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
          checked ? "bg-violet-600 border-violet-500" : "bg-[#1e1e1e] border-[#444]"
        }`}
        onClick={() => onChange(!checked)}
      >
        {checked && <CheckCircle2 size={11} className="text-white" />}
      </div>
      <span className="text-[12px] text-gray-300 select-none">{children}</span>
    </label>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIPhotoEditorModal({ open, onClose, records, getPhotoSrc, onApply }: AIPhotoEditorProps) {
  const [settings, setSettings] = useState<PhotoEditorSettings>({ ...DEFAULT_SETTINGS });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [originalImg, setOriginalImg] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [phase1Loading, setPhase1Loading] = useState(false);
  const [renderLoading, setRenderLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [selectedRecordIdx, setSelectedRecordIdx] = useState(0);
  const [batchResults, setBatchResults] = useState<Array<{ id: string; photo: string }>>([]);
  const [batchDone, setBatchDone] = useState(false);
  const [batchFailedCount, setBatchFailedCount] = useState(0);
  const [batchUploading, setBatchUploading] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("Natural");

  const renderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recordsWithPhoto = records.filter((r) => Boolean(getPhotoSrc(r)));

  // ── Upload current record to Phase 1 ─────────────────────────────────────

  const uploadForEditing = useCallback(async (rec: ProjectDataRecord) => {
    const src = getPhotoSrc(rec);
    if (!src) { setError("No photo available for this record."); return; }

    setPhase1Loading(true);
    setError("");
    setPreviewImg(null);
    setSessionId(null);
    setOriginalImg(src);
    setBatchDone(false);

    try {
      // For data: and blob: URLs we convert client-side.
      // For all other URLs (relative /uploads/... or absolute https://...) we pass the URL
      // to the Python service so it fetches the image server-side — this avoids CORS.
      let file: File | null = null;
      let imageUrl: string | undefined;

      if (src.startsWith("data:")) {
        const [header, b64] = src.split(",");
        const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
        const bytes = atob(b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        file = new File([arr], `photo_${rec.id}.jpg`, { type: mime });
      } else if (src.startsWith("blob:")) {
        const res = await fetch(src);
        const blob = await res.blob();
        file = new File([blob], `photo_${rec.id}.jpg`, { type: blob.type || "image/jpeg" });
      } else {
        // Relative path → make absolute so Python can fetch it from the Express backend
        imageUrl = src.startsWith("/") ? `${BACKEND_ORIGIN}${src}` : src;
      }

      const result = await photoEditorUpload(file, {
        imageUrl,
        mode: settings.cropMode,
        padding: settings.padding,
        headroom: settings.headroom,
        gfpgan: settings.gfpgan,
      });

      if (result.success) {
        setSessionId(result.session_id);
        setPreviewImg(result.preview);
        setMetrics(result.metrics ?? {});
      } else {
        throw new Error(result.error ?? "Upload failed");
      }
    } catch (e: any) {
      const msg: string = e.message ?? "Failed to process image";
      const isServiceDown = msg === "Failed to fetch" || msg.includes("NetworkError");
      setError(
        isServiceDown
          ? "AI service is not running. Start it with: cd backend/ai_service && python main.py"
          : msg
      );
    } finally {
      setPhase1Loading(false);
    }
  }, [getPhotoSrc, settings.cropMode, settings.padding, settings.headroom, settings.gfpgan]);

  // Auto-upload when modal opens
  useEffect(() => {
    if (open && recordsWithPhoto.length > 0) {
      uploadForEditing(recordsWithPhoto[selectedRecordIdx]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Debounced render on settings change ──────────────────────────────────

  const triggerRender = useCallback((newSettings: PhotoEditorSettings) => {
    if (!sessionId) return;
    if (renderDebounceRef.current) clearTimeout(renderDebounceRef.current);
    renderDebounceRef.current = setTimeout(async () => {
      setRenderLoading(true);
      try {
        const result = await photoEditorRender(sessionId, newSettings);
        if (result.success && result.data_url) {
          // Success: update preview
          setPreviewImg(result.data_url);
        }
        // On failure: keep current previewImg as implicit rollback (no state change)
      } catch {
        // Network error: keep current previewImg (rollback)
      } finally {
        setRenderLoading(false);
      }
    }, 450);
  }, [sessionId]);

  const updateSetting = useCallback(<K extends keyof PhotoEditorSettings>(
    key: K, value: PhotoEditorSettings[K]
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      triggerRender(next);
      return next;
    });
  }, [triggerRender]);

  // ── Download current preview ──────────────────────────────────────────────

  const handleDownload = () => {
    if (!previewImg) return;
    const a = document.createElement("a");
    a.href = previewImg;
    a.download = `edited_${Date.now()}.jpg`;
    a.click();
  };

  // ── Compliance: apply current preview to record ───────────────────────────

  const handleCompliance = () => {
    if (!previewImg || !recordsWithPhoto[selectedRecordIdx]) return;
    const rec = recordsWithPhoto[selectedRecordIdx];
    onApply([{ id: rec.id, photo: previewImg }]);
    toast.success("Photo applied to record");
  };

  // ── Batch process all records ─────────────────────────────────────────────
  // Uses the /batch endpoint so Python processes all images in a chunk with
  // asyncio.gather (concurrent threads). Files are sent first, then URLs —
  // matching Python's processing order — so results[i] always maps to the
  // correct record with zero index drift.

  const handleBatch = async () => {
    const recs = recordsWithPhoto;
    if (recs.length === 0) return;

    setBatchLoading(true);
    setBatchProgress(0);
    setBatchDone(false);
    setBatchResults([]);
    setBatchFailedCount(0);
    setError("");

    // 15 per chunk: large enough for concurrency, small enough not to OOM
    const CHUNK_SIZE = 15;
    const allResults: Array<{ id: string; photo: string }> = [];
    let failedCount = 0;

    for (let i = 0; i < recs.length; i += CHUNK_SIZE) {
      const chunk = recs.slice(i, Math.min(i + CHUNK_SIZE, recs.length));

      // ── Step 1: resolve every record to either a File or an absolute URL ──
      type RawItem = { rec: ProjectDataRecord; file: File | null; url: string | null };
      const rawItems: RawItem[] = await Promise.all(
        chunk.map(async (rec): Promise<RawItem> => {
          try {
            const src = getPhotoSrc(rec);
            if (!src) return { rec, file: null, url: null };
            if (src.startsWith("data:")) {
              const [header, b64] = src.split(",");
              const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
              const rawBytes = atob(b64);
              const arr = new Uint8Array(rawBytes.length);
              for (let j = 0; j < rawBytes.length; j++) arr[j] = rawBytes.charCodeAt(j);
              return { rec, file: new File([arr], `b_${rec.id}.jpg`, { type: mime }), url: null };
            } else if (src.startsWith("blob:")) {
              const fetchRes = await fetch(src);
              const blob = await fetchRes.blob();
              return { rec, file: new File([blob], `b_${rec.id}.jpg`, { type: blob.type || "image/jpeg" }), url: null };
            } else {
              return { rec, file: null, url: src.startsWith("/") ? `${BACKEND_ORIGIN}${src}` : src };
            }
          } catch {
            return { rec, file: null, url: null };
          }
        })
      );

      // ── Step 2: separate files and URLs (Python processes files FIRST) ────
      // orderedItems = [...fileItems, ...urlItems] matches Python's item order
      // so results[idx] === orderedItems[idx].rec  with no index drift.
      const fileItems = rawItems.filter((it) => it.file !== null);
      const urlItems  = rawItems.filter((it) => it.file === null && it.url !== null);
      const invalid   = rawItems.filter((it) => it.file === null && it.url === null);
      failedCount += invalid.length;

      const orderedItems = [...fileItems, ...urlItems];

      if (orderedItems.length > 0) {
        try {
          const batchResult = await photoEditorBatch(
            orderedItems.map((it) => it.file),          // files first (nulls for url-type items)
            settings,
            orderedItems.map((it) => it.url ?? undefined), // urls after (undefined for file-type items)
          );

          const results = batchResult.results ?? [];

          // Guard: if Python returned fewer results than sent, count the rest as failed
          const expectedCount = orderedItems.length;
          if (results.length < expectedCount) {
            failedCount += expectedCount - results.length;
          }

          results.forEach((r: any, idx: number) => {
            const item = orderedItems[idx];
            if (!item) { failedCount++; return; } // extra guard
            if (r.success && r.data_url) {
              allResults.push({ id: item.rec.id, photo: r.data_url });
            } else {
              failedCount++;
              console.warn(`[batch] ${item.rec.id}: ${r.error ?? "failed"}`);
            }
          });
        } catch (e: any) {
          // Whole chunk request failed — count all as failed
          failedCount += orderedItems.length;
          console.warn("[batch] chunk error:", e.message);
        }
      }

      setBatchProgress(Math.round(((i + chunk.length) / recs.length) * 100));
    }

    setBatchResults(allResults);
    setBatchFailedCount(failedCount);
    setBatchDone(true);
    setBatchLoading(false);

    if (failedCount > 0 && allResults.length > 0) {
      toast.error(`${failedCount} image${failedCount !== 1 ? "s" : ""} failed · ${allResults.length} succeeded`);
    } else if (failedCount > 0) {
      toast.error(`All ${failedCount} images failed to process`);
    } else {
      toast.success(`All ${allResults.length} images processed successfully`);
    }
  };

  // ── Apply batch results ───────────────────────────────────────────────────
  // Uploads processed data URLs to the backend file server so that only small
  // server paths (e.g. /uploads/assets/ai_xxx.jpg) are stored in records.
  // This keeps both localStorage (~5MB limit) and the backend JSON endpoint
  // (~15MB limit) well under their size limits, so photos persist on reload.

  const handleApplyBatch = async () => {
    if (batchResults.length === 0) return;
    setBatchUploading(true);
    try {
      const UPLOAD_CHUNK = 50;
      const serverUrls: (string | null)[] = new Array(batchResults.length).fill(null);

      for (let i = 0; i < batchResults.length; i += UPLOAD_CHUNK) {
        const slice = batchResults.slice(i, Math.min(i + UPLOAD_CHUNK, batchResults.length));
        const files = slice.map((r, j) => {
          const [header, b64] = r.photo.split(",");
          const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
          const bytes = atob(b64);
          const arr = new Uint8Array(bytes.length);
          for (let k = 0; k < bytes.length; k++) arr[k] = bytes.charCodeAt(k);
          return new File([arr], `ai_${r.id}_${i + j}.jpg`, { type: mime });
        });
        try {
          const urls = await uploadImages(files);
          urls.forEach((url, j) => { serverUrls[i + j] = url; });
        } catch {
          // chunk upload failed — fall back to data URL for those records
        }
      }

      const resolved = batchResults.map((r, i) => ({
        id: r.id,
        photo: serverUrls[i] ?? r.photo,
      }));
      onApply(resolved);
      toast.success(`Applied ${resolved.length} photos`);
      onClose();
    } finally {
      setBatchUploading(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setTimeout(() => {
      if (sessionId) triggerRender({ ...DEFAULT_SETTINGS });
    }, 50);
  };

  // ── File upload override ──────────────────────────────────────────────────

  const handleFileUpload = async (file: File) => {
    setPhase1Loading(true);
    setError("");
    setOriginalImg(URL.createObjectURL(file));
    try {
      const result = await photoEditorUpload(file, {
        mode: settings.cropMode,
        padding: settings.padding,
        headroom: settings.headroom,
        gfpgan: settings.gfpgan,
      });
      if (result.success) {
        setSessionId(result.session_id);
        setPreviewImg(result.preview);
        setMetrics(result.metrics ?? {});
      } else {
        throw new Error(result.error ?? "Upload failed");
      }
    } catch (e: any) {
      setError(e.message ?? "Failed");
    } finally {
      setPhase1Loading(false);
    }
  };

  if (!open) return null;

  const displayImg = showBefore ? originalImg : previewImg;
  const recordsCount = recordsWithPhoto.length;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)" }}
    >
      {/* ─── Modal Shell ──────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col w-full h-full max-w-[1400px] max-h-[95vh] mx-auto rounded-xl overflow-hidden"
        style={{
          background: "#0f0f0f",
          border: "1px solid #1f1f1f",
          boxShadow: "0 0 80px rgba(0,0,0,0.8)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f1f1f] shrink-0"
          style={{ background: "#111" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
              <Sliders size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white leading-tight">AI Photo Studio</h2>
              <p className="text-[11px] text-gray-500">v7.4 · {recordsCount} photo{recordsCount !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* Record selector */}
          {recordsWithPhoto.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">Editing:</span>
              <select
                value={selectedRecordIdx}
                onChange={(e) => {
                  const idx = parseInt(e.target.value);
                  setSelectedRecordIdx(idx);
                  uploadForEditing(recordsWithPhoto[idx]);
                }}
                className="bg-[#1a1a1a] border border-[#333] text-gray-200 text-[12px] rounded px-2 py-1 focus:outline-none"
              >
                {recordsWithPhoto.map((r, i) => (
                  <option key={r.id} value={i}>
                    {(r as any).name || (r as any).studentName || r.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Metrics badges */}
            {metrics.alert && (
              <span className={`text-[10px] px-2 py-1 rounded border ${
                metrics.alert.startsWith("✅")
                  ? "text-green-400 border-green-900 bg-green-950/30"
                  : "text-amber-400 border-amber-900 bg-amber-950/30"
              }`}>{metrics.alert}</span>
            )}
            {metrics.quality && (
              <span className="text-[10px] text-gray-500">Q: {metrics.quality}</span>
            )}
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT: Preview Panel ─────────────────────────────────── */}
          <div className="flex flex-col" style={{ width: "58%", background: "#0a0a0a", borderRight: "1px solid #1a1a1a" }}>

            {/* Image preview area */}
            <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
              {phase1Loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
                  style={{ background: "rgba(0,0,0,0.85)" }}>
                  <Loader2 className="animate-spin text-violet-400 mb-3" size={36} />
                  <p className="text-gray-300 text-sm">Detecting face & removing background…</p>
                  <p className="text-gray-500 text-xs mt-1">This may take 5–15 seconds on first upload</p>
                </div>
              )}

              {error && !phase1Loading && (
                <div className="absolute inset-0 z-10 flex flex-col items-end justify-start p-3 pointer-events-none">
                  <div className="pointer-events-auto flex flex-col items-center gap-2 text-center bg-[#0f0f0f]/90 rounded-xl p-4 max-w-xs border border-red-900/60 shadow-xl">
                    <AlertCircle className="text-red-400" size={24} />
                    <p className="text-red-300 text-[11px] leading-snug">{error}</p>
                    <button
                      onClick={() => recordsWithPhoto[selectedRecordIdx] && uploadForEditing(recordsWithPhoto[selectedRecordIdx])}
                      className="text-xs px-3 py-1 rounded border border-red-800 text-red-400 hover:bg-red-950/50 transition-colors mt-1"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {!phase1Loading && !error && !displayImg && !originalImg && (
                <div
                  className="flex flex-col items-center gap-3 text-center cursor-pointer border-2 border-dashed border-[#2a2a2a] rounded-xl p-10 hover:border-[#444] transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="text-gray-600" size={36} />
                  <p className="text-gray-500 text-sm">Upload a photo to begin</p>
                </div>
              )}

              {/* Show original as fallback when error state and no processed preview */}
              {error && !phase1Loading && originalImg && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={originalImg}
                    alt="Original (unprocessed)"
                    className="max-w-full max-h-full object-contain rounded opacity-40"
                  />
                </div>
              )}

              {displayImg && !error && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={displayImg}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain rounded"
                    style={{ imageRendering: "high-quality" }}
                  />
                  {renderLoading && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/70">
                      <Loader2 size={12} className="animate-spin text-violet-400" />
                      <span className="text-[10px] text-gray-400">Rendering…</span>
                    </div>
                  )}
                  {showBefore && (
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-amber-500/80 text-[10px] font-semibold text-black">
                      BEFORE
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Status bar */}
            {metrics.tilt && (
              <div className="px-4 py-1.5 flex gap-4 text-[11px] text-gray-600 border-t border-[#1a1a1a]">
                <span>Tilt {metrics.tilt}</span>
                <span>Brightness {metrics.brightness}</span>
                <span>Symmetry {metrics.symmetry}</span>
                <span>Quality {metrics.quality}</span>
              </div>
            )}

            {/* Upload another */}
            <div className="px-4 py-2 flex items-center gap-2 border-t border-[#1a1a1a]">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-white/5"
              >
                <Upload size={12} /> Upload photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
              />
              <div className="flex-1" />
              {sessionId && (
                <button
                  onClick={() => uploadForEditing(recordsWithPhoto[selectedRecordIdx])}
                  className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-white/5"
                >
                  <RefreshCw size={11} /> Reprocess
                </button>
              )}
            </div>

            {/* ── Batch progress / results ─────────────────────────── */}
            {(batchLoading || batchDone || batchUploading) && (
              <div className="px-4 pb-3 border-t border-[#1a1a1a]">
                {batchUploading && (
                  <div className="mt-2 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin text-blue-400" />
                    <span className="text-[11px] text-blue-300">Saving photos to server…</span>
                  </div>
                )}
                {batchLoading && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                      <span>Processing batch…</span>
                      <span>{batchProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${batchProgress}%`, background: "linear-gradient(90deg,#f97316,#ef4444)" }}
                      />
                    </div>
                  </div>
                )}
                {batchDone && (
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-400" />
                      <span className="text-[12px] text-green-300">{batchResults.length} succeeded</span>
                      {batchFailedCount > 0 && (
                        <span className="text-[12px] text-red-400">{batchFailedCount} failed</span>
                      )}
                    </div>
                    {batchResults.length > 0 && (
                      <button
                        onClick={() => void handleApplyBatch()}
                        disabled={batchUploading}
                        className="text-[11px] px-3 py-1 rounded bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-60 flex items-center gap-1"
                      >
                        {batchUploading
                          ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                          : "Apply All"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Controls Panel ────────────────────────────────── */}
          <div
            className="flex flex-col overflow-hidden"
            style={{ width: "42%", background: "#111" }}
          >
            {/* Scrollable controls */}
            <div className="flex-1 overflow-y-auto px-5 py-4"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>

              {/* ── Quality Preset ──────────────────────────────────── */}
              <SectionHeader color="#34d399">Quality Preset</SectionHeader>
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.keys(QUALITY_PRESETS).map(preset => (
                  <button
                    key={preset}
                    onClick={() => {
                      setActivePreset(preset);
                      setSettings(prev => ({ ...prev, ...QUALITY_PRESETS[preset] }));
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      activePreset === preset
                        ? "bg-emerald-500 border-emerald-400 text-white"
                        : "bg-neutral-800 border-neutral-600 text-neutral-300 hover:border-emerald-500"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* ── 5 Precision Sliders ──────────────────────────────── */}
              <SectionHeader color="#60a5fa">5 Precision Sliders — step = 0.1</SectionHeader>

              <SliderRow
                emoji="✨" label="Enhance" value={settings.enhance} min={0} max={10} step={0.1}
                tags={["beauty", "clarity", "vibrance", "dodge&burn", "blemish", "pop"]}
                color="#a78bfa"
                onChange={(v) => updateSetting("enhance", v)}
              />
              <SliderRow
                emoji="💡" label="Exposure" value={settings.exposure} min={-5} max={5} step={0.1}
                tagLine="brightness + contrast merged (non-linear perceptual curve)"
                color="#fbbf24"
                onChange={(v) => updateSetting("exposure", v)}
              />
              <SliderRow
                emoji="🌡" label="Color Te…" value={settings.colorTemp} min={-5} max={5} step={0.1}
                tagLine="-5 = arctic cool   0 = neutral   +5 = golden warm"
                color="#38bdf8"
                onChange={(v) => updateSetting("colorTemp", v)}
              />
              <SliderRow
                emoji="🔍" label="Sharpn…" value={settings.sharpness} min={0} max={10} step={0.1}
                tags={["eyelip sharp", "global crisp", "catchlight"]}
                color="#34d399"
                onChange={(v) => updateSetting("sharpness", v)}
              />
              <SliderRow
                emoji="🧴" label="Skin" value={settings.skin} min={0} max={10} step={0.1}
                tags={["smooth", "blemish", "glare", "dark circles", "denoise", "teeth"]}
                color="#f472b6"
                onChange={(v) => updateSetting("skin", v)}
              />

              {/* Grade + Crop Mode */}
              <div className="flex gap-3 mb-4 mt-1">
                <div className="flex-1">
                  <p className="text-[11px] text-gray-500 mb-1">Grade</p>
                  <DarkSelect
                    value={settings.colorGrade}
                    options={["natural", "vivid", "soft", "warm"]}
                    onChange={(v) => updateSetting("colorGrade", v)}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-gray-500 mb-1">Crop Mode</p>
                  <DarkSelect
                    value={settings.cropMode}
                    options={["manual", "smart_scale", "strict"]}
                    onChange={(v) => {
                      updateSetting("cropMode", v);
                      // Re-upload with new mode when crop changes
                      if (recordsWithPhoto[selectedRecordIdx]) {
                        setTimeout(() => uploadForEditing(recordsWithPhoto[selectedRecordIdx]), 100);
                      }
                    }}
                  />
                </div>
              </div>

              {/* ── Composition ────────────────────────────────────────── */}
              <SectionHeader color="#94a3b8">Composition</SectionHeader>

              <IntSliderRow
                label="Padding" value={settings.padding} min={2.5} max={7} step={0.1}
                hint="↑ more padding = more body visible below face"
                color="#7c3aed"
                onChange={(v) => updateSetting("padding", v)}
              />
              <IntSliderRow
                label="Headroom" value={Math.round(settings.headroom * 100) / 100}
                min={0.05} max={0.45} step={0.01}
                hint="controls how far from top the head sits"
                color="#7c3aed"
                onChange={(v) => updateSetting("headroom", v)}
              />

              {/* ── Background ─────────────────────────────────────────── */}
              <SectionHeader color="#94a3b8">Background</SectionHeader>

              <div className="flex gap-3 mb-2">
                <div className="flex-1">
                  <ColorRow
                    label="Background"
                    value={settings.bgColor}
                    onChange={(v) => updateSetting("bgColor", v)}
                  />
                </div>
                <div className="w-28">
                  <ColorRow
                    label="Shadow"
                    value={settings.shadowColor}
                    onChange={(v) => updateSetting("shadowColor", v)}
                  />
                </div>
              </div>

              <div className="mb-3">
                <p className="text-[11px] text-gray-500 mb-1">Gradient</p>
                <DarkSelect
                  value={settings.gradient}
                  options={GRADIENT_OPTIONS}
                  onChange={(v) => updateSetting("gradient", v)}
                />
              </div>

              <IntSliderRow
                label="Glow" value={settings.glow} min={0} max={100}
                color="#64748b"
                onChange={(v) => updateSetting("glow", v)}
              />
              <IntSliderRow
                label="Shdw Soft" value={settings.shadowSoft} min={1} max={101} step={2}
                color="#64748b"
                onChange={(v) => updateSetting("shadowSoft", v)}
              />
              <IntSliderRow
                label="Shdw Dist" value={settings.shadowDist} min={0} max={50}
                color="#64748b"
                onChange={(v) => updateSetting("shadowDist", v)}
              />

              {/* ── Output ─────────────────────────────────────────────── */}
              <SectionHeader color="#94a3b8">Output</SectionHeader>

              <div className="mb-3">
                <p className="text-[11px] text-gray-500 mb-1">Format</p>
                <DarkSelect
                  value={settings.format}
                  options={FORMAT_OPTIONS}
                  onChange={(v) => updateSetting("format", v)}
                />
              </div>

              <IntSliderRow
                label="JPEG Quality" value={settings.jpegQuality} min={60} max={98}
                color="#475569"
                onChange={(v) => updateSetting("jpegQuality", v)}
              />

              <div className="mb-3">
                <p className="text-[11px] text-gray-500 mb-1">Watermark</p>
                <input
                  type="text"
                  placeholder="Optional…"
                  value={settings.watermark}
                  onChange={(e) => updateSetting("watermark", e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2 py-1.5 text-[12px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-[#555]"
                />
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
                <CheckRow checked={settings.balanceSkin} onChange={(v) => updateSetting("balanceSkin", v)}>
                  ⚖️ Balance Skin
                </CheckRow>
                <CheckRow checked={settings.cleanHair} onChange={(v) => updateSetting("cleanHair", v)}>
                  ✂️ Clean Hair
                </CheckRow>
                <CheckRow checked={settings.gfpgan} onChange={(v) => updateSetting("gfpgan", v)}>
                  🤖 GFPGAN (pip install gfpgan)
                </CheckRow>
              </div>

              {settings.gfpgan && (
                <p className="text-[10px] text-gray-600 mb-3 ml-6 leading-relaxed">
                  GFPGAN uses a trained GAN to reconstruct fine facial details — sharper eyes, cleaner pores,
                  reduced blur. Runs in Phase 1 (~5–10s extra). Tip: keep at 0.5–0.7 for natural look.
                </p>
              )}

              <div className="h-px bg-[#1f1f1f] my-3" />

              {/* ── Bottom Action Buttons ──────────────────────────── */}
              <div className="flex flex-wrap gap-2 pb-2">
                <button
                  onClick={handleDownload}
                  disabled={!previewImg}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.03] active:scale-95"
                  style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
                >
                  <Download size={13} /> Download
                </button>

                <button
                  onClick={() => setShowBefore((b) => !b)}
                  disabled={!previewImg || !originalImg}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.03] active:scale-95"
                  style={{ background: showBefore ? "linear-gradient(135deg,#b45309,#92400e)" : "linear-gradient(135deg,#2563eb,#1d4ed8)" }}
                >
                  <SwitchCamera size={13} /> Before/After
                </button>

                <button
                  onClick={handleCompliance}
                  disabled={!previewImg}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.03] active:scale-95"
                  style={{ background: "linear-gradient(135deg, #0891b2, #0e7490)" }}
                >
                  <ShieldCheck size={13} /> Compliance
                </button>

                <button
                  onClick={handleBatch}
                  disabled={batchLoading || recordsCount === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-40 transition-all hover:scale-[1.03] active:scale-95"
                  style={{ background: "linear-gradient(135deg, #ea580c, #c2410c)" }}
                >
                  {batchLoading
                    ? <><Loader2 size={13} className="animate-spin" /> {batchProgress}%</>
                    : <><Layers size={13} /> Batch ({recordsCount})</>}
                </button>

                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold text-gray-300 transition-all hover:scale-[1.03] active:scale-95 hover:text-white"
                  style={{ background: "linear-gradient(135deg, #374151, #1f2937)" }}
                >
                  <RefreshCw size={13} /> Reset
                </button>
              </div>

              {/* Ready status */}
              {!phase1Loading && !error && (
                <p className="text-[10px] text-gray-600 mt-2">
                  {sessionId
                    ? `✅ Session ready — sliders respond in ~0.3s`
                    : "Upload a photo to begin"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Slider thumb global style */}
      <style>{`
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; }
        input[type=range]::-moz-range-thumb { border: none; background: transparent; }
      `}</style>
    </div>
  );
}
