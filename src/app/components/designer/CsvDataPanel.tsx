/**
 * CsvDataPanel.tsx
 * Right-sidebar panel for CSV upload, field listing, and row-preview navigation.
 * Integrates with the Designer Studio variable data binding system.
 */

import { useRef, useState } from "react";
import {
  Upload, FileText, X, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Download, Database,
  Eye, RefreshCw,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../ui/tooltip";
import {
  parseCsvFile, parseCsvString, SAMPLE_CSV,
  type CsvField, type CsvRow, type ParsedCsv,
} from "../../../lib/csvBinding";

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldTypeChip({ type }: { type: CsvField["type"] }) {
  if (type === "image") {
    return (
      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 shrink-0">
        IMG
      </span>
    );
  }
  if (type === "barcode") {
    return (
      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
        BAR
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 shrink-0">
      TXT
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CsvDataPanelProps {
  /** Called when CSV is loaded / cleared. */
  onCsvChange: (csv: ParsedCsv | null) => void;
  /** Called when the user wants to preview a specific row on canvas. */
  onPreviewRow: (row: CsvRow, index: number) => void;
  /** Called when preview mode should be exited (reset to template). */
  onExitPreview: () => void;
  /** Called to trigger bulk export for all rows. */
  onBulkExport: (rows: CsvRow[], format: "png" | "pdf") => void;
  /** The currently loaded CSV (controlled). */
  csv: ParsedCsv | null;
  /** Current preview row index (-1 means no preview). */
  previewRowIndex: number;
  /** Whether currently rendering (disables buttons). */
  isRendering: boolean;
  /** Drag a variable onto the canvas */
  onAddField: (fieldKey: string, fieldType?: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CsvDataPanel({
  onCsvChange,
  onPreviewRow,
  onExitPreview,
  onBulkExport,
  csv,
  previewRowIndex,
  isRendering,
  onAddField,
}: CsvDataPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [bulkFormat, setBulkFormat] = useState<"png" | "pdf">("png");

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please select a .csv file.");
      return;
    }
    const parsed = await parseCsvFile(file);
    onCsvChange(parsed);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleLoadSample = () => {
    const parsed = parseCsvString(SAMPLE_CSV, "sample_students.csv");
    onCsvChange(parsed);
  };

  const handleClear = () => {
    onCsvChange(null);
    onExitPreview();
  };

  const goToRow = (idx: number) => {
    if (!csv || idx < 0 || idx >= csv.rows.length) return;
    onPreviewRow(csv.rows[idx], idx);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0 h-full">

      {/* ── Header ── */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          CSV Variable Data
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
          Upload a CSV to bind dynamic data to template variables.
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 pb-4 space-y-4">

          {/* ── Upload zone ── */}
          {!csv ? (
            <div
              className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/50 hover:bg-muted/50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-7 w-7 text-muted-foreground/50" />
              <div>
                <p className="text-xs font-medium">Drop CSV or click to upload</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  First row must be the header row
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          ) : (
            /* ── Loaded CSV header ── */
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{csv.fileName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {csv.rows.length} rows · {csv.fields.length} fields
                </p>
              </div>
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleClear}
                      className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">Remove CSV</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* ── Parse errors ── */}
          {csv?.errors && csv.errors.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                {csv.errors.slice(0, 3).map((err, i) => (
                  <p key={i} className="text-[10px] text-amber-700 dark:text-amber-300 leading-snug">{err}</p>
                ))}
              </div>
            </div>
          )}

          {/* ── CSV Fields (variable list) ── */}
          {csv && csv.fields.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Variables from CSV
                </p>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                  {csv.fields.length}
                </Badge>
              </div>

              <div className="space-y-1">
                {csv.fields.map((field) => (
                  <button
                    key={field.key}
                    draggable
                    onClick={() => onAddField(field.key, field.type)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          type: "dynamic-field",
                          fieldKey: field.key,
                          fieldType: field.type,
                          label: field.label,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-border/80 bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <FieldTypeChip type={field.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-4 truncate">{field.label}</p>
                      <p className="text-[10px] text-muted-foreground">{`{{${field.key}}}`}</p>
                    </div>
                    {/* Show sample value from first row */}
                    {csv.rows[0]?.[field.key] && (
                      <span className="text-[9px] text-muted-foreground/70 truncate max-w-[52px] shrink-0 text-right leading-tight hidden sm:block">
                        {csv.rows[0][field.key].slice(0, 14)}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground/70">
                Click to add · Drag onto canvas to bind
              </p>
            </div>
          )}

          {csv && csv.rows.length > 0 && (
            <>
              <Separator />

              {/* ── Row Preview Navigator ── */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview Data
                </p>

                {/* Row navigator */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={previewRowIndex <= 0 || isRendering}
                    onClick={() => goToRow(previewRowIndex - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>

                  <div className="flex-1 text-center">
                    <p className="text-xs font-medium">
                      {previewRowIndex < 0 ? "—" : `Row ${previewRowIndex + 1}`}
                      <span className="text-muted-foreground"> / {csv.rows.length}</span>
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={previewRowIndex >= csv.rows.length - 1 || isRendering}
                    onClick={() => goToRow(previewRowIndex + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Preview / Reset buttons */}
                <div className="flex gap-1.5">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 flex-1 text-xs gap-1"
                    disabled={isRendering || csv.rows.length === 0}
                    onClick={() => goToRow(Math.max(0, previewRowIndex))}
                  >
                    {isRendering ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {previewRowIndex < 0 ? "Preview Row 1" : "Re-render"}
                  </Button>

                  {previewRowIndex >= 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs gap-1"
                      onClick={onExitPreview}
                    >
                      <X className="h-3.5 w-3.5" />
                      Reset
                    </Button>
                  )}
                </div>

                {/* Show current row values */}
                {previewRowIndex >= 0 && csv.rows[previewRowIndex] && (
                  <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Row {previewRowIndex + 1} values
                    </p>
                    {csv.fields.slice(0, 6).map((f) => (
                      <div key={f.key} className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[10px] text-muted-foreground shrink-0 w-16 truncate">{f.label}:</span>
                        <span className="text-[10px] font-medium truncate flex-1">
                          {csv.rows[previewRowIndex][f.key] || <em className="opacity-40">empty</em>}
                        </span>
                      </div>
                    ))}
                    {csv.fields.length > 6 && (
                      <p className="text-[10px] text-muted-foreground/50">
                        +{csv.fields.length - 6} more fields…
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* ── Bulk Export ── */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bulk Export
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Generate one file per CSV row.
                </p>

                <div className="flex items-center gap-1.5 rounded-md border p-1">
                  {(["png", "pdf"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setBulkFormat(fmt)}
                      className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                        bulkFormat === fmt
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>

                <Button
                  variant="default"
                  size="sm"
                  className="h-7 w-full text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isRendering || csv.rows.length === 0}
                  onClick={() => onBulkExport(csv.rows, bulkFormat)}
                >
                  {isRendering ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Export {csv.rows.length} {bulkFormat.toUpperCase()}s
                </Button>
              </div>
            </>
          )}

          {/* ── Sample CSV helper ── */}
          {!csv && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sample CSV format
                </p>
                <div className="rounded-md border bg-muted/40 p-2 overflow-x-auto">
                  <pre className="text-[9px] font-mono text-muted-foreground whitespace-pre leading-4">
{`name,roll_no,class,photo
Aanya,101,10-A,https://…
Rohan,102,10-B,https://…`}
                  </pre>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full text-xs gap-1"
                  onClick={handleLoadSample}
                >
                  <Database className="h-3.5 w-3.5" />
                  Load Sample CSV
                </Button>
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  Image fields: include URLs. Photo/avatar/image keys are auto-detected.
                </p>
              </div>
            </>
          )}

          {/* ── Validation status ── */}
          {csv && csv.fields.length > 0 && csv.errors.length === 0 && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                CSV loaded — {csv.rows.length} records ready
              </p>
            </div>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
