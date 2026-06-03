/**
 * AIBgRemoveModal — AI Background Removal
 *
 * Dark-theme glassmorphism dialog.
 * - Background replacement: transparent / white / black / custom hex
 * - Single preview before bulk apply
 * - rembg-powered hair-edge preservation
 * - Batched processing with real server-side progress tracking
 * - Per-image success/error reporting
 */

import { useState, useCallback, useEffect } from "react";
import {
  Wand2, Loader2, CheckCircle2, AlertCircle, X, Eye, Zap,
  ImageOff,
} from "lucide-react";
import {
  removeBgSingle, removeBgBulk,
  type BgColor, type BulkProcessResult,
} from "../../../lib/aiImageService";
import { uploadImages } from "../../../lib/apiService";
import type { ProjectDataRecord } from "../../../lib/projectStore";

// ── Props ──────────────────────────────────────────────────────────────────────

interface AIBgRemoveModalProps {
  open: boolean;
  onClose: () => void;
  records: ProjectDataRecord[];
  getPhotoSrc: (rec: ProjectDataRecord) => string;
  onApply: (updates: Array<{ id: string; photo: string }>) => void;
}

// ── BG colour presets ──────────────────────────────────────────────────────────

const BG_PRESETS: { value: BgColor; label: string; swatch: string }[] = [
  { value: "transparent", label: "Transparent", swatch: "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNjY2MiLz48cmVjdCB4PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIi8+PHJlY3QgeT0iOCIgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==')] bg-repeat" },
  { value: "white",       label: "White",       swatch: "bg-white border border-gray-300" },
  { value: "black",       label: "Black",       swatch: "bg-black border border-gray-700" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function AIBgRemoveModal({ open, onClose, records, getPhotoSrc, onApply }: AIBgRemoveModalProps) {
  const [bgColor, setBgColor]       = useState<BgColor>("transparent");
  const [customHex, setCustomHex]   = useState("#ffffff");
  const [model, setModel]           = useState("u2net_human_seg");
  const [status, setStatus]         = useState<"idle" | "previewing" | "processing" | "done" | "error">("idle");
  const [progress, setProgress]     = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState("");
  const [result, setResult]         = useState<BulkProcessResult | null>(null);
  const [failedItems, setFailedItems] = useState<Array<{ filename: string; error: string }>>([]);

  // Reset all transient state whenever the modal is opened so a re-open
  // never shows stale progress / results from a previous run.
  useEffect(() => {
    if (open) {
      setStatus("idle");
      setProgress(0);
      setProgressLabel("");
      setPreviewUrl(null);
      setErrorMsg("");
      setResult(null);
      setFailedItems([]);
    }
  }, [open]);

  const recordsWithPhoto = records.filter((r) => Boolean(getPhotoSrc(r)));
  const count = recordsWithPhoto.length;

  const activeBg: BgColor = bgColor === "custom" ? customHex : bgColor;

  // ── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (!recordsWithPhoto.length) return;
    setStatus("previewing");
    setPreviewUrl(null);
    setErrorMsg("");
    try {
      const first = recordsWithPhoto[0];
      // Use a PNG filename for preview so the background is correctly transparent
      const res = await removeBgSingle(
        getPhotoSrc(first),
        `preview_${first.id}.png`,
        activeBg,
        model,
      );
      if (res.success && res.data_url) {
        setPreviewUrl(res.data_url);
        setStatus("idle");
      } else {
        throw new Error(res.error ?? "Preview failed — no output returned");
      }
    } catch (e: any) {
      setErrorMsg(e.message ?? "Preview failed");
      setStatus("error");
    }
  }, [recordsWithPhoto, activeBg, model, getPhotoSrc]);

  // ── Apply ─────────────────────────────────────────────────────────────────

  const handleApply = useCallback(async () => {
    if (!count) return;
    setStatus("processing");
    setProgress(0);
    setProgressLabel("Preparing images…");
    setErrorMsg("");
    setFailedItems([]);
    setResult(null);

    try {
      // Build a filename → recordId map so results can be matched back by
      // filename regardless of filtering (fixes index-mismatch bug when some
      // images fail partway through).
      const ext = activeBg === "transparent" ? "png" : "jpg";
      const inputs = recordsWithPhoto.map((r) => ({
        src: getPhotoSrc(r),
        filename: `${r.id}.${ext}`,
        recordId: r.id,
      }));
      const filenameToRecordId = new Map(inputs.map((inp) => [inp.filename, inp.recordId]));

      const bulk = await removeBgBulk(
        inputs.map(({ src, filename }) => ({ src, filename })),
        activeBg,
        model,
        (done, total) => {
          // Processing progress: 0→100 (compression + upload are interleaved
          // per batch so there is no separate "prepare" phase anymore).
          setProgress(Math.round((done / total) * 100));
          setProgressLabel(`Processing ${done} of ${total} images…`);
        },
        (done, total) => {
          // Compression sub-progress shown only while a batch is being prepared
          // (roughly the first 0–10% of the bar per batch group).
          if (done < total) {
            setProgressLabel(`Preparing ${done} of ${total} images…`);
          }
        },
      );

      setResult(bulk);

      // Collect failures for display
      const failures = bulk.results
        .filter((r) => !r.success)
        .map((r) => ({ filename: r.filename, error: r.error ?? "Unknown error" }));
      setFailedItems(failures);

      // ── Upload processed images to server (avoids PayloadTooLargeError) ──
      // Storing 200+ base64 PNGs in the project JSON payload can exceed the
      // Express body limit (15 MB). Upload to /api/upload-images first and
      // store server paths so only small URLs are saved in MongoDB.
      const successResults = bulk.results.filter((r) => r.success && r.data_url);
      const serverUrls: (string | null)[] = new Array(successResults.length).fill(null);
      const UPLOAD_CHUNK = 20;
      const uploadExt = activeBg === "transparent" ? "png" : "jpg";
      const uploadMime = activeBg === "transparent" ? "image/png" : "image/jpeg";
      let uploadedCount = 0;
      setProgressLabel(`Saving 0 of ${successResults.length} images…`);
      for (let ci = 0; ci < successResults.length; ci += UPLOAD_CHUNK) {
        const slice = successResults.slice(ci, Math.min(ci + UPLOAD_CHUNK, successResults.length));
        try {
          const files = slice.map((r) => {
            const [, b64] = (r.data_url!).split(",");
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const recId = filenameToRecordId.get(r.filename) ?? r.filename.replace(/\.[^.]+$/, "");
            return new File([bytes], `ai_bg_${recId}.${uploadExt}`, { type: uploadMime });
          });
          const urls = await uploadImages(files);
          urls.forEach((url, j) => { serverUrls[ci + j] = url; });
        } catch {
          // Upload failed for this chunk — fall back to data URL for those images
        }
        uploadedCount = Math.min(ci + UPLOAD_CHUNK, successResults.length);
        setProgressLabel(`Saving ${uploadedCount} of ${successResults.length} images…`);
      }

      // Build updates using the filename→recordId map (order-independent)
      const updates = successResults.map((r, i) => ({
        id: filenameToRecordId.get(r.filename) ?? r.filename.replace(/\.[^.]+$/, ""),
        photo: serverUrls[i] ?? r.data_url!,
      }));

      if (updates.length > 0) {
        onApply(updates);
      }
      setStatus("done");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Processing failed");
      setStatus("error");
    }
  }, [recordsWithPhoto, activeBg, model, count, getPhotoSrc, onApply]);

  const handleClose = () => {
    // Don't allow closing while processing to prevent partial-apply state
    if (status === "processing") return;
    setStatus("idle");
    setPreviewUrl(null);
    setErrorMsg("");
    setResult(null);
    setProgress(0);
    setProgressLabel("");
    setFailedItems([]);
    onClose();
  };

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-cyan-900/30 to-gray-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30">
              <Wand2 className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">AI Background Remover</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                {count} image{count !== 1 ? "s" : ""} • Hair-edge preserving AI model
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Background color */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
              Replace Background With
            </label>
            <div className="flex gap-3 flex-wrap">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setBgColor(p.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all duration-200 ${
                    bgColor === p.value
                      ? "border-cyan-500 bg-cyan-600/20 text-cyan-300"
                      : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-md shrink-0 ${p.swatch}`} />
                  {p.label}
                </button>
              ))}
              {/* Custom colour */}
              <button
                onClick={() => setBgColor("custom")}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all duration-200 ${
                  bgColor === "custom"
                    ? "border-cyan-500 bg-cyan-600/20 text-cyan-300"
                    : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="w-4 h-4 rounded-md shrink-0 border border-white/30" style={{ background: customHex }} />
                Custom
              </button>
            </div>

            {bgColor === "custom" && (
              <div className="flex items-center gap-3 mt-3">
                <input
                  type="color"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  placeholder="#ffffff"
                  maxLength={7}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            )}
          </div>

          {/* AI Model */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
              AI Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 appearance-none"
            >
              <option value="u2net_human_seg">u2net_human_seg — Best for portraits & hair</option>
              <option value="u2net">u2net — General purpose</option>
              <option value="isnet-general-use">isnet-general-use — High detail</option>
            </select>
          </div>

          {/* Preview */}
          {previewUrl && status !== "processing" && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Preview — first image
              </p>
              <div className="flex justify-center">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-48 rounded-lg object-contain border border-white/10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMzMzIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMzMzMiLz48cmVjdCB4PSIxMCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMjIyIi8+PHJlY3QgeT0iMTAiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsbD0iIzIyMiIvPjwvc3ZnPg==')] bg-repeat"
                />
              </div>
            </div>
          )}

          {/* Progress */}
          {status === "processing" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  {progressLabel || "Removing backgrounds…"}
                </span>
                <span className="text-cyan-400 font-mono">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Processing in batches of 10 — do not close this window.
              </p>
            </div>
          )}

          {/* Done */}
          {status === "done" && result && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-300">
                  <p className="font-medium">Done!</p>
                  <p className="text-xs text-emerald-400/80 mt-0.5">
                    {result.processed} of {result.total} image{result.total !== 1 ? "s" : ""} processed successfully.
                    {result.failed > 0 && (
                      <span className="text-amber-400/80"> {result.failed} failed.</span>
                    )}
                  </p>
                </div>
              </div>
              {/* Per-image failure list */}
              {failedItems.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 max-h-24 overflow-y-auto space-y-1">
                  {failedItems.map((f) => (
                    <div key={f.filename} className="flex items-start gap-2 text-xs text-red-300/80">
                      <ImageOff className="h-3 w-3 shrink-0 mt-0.5 text-red-400" />
                      <span className="truncate" title={f.error}>{f.filename}: {f.error}</span>
                    </div>
                  ))}
                </div>
              )}
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

          {count === 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              No images found in selected records.
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
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === "processing"
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</>
              : <><Zap className="h-3.5 w-3.5" /> Apply to {count} Image{count !== 1 ? "s" : ""}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
