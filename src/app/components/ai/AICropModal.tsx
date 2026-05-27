/**
 * AICropModal — AI Auto-Crop with face detection
 *
 * Dark-theme glassmorphism dialog.
 * - Single or bulk processing
 * - Live preview of first image before applying to all
 * - Aspect ratio selector
 * - Per-record progress bar
 */

import { useState, useCallback } from "react";
import {
  Crop, Loader2, CheckCircle2, AlertCircle, X, RefreshCw, Eye, Zap,
} from "lucide-react";
import {
  autoCropSingle, autoCropBulk,
  type AspectRatio, type BulkProcessResult,
} from "../../../lib/aiImageService";
import type { ProjectDataRecord } from "../../../lib/projectStore";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AICropModalProps {
  open: boolean;
  onClose: () => void;
  records: ProjectDataRecord[];                       // records to process
  getPhotoSrc: (rec: ProjectDataRecord) => string;    // resolver for photo URL/data-URL
  onApply: (updates: Array<{ id: string; photo: string }>) => void;
}

// ── Aspect ratio options ───────────────────────────────────────────────────────

const RATIO_OPTIONS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: "1:1",      label: "Square",    desc: "1:1 — Student / school photos" },
  { value: "3:4",      label: "Portrait",  desc: "3:4 — Passport style" },
  { value: "2:3",      label: "Photo",     desc: "2:3 — Standard photo" },
  { value: "passport", label: "Passport",  desc: "35×45 mm — ID/Passport" },
  { value: "id_card",  label: "ID Card",   desc: "54×86 mm — Card photo area" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function AICropModal({ open, onClose, records, getPhotoSrc, onApply }: AICropModalProps) {
  const [ratio, setRatio]         = useState<AspectRatio>("1:1");
  const [padding, setPadding]     = useState(0.15);
  const [status, setStatus]       = useState<"idle" | "previewing" | "processing" | "done" | "error">("idle");
  const [progress, setProgress]   = useState(0);         // 0–100
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState("");
  const [result, setResult]       = useState<BulkProcessResult | null>(null);

  const recordsWithPhoto = records.filter((r) => Boolean(getPhotoSrc(r)));
  const count = recordsWithPhoto.length;

  // ── Preview first image ───────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (!recordsWithPhoto.length) return;
    setStatus("previewing");
    setPreviewUrl(null);
    setErrorMsg("");
    try {
      const first = recordsWithPhoto[0];
      const src = getPhotoSrc(first);
      const res = await autoCropSingle(src, `preview_${first.id}.jpg`, ratio, padding);
      if (res.success && res.data_url) {
        setPreviewUrl(res.data_url);
        setStatus("idle");
      } else {
        throw new Error(res.error ?? "Preview failed");
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? "Preview failed");
      setStatus("error");
    }
  }, [recordsWithPhoto, ratio, padding, getPhotoSrc]);

  // ── Apply to all ──────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!count) return;
    setStatus("processing");
    setProgress(0);
    setErrorMsg("");
    try {
      const inputs = recordsWithPhoto.map((r) => ({
        src: getPhotoSrc(r),
        filename: `${r.id}.jpg`,
        recordId: r.id,
      }));

      const bulk = await autoCropBulk(
        inputs,
        ratio,
        padding,
        (done) => setProgress(Math.round((done / count) * 100)),
      );

      setResult(bulk);

      const updates = bulk.results
        .filter((r) => r.success && r.data_url)
        .map((r, i) => ({ id: inputs[i]?.recordId ?? r.filename, photo: r.data_url! }));

      onApply(updates);
      setStatus("done");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Processing failed");
      setStatus("error");
    }
  }, [recordsWithPhoto, ratio, padding, count, getPhotoSrc, onApply]);

  const handleClose = () => {
    setStatus("idle");
    setPreviewUrl(null);
    setErrorMsg("");
    setResult(null);
    setProgress(0);
    onClose();
  };

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-violet-900/30 to-gray-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/20 border border-violet-500/30">
              <Crop className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">AI Auto Crop</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                {count} image{count !== 1 ? "s" : ""} selected • Face-aware smart crop
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Ratio selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
              Crop Ratio
            </label>
            <div className="grid grid-cols-5 gap-2">
              {RATIO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRatio(opt.value)}
                  className={`py-2 px-1 rounded-xl border text-xs font-medium transition-all duration-200 ${
                    ratio === opt.value
                      ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/20"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                  title={opt.desc}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Padding slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Head Room
              </label>
              <span className="text-xs text-violet-400 font-mono">
                {Math.round(padding * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0} max={0.5} step={0.05}
              value={padding}
              onChange={(e) => setPadding(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>Tight</span><span>Loose</span>
            </div>
          </div>

          {/* Preview result */}
          {previewUrl && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Preview — first image
              </p>
              <div className="flex justify-center">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-48 rounded-lg object-contain border border-white/10"
                />
              </div>
            </div>
          )}

          {/* Progress bar */}
          {status === "processing" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                  Processing {count} images…
                </span>
                <span className="text-violet-400 font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done summary */}
          {status === "done" && result && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-300">
                <p className="font-medium">Done!</p>
                <p className="text-xs text-emerald-400/80 mt-0.5">
                  {result.processed} of {result.total} images processed successfully.
                  {result.failed > 0 && ` ${result.failed} failed.`}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Error</p>
                <p className="text-xs text-red-400/80 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* No images warning */}
          {count === 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              No images found in selected records. Please upload images first.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-gray-900/50 flex items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={!count || status === "processing" || status === "previewing"}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === "previewing"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Eye className="h-3.5 w-3.5" />}
            Preview
          </button>
          <button
            onClick={handleApply}
            disabled={!count || status === "processing" || status === "previewing"}
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === "processing"
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</>
              : status === "done"
              ? <><RefreshCw className="h-3.5 w-3.5" /> Apply Again</>
              : <><Zap className="h-3.5 w-3.5" /> Apply to {count} Image{count !== 1 ? "s" : ""}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
