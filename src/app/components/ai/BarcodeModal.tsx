/**
 * BarcodeModal — Generate barcodes / QR codes for student records
 *
 * Dark-theme glassmorphism dialog.
 * - Select field to encode (admission number, student ID, etc.)
 * - Choose type: Code128, QR, EAN-13
 * - Preview live barcode for first record
 * - Bulk generate → save to student records
 * - Export individual barcodes as PNG
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  QrCode, Loader2, CheckCircle2, AlertCircle, X, Download, Zap,
} from "lucide-react";
import { generateBarcodes, type BarcodeType, type BarcodeResponse } from "../../../lib/aiImageService";
import type { ProjectDataRecord, ProjectDataField } from "../../../lib/projectStore";

// ── Props ──────────────────────────────────────────────────────────────────────

interface BarcodeModalProps {
  open: boolean;
  onClose: () => void;
  records: ProjectDataRecord[];
  fields: ProjectDataField[];
  selectedIds: Set<string>;
  onApply: (updates: Array<{ id: string; barcode: string }>) => void;
}

// ── Barcode type options ───────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: BarcodeType; label: string; desc: string }[] = [
  { value: "code128", label: "Code128", desc: "Universal linear barcode — recommended" },
  { value: "qr",      label: "QR Code", desc: "2D matrix — stores long strings & URLs" },
  { value: "ean13",   label: "EAN-13",  desc: "Retail standard — requires 12 digits" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function BarcodeModal({
  open, onClose, records, fields, selectedIds, onApply,
}: BarcodeModalProps) {
  const [fieldKey, setFieldKey]     = useState(fields[0]?.key ?? "");
  const [bcType, setBcType]         = useState<BarcodeType>("code128");
  const [width, setWidth]           = useState(300);
  const [height, setHeight]         = useState(bcType === "qr" ? 300 : 100);
  const [status, setStatus]         = useState<"idle" | "processing" | "done" | "error">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress]     = useState(0);
  const [errorMsg, setErrorMsg]     = useState("");
  const [result, setResult]         = useState<BarcodeResponse | null>(null);
  const previewTimeout              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targets = selectedIds.size > 0
    ? records.filter((r) => selectedIds.has(r.id))
    : records;

  const count = targets.length;

  // ── Auto-update height when switching to QR ────────────────────────────────
  useEffect(() => {
    if (bcType === "qr") setHeight(width);
  }, [bcType, width]);

  // ── Live preview (debounced) ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || !fieldKey || !targets.length) { setPreviewUrl(null); return; }

    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(async () => {
      try {
        const first = targets[0];
        const val = String(first[fieldKey] ?? first.id ?? "");
        if (!val) return;
        const res = await generateBarcodes(
          [{ record_id: first.id, value: val }],
          bcType,
          width,
          height,
        );
        if (res.results[0]?.success && res.results[0].data_url) {
          setPreviewUrl(res.results[0].data_url);
        }
      } catch { /* silent on preview failures */ }
    }, 600);

    return () => { if (previewTimeout.current) clearTimeout(previewTimeout.current); };
  }, [open, fieldKey, bcType, width, height, targets]);

  // ── Generate all ──────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!count || !fieldKey) return;
    setStatus("processing");
    setProgress(0);
    setErrorMsg("");

    // Split into chunks of 100 to show progress feedback
    const CHUNK = 100;
    const allUpdates: Array<{ id: string; barcode: string }> = [];
    let failed = 0;

    try {
      for (let i = 0; i < targets.length; i += CHUNK) {
        const chunk = targets.slice(i, i + CHUNK);
        const items = chunk.map((r) => ({
          record_id: r.id,
          value: String(r[fieldKey] ?? r.id ?? ""),
          label: String(r["Name"] ?? r["name"] ?? ""),
        }));

        const res = await generateBarcodes(items, bcType, width, height);
        failed += res.failed;

        res.results.forEach((r) => {
          if (r.success && r.data_url) {
            allUpdates.push({ id: r.record_id, barcode: r.data_url });
          }
        });

        setProgress(Math.round(((i + chunk.length) / targets.length) * 100));
      }

      setResult({
        total: targets.length,
        processed: allUpdates.length,
        failed,
        results: [],
      });

      onApply(allUpdates);
      setStatus("done");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Generation failed");
      setStatus("error");
    }
  }, [targets, fieldKey, bcType, width, height, count, onApply]);

  const handleClose = () => {
    setStatus("idle");
    setPreviewUrl(null);
    setErrorMsg("");
    setResult(null);
    setProgress(0);
    onClose();
  };

  const handleDownloadPreview = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `barcode_preview.png`;
    a.click();
  };

  if (!open) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-amber-900/30 to-gray-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
              <QrCode className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base">Generate Barcode / QR</h2>
              <p className="text-gray-400 text-xs mt-0.5">
                {count} record{count !== 1 ? "s" : ""} selected
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Field selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
              Encode Field
            </label>
            <select
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 appearance-none"
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
              Barcode Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setBcType(t.value)}
                  title={t.desc}
                  className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all duration-200 ${
                    bcType === t.value
                      ? "bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-500/20"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                Width (px)
              </label>
              <input
                type="number"
                value={width}
                min={100} max={800}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
              />
            </div>
            {bcType !== "qr" && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                  Height (px)
                </label>
                <input
                  type="number"
                  value={height}
                  min={40} max={400}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            )}
          </div>

          {/* Live preview */}
          {previewUrl && (
            <div className="rounded-xl border border-white/10 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">Live preview — first record</p>
                <button
                  onClick={handleDownloadPreview}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <Download className="h-3 w-3" /> Download
                </button>
              </div>
              <div className="flex justify-center">
                <img
                  src={previewUrl}
                  alt="Barcode preview"
                  className="max-h-24 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            </div>
          )}

          {/* Progress */}
          {status === "processing" && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                  Generating {count} barcodes…
                </span>
                <span className="text-amber-400 font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done */}
          {status === "done" && result && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-300">
                <p className="font-medium">Generated {result.processed} barcodes!</p>
                {result.failed > 0 && (
                  <p className="text-xs text-emerald-400/80 mt-0.5">{result.failed} failed — check console.</p>
                )}
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-gray-900/50 flex items-center gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-sm font-medium transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!count || !fieldKey || status === "processing"}
            className="flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === "processing"
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              : <><Zap className="h-3.5 w-3.5" /> Generate {count} Barcode{count !== 1 ? "s" : ""}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
