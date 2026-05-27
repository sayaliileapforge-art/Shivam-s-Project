/**
 * ImageUploadModal — Single image upload with drag-and-drop
 *
 * Dark-theme glassmorphism dialog.
 * - Drag & drop or click to browse
 * - Auto-match by filename / admission number / student ID (when no specific record targeted)
 * - Live preview before applying
 */

import { useState, useRef, useCallback } from "react";
import { ImageIcon, Upload, X, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import type { ProjectDataRecord } from "../../../lib/projectStore";

// ── Props ──────────────────────────────────────────────────────────────────────

interface ImageUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** If set, upload is for a specific record. Otherwise auto-match by filename. */
  targetRecord?: ProjectDataRecord | null;
  records: ProjectDataRecord[];
  onApply: (updates: Array<{ id: string; photo: string }>) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ImageUploadModal({ open, onClose, targetRecord, records, onApply }: ImageUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview]       = useState<string | null>(null);
  const [filename, setFilename]     = useState("");
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [error, setError]           = useState("");
  const fileRef                     = useRef<HTMLInputElement>(null);

  const title = targetRecord
    ? `Upload Photo — ${String(targetRecord["Name"] ?? targetRecord["name"] ?? "Record")}`
    : `Image Upload${records.length > 1 ? " (auto-match)" : ""}`;

  // ── File processing ───────────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    if (!/^image\//i.test(file.type)) {
      setError("Only image files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target!.result as string;
      setPreview(dataUrl);
      setFilename(file.name);
      setError("");

      if (targetRecord) {
        setMatchedIds([targetRecord.id]);
        return;
      }

      // Auto-match by filename, admission number, name
      const baseName = file.name.replace(/\.[^.]+$/, "").toLowerCase().trim();
      const matched: string[] = [];

      for (const rec of records) {
        const schoolCode = String(rec["School Code"] ?? rec["schoolCode"] ?? "").trim();
        const admNo = String(rec["Admission Number"] ?? rec["admissionNumber"] ?? "").trim();
        const name = String(rec["Name"] ?? rec["name"] ?? "").toLowerCase().trim();

        if (schoolCode && admNo) {
          const prefix = `${schoolCode}_${admNo}_`.toLowerCase();
          if (baseName.startsWith(prefix)) { matched.push(rec.id); continue; }
        }
        if (name && (name === baseName || baseName.startsWith(name) || name.startsWith(baseName))) {
          matched.push(rec.id); continue;
        }
        // Token match
        if (name) {
          const segs = baseName.split("_").filter(Boolean);
          const tokens = name.split(/\s+/);
          if (tokens.length > 0 && tokens.every((t) => segs.includes(t))) {
            matched.push(rec.id); continue;
          }
        }
      }

      setMatchedIds(matched);
      if (!matched.length) setError("No matching record found for this filename.");
    };
    reader.readAsDataURL(file);
  }, [targetRecord, records]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  // ── Apply ─────────────────────────────────────────────────────────────────

  const handleApply = () => {
    if (!preview || !matchedIds.length) return;
    onApply(matchedIds.map((id) => ({ id, photo: preview })));
    handleClose();
  };

  const handleClose = () => {
    setPreview(null);
    setFilename("");
    setMatchedIds([]);
    setError("");
    onClose();
  };

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-indigo-900/30 to-gray-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
              <ImageIcon className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">{title}</h2>
              <p className="text-gray-400 text-xs mt-0.5">JPEG, PNG, WEBP supported</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Drop zone / preview */}
          <div
            className={`relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer overflow-hidden ${
              isDragging
                ? "border-indigo-500 bg-indigo-500/10"
                : preview
                ? "border-indigo-500/40"
                : "border-white/10 bg-white/5 hover:border-indigo-500/40 hover:bg-white/8"
            }`}
            style={{ minHeight: 180 }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !preview && fileRef.current?.click()}
          >
            {preview ? (
              <div className="relative group">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full max-h-64 object-contain bg-black/30"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); setPreview(null); setFilename(""); setMatchedIds([]); setError(""); }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                  <p className="text-xs text-gray-300 truncate">{filename}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Upload className="h-8 w-8 text-gray-500" />
                <div className="text-center">
                  <p className="text-white text-sm font-medium">Drop image here</p>
                  <p className="text-gray-500 text-xs mt-1">or click to browse</p>
                </div>
              </div>
            )}
          </div>

          {/* Match result */}
          {preview && matchedIds.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-300">
                Matched {matchedIds.length > 1 ? `${matchedIds.length} records` : "1 record"} by filename
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300">{error}</p>
                {!matchedIds.length && preview && (
                  <p className="text-xs text-red-400/70 mt-1">
                    Tip: Rename the file to match the student's name or admission number.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-gray-900/50 flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-sm font-medium transition-all"
          >
            <Upload className="h-3.5 w-3.5" /> Browse
          </button>
          <button
            onClick={handleApply}
            disabled={!preview || !matchedIds.length}
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="h-3.5 w-3.5" /> Apply Photo
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
