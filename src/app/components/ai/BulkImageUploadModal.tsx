/**
 * BulkImageUploadModal — Upload ZIP / folder and auto-match images to students
 *
 * Dark-theme glassmorphism dialog.
 * - Drag-and-drop ZIP or folder
 * - Shows matched / unmatched / duplicate results
 * - Per-image progress bar during upload
 * - Apply matched images to student records
 */

import { useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import {
  Archive, FolderOpen, Upload, Loader2, CheckCircle2,
  AlertTriangle, XCircle, X, Zap, RotateCcw,
} from "lucide-react";
import { uploadImages } from "../../../lib/apiService";
import { matchImages } from "../../../lib/imageMatchEngine";
import type { ProjectDataRecord } from "../../../lib/projectStore";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MatchedItem  { userId: string; name: string; filename: string; imageUrl: string }
interface UnmatchedItem { filename: string; reason: string }
interface DuplicateItem { filename: string; allMatchNames: string[]; appliedName: string }

interface BulkResults {
  matched:    MatchedItem[];
  unmatched:  UnmatchedItem[];
  duplicates: DuplicateItem[];
}

interface BulkImageUploadModalProps {
  open: boolean;
  onClose: () => void;
  records: ProjectDataRecord[];
  onApply: (updates: Array<{ id: string; photo: string }>) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BulkImageUploadModal({ open, onClose, records, onApply }: BulkImageUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [results, setResults]       = useState<BulkResults | null>(null);
  const [error, setError]           = useState("");

  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef    = useRef<HTMLInputElement>(null);

  // ── Core processing ───────────────────────────────────────────────────────

  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
    if (!imageFiles.length) {
      setError("No image files found in the selection.");
      return;
    }

    setProcessing(true);
    setResults(null);
    setError("");
    setProgress(0);
    setProgressLabel(`Uploading ${imageFiles.length} images…`);

    try {
      // ── Upload to server ─────────────────────────────────────────────────
      let imageUrls: string[];
      try {
        imageUrls = await uploadImages(imageFiles);
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
        imageUrls = await uploadImages(imageFiles);
      }

      setProgress(60);
      setProgressLabel("Matching images to records…");

      // ── Match images to student records ──────────────────────────────────
      // Resolve relative paths to absolute URLs so the preview thumbnails
      // and stored photo fields both work across origins / after hydration.
      const backendOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const resolveUrl = (url: string) => {
        if (!url || url.startsWith('http')) return url;
        return `${backendOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
      };

      const loaded = imageFiles.map((file, idx) => ({
        name: file.name,
        dataUrl: resolveUrl(imageUrls[idx] || "/uploads/assets/default.jpg"),
      }));

      const bulkResult = matchImages(loaded, records);

      setProgress(90);
      setProgressLabel("Building results…");

      setResults({
        matched:    bulkResult.matched.map((m) => ({
          userId:   m.userId,
          name:     m.name,
          filename: m.filename,
          imageUrl: m.dataUrl,
        })),
        unmatched:  bulkResult.unmatched.map((u) => ({
          filename: u.filename,
          reason:   u.reason,
        })),
        duplicates: bulkResult.duplicates.map((d) => ({
          filename:      d.filename,
          allMatchNames: d.allMatches.map((m) => `${m.name} (${m.score}%)`),
          appliedName:   d.appliedName,
        })),
      });

      setProgress(100);
    } catch (e: any) {
      setError(e.message ?? "Upload failed. Please try again.");
    } finally {
      setProcessing(false);
      setProgressLabel("");
    }
  }, [records]);

  // ── File input handlers ───────────────────────────────────────────────────

  const handleFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await processFiles(files);
  };

  const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const zipFile = e.target.files?.[0];
    e.target.value = "";
    if (!zipFile) return;

    setProcessing(true);
    setResults(null);
    setError("");
    setProgress(10);
    setProgressLabel("Extracting ZIP…");

    try {
      const zip = new JSZip();
      const loaded = await zip.loadAsync(zipFile);
      const entries = Object.values(loaded.files).filter(
        (entry) => !entry.dir && /\.(jpe?g|png|webp|gif|bmp)$/i.test(entry.name)
      );

      const files: File[] = await Promise.all(
        entries.map(async (entry) => {
          const blob = await entry.async("blob");
          const basename = entry.name.split("/").pop() ?? entry.name;
          return new File([blob], basename, { type: blob.type || "image/jpeg" });
        })
      );

      setProgress(30);
      // processFiles will handle setProcessing(false)
      await processFiles(files);
    } catch {
      setProcessing(false);
      setError("Failed to extract ZIP file. Make sure it's a valid ZIP archive.");
    }
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const zipFile = files.find((f) => /\.zip$/i.test(f.name));
    if (zipFile) {
      // Treat as ZIP
      const fakeEvent = { target: { files: [zipFile], value: "" } } as any;
      await handleZipChange(fakeEvent);
    } else {
      await processFiles(files);
    }
  };

  // ── Apply ─────────────────────────────────────────────────────────────────

  const handleApply = () => {
    if (!results?.matched.length) return;
    const updates = results.matched.map(({ userId, imageUrl }) => ({
      id: userId, photo: imageUrl,
    }));
    onApply(updates);
    handleClose();
  };

  const handleClose = () => {
    setResults(null);
    setError("");
    setProgress(0);
    setProgressLabel("");
    onClose();
  };

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-blue-900/30 to-gray-900/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-500/30">
              <Archive className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">Bulk Image Upload</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                Upload ZIP or folder — auto-match to {records.length} records
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Drop zone */}
          {!results && !processing && (
            <div
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer ${
                isDragging
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-white/10 bg-white/5 hover:border-blue-500/40 hover:bg-white/8"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => zipRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-gray-500 mx-auto mb-3" />
              <p className="text-white font-medium text-sm">
                Drop ZIP / images here
              </p>
              <p className="text-gray-500 text-xs mt-1">
                or click to browse
              </p>
            </div>
          )}

          {/* Upload buttons */}
          {!results && !processing && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => zipRef.current?.click()}
                className="flex flex-col items-center gap-2 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-blue-500/10 hover:border-blue-500/30 text-gray-400 hover:text-blue-300 text-sm font-medium transition-all duration-200"
              >
                <Archive className="h-6 w-6" />
                Upload ZIP File
              </button>
              <button
                onClick={() => folderRef.current?.click()}
                className="flex flex-col items-center gap-2 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-blue-500/10 hover:border-blue-500/30 text-gray-400 hover:text-blue-300 text-sm font-medium transition-all duration-200"
              >
                <FolderOpen className="h-6 w-6" />
                Upload Folder
              </button>
            </div>
          )}

          {/* Progress */}
          {processing && (
            <div className="space-y-3 py-4">
              <div className="flex justify-between items-center text-sm text-gray-400">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  {progressLabel}
                </span>
                <span className="text-blue-400 font-mono">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && !processing && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 flex items-start gap-3">
              <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Results */}
          {results && !processing && (
            <div className="space-y-3">

              {/* Matched */}
              <details open className="rounded-xl border border-emerald-500/20 overflow-hidden">
                <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer bg-emerald-500/10 text-emerald-300 text-sm font-medium select-none list-none">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {results.matched.length} images matched
                  <span className="ml-auto text-xs text-emerald-400/60">▾</span>
                </summary>
                {results.matched.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto divide-y divide-emerald-500/10">
                    {results.matched.map((m) => (
                      <li key={m.userId} className="flex items-center gap-3 px-4 py-2">
                        <img
                          src={m.imageUrl}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover shrink-0 border border-emerald-500/20"
                        />
                        <span className="text-xs text-emerald-300 truncate">
                          {m.filename} → <strong>{m.name}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>

              {/* Duplicates */}
              {results.duplicates.length > 0 && (
                <details className="rounded-xl border border-amber-500/20 overflow-hidden">
                  <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer bg-amber-500/10 text-amber-300 text-sm font-medium select-none list-none">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {results.duplicates.length} ambiguous — not applied
                    <span className="ml-auto text-xs text-amber-400/60">▾</span>
                  </summary>
                  <ul className="max-h-40 overflow-y-auto divide-y divide-amber-500/10 px-4 py-2 space-y-2">
                    {results.duplicates.map((d, i) => (
                      <li key={i} className="py-1">
                        <p className="text-xs font-semibold text-amber-200 truncate">{d.filename}</p>
                        <ul className="text-[11px] text-amber-400/80 pl-3 mt-1 space-y-0.5">
                          {d.allMatchNames.map((n, ni) => <li key={ni}>{ni + 1}. {n}</li>)}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Unmatched */}
              {results.unmatched.length > 0 && (
                <details className="rounded-xl border border-red-500/20 overflow-hidden">
                  <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer bg-red-500/10 text-red-300 text-sm font-medium select-none list-none">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {results.unmatched.length} unmatched
                    <span className="ml-auto text-xs text-red-400/60">▾</span>
                  </summary>
                  <ul className="max-h-40 overflow-y-auto divide-y divide-red-500/10">
                    {results.unmatched.map((u, i) => (
                      <li key={i} className="flex items-start gap-2 px-4 py-2">
                        <span className="text-xs text-red-300 truncate">{u.filename}</span>
                        <span className="text-[11px] text-red-400/70 shrink-0">{u.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-gray-900/50 flex items-center gap-3 shrink-0">
          {results && (
            <button
              onClick={() => { setResults(null); setError(""); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-sm font-medium transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" /> New Upload
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={!results?.matched.length}
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="h-3.5 w-3.5" />
            Apply {results?.matched.length ?? 0} Matched Image{(results?.matched.length ?? 0) !== 1 ? "s" : ""}
          </button>
        </div>

        {/* Hidden inputs */}
        <input
          ref={folderRef}
          type="file"
          accept="image/*"
          multiple
          // @ts-expect-error non-standard
          webkitdirectory=""
          className="hidden"
          onChange={handleFolderChange}
        />
        <input
          ref={zipRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={handleZipChange}
        />
      </div>
    </div>
  );
}
