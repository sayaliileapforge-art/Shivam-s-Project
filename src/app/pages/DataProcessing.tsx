import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, CheckCircle, AlertCircle, AlertTriangle,
  Download, RefreshCw, ArrowRight, ArrowLeft, Database, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { saveImportBatch } from "../../lib/importStore";
import type { ImportedRecord } from "../../lib/importStore";
import {
  CORE_IMPORT_FIELDS,
  SKIP_MAPPING_VALUE,
  autoMap,
  buildProjectFields,
  getDuplicateMappedColumns,
  getSelectableHeaders,
  getVisiblePreviewFields,
  isMappedColumn,
  isSkippedColumn,
  mapRowToRecord,
  normalizeMapping,
  validateMapping,
  type ImportSystemField,
} from "../../lib/importMapping";

type Step = "upload" | "mapping" | "preview" | "done";

function isValidPhone(val: string | undefined): boolean {
  if (!val) return false;
  return /^\+?\d{7,15}$/.test(val.replace(/[\s\-()]/g, ""));
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DataProcessing() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");

  // Parsed file state
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);   // ALL rows
  const [mapping, setMapping] = useState<Record<string, string>>({}); // fieldKey → excelHeader
  const [errors, setErrors] = useState<string[]>([]);
  const [importDone, setImportDone] = useState<{ count: number; dupes: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // ── File parsing ─────────────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    setErrors([]);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      setErrors(["Unsupported file format. Please upload .xlsx, .xls, or .csv"]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

        if (json.length === 0) {
          setErrors(["The file appears to be empty."]);
          return;
        }

        const detectedHeaders = Object.keys(json[0]);
        const stringRows = json.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k, String(v ?? "")])
          )
        ) as Record<string, string>[];

        setFilename(file.name);
        setHeaders(detectedHeaders);
        setRows(stringRows);
        const allFields = buildProjectFields(detectedHeaders);
        setMapping(autoMap(detectedHeaders, allFields));
        setStep("mapping");
      } catch {
        setErrors(["Failed to parse the file. Make sure it is a valid Excel or CSV."]);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  // ── Derived data ──────────────────────────────────────────────────────────
  const previewRows = rows.slice(0, 10);
  const projectFields = useMemo<ImportSystemField[]>(() => buildProjectFields(headers), [headers]);

  // Mapped records (full dataset)
  const mappedRecords = useMemo<ImportedRecord[]>(() => {
    return rows.map((row, i) => {
      const rec: ImportedRecord = { id: `IMP-${Date.now()}-${i}` };
      Object.assign(rec, mapRowToRecord(row, projectFields, mapping));
      return rec;
    });
  }, [rows, mapping, projectFields]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = (): string[] => {
    const errs = validateMapping(projectFields, mapping);

    if (errs.length) return errs;

    // Per-record validation
    let invalidPhones = 0;
    for (const rec of mappedRecords) {
      if (rec.fatherMobile && !isValidPhone(rec.fatherMobile)) invalidPhones++;
      if (rec.fatherWhatsapp && !isValidPhone(rec.fatherWhatsapp)) invalidPhones++;
    }
    if (invalidPhones > 0) errs.push(`${invalidPhones} record(s) have invalid phone numbers.`);

    return errs;
  };

  // Duplicate detection (phone OR rollNo)
  const duplicateCount = useMemo(() => {
    const seenPhone = new Set<string>();
    const seenAdmission = new Set<string>();
    const seenRoll = new Set<string>();
    let dupes = 0;
    for (const rec of mappedRecords) {
      const p = rec.fatherMobile?.trim();
      const a = rec.admissionNo?.trim();
      const r = rec.rollNo?.trim();
      if (p && seenPhone.has(p)) { dupes++; continue; }
      if (a && seenAdmission.has(a)) { dupes++; continue; }
      if (r && seenRoll.has(r)) { dupes++; continue; }
      if (p) seenPhone.add(p);
      if (a) seenAdmission.add(a);
      if (r) seenRoll.add(r);
    }
    return dupes;
  }, [mappedRecords]);

  // Mapping completeness
  const unmappedRequired = projectFields.filter(
    (f) => f.required && !isMappedColumn(mapping[f.key])
  );
  const duplicateMappedColumns = getDuplicateMappedColumns(mapping);
  const visiblePreviewFields = useMemo(
    () => getVisiblePreviewFields(projectFields, mappedRecords as Array<Record<string, unknown>>, mapping),
    [projectFields, mappedRecords, mapping]
  );
  const mappedColumnCount = projectFields.filter((f) => isMappedColumn(mapping[f.key])).length;

  // ── Sample value helper ───────────────────────────────────────────────────
  const sampleValue = (excelCol: string) => rows[0]?.[excelCol] ?? "–";

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = () => {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }

    saveImportBatch({
      id: `BATCH-${Date.now()}`,
      filename,
      importedAt: new Date().toLocaleString("en-IN"),
      recordCount: mappedRecords.length,
      records: mappedRecords,
    });

    setImportDone({ count: mappedRecords.length, dupes: duplicateCount });
    setStep("done");
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = () => {
    setStep("upload");
    setFilename("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setErrors([]);
    setImportDone(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Download template ────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      CORE_IMPORT_FIELDS.map((f) => f.label),
      CORE_IMPORT_FIELDS.map((f) => (f.required ? "REQUIRED" : "optional")),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "import_template.xlsx");
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Bulk Data Import</h1>
          <p className="text-muted-foreground mt-1">
            Upload an Excel or CSV file and map columns to import records.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Download Template
          </Button>
          {step !== "upload" && (
            <Button variant="outline" className="gap-2" onClick={reset}>
              <RefreshCw className="h-4 w-4" /> Start New
            </Button>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <StepBar step={step} />

      {/* Errors / warnings banner */}
      {errors.length > 0 && (
        <Card className="border-destructive/60 bg-destructive/5">
          <CardContent className="p-4 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" /> {e}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── STEP 1: Upload ──────────────────────────────────────────────────── */}
      {step === "upload" && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-success" />
              Upload File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors
                ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary hover:bg-muted/40"}`}
            >
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-1">Drag & drop or click to upload</p>
              <p className="text-sm text-muted-foreground">.xlsx, .xls, or .csv files supported</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
            />
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Column Mapping ───────────────────────────────────────────── */}
      {step === "mapping" && (
        <div className="space-y-4">
          {/* Success banner */}
          <Card className="border-success/60 bg-success/5">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="font-medium text-success">File loaded successfully</p>
                <p className="text-sm text-muted-foreground">
                  {filename} — {rows.length} records ready to be mapped
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Column Mapping</CardTitle>
                <Badge variant="outline">
                  {mappedColumnCount}/{projectFields.length} fields mapped
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Project Field</TableHead>
                    <TableHead>Excel Column</TableHead>
                    <TableHead className="text-muted-foreground">Sample Data</TableHead>
                    <TableHead className="w-[100px] text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectFields.map((field) => {
                    const selected = mapping[field.key];
                    const sample = selected ? sampleValue(selected) : null;
                    const isMapped = !!selected;
                    const selectableHeaders = getSelectableHeaders(headers, mapping, field.key);
                    const admissionMapped = isMappedColumn(mapping.admissionNo);
                    const rollMapped = isMappedColumn(mapping.rollNo);
                    const fieldLocked =
                      (field.key === "rollNo" && admissionMapped && !isMappedColumn(mapping.rollNo))
                      || (field.key === "admissionNo" && rollMapped && !isMappedColumn(mapping.admissionNo));
                    return (
                      <TableRow key={field.key}>
                        <TableCell className="font-medium">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <Select
                            value={mapping[field.key] ?? "__none__"}
                            disabled={fieldLocked}
                            onValueChange={(v) =>
                              setMapping((prev) => {
                                const next = { ...prev };
                                if (v === SKIP_MAPPING_VALUE) {
                                  next[field.key] = SKIP_MAPPING_VALUE;
                                } else if (v === "__none__") {
                                  delete next[field.key];
                                } else {
                                  next[field.key] = v;
                                }

                                if (field.key === "admissionNo" && isMappedColumn(next.admissionNo)) {
                                  delete next.rollNo;
                                }
                                if (field.key === "rollNo" && isMappedColumn(next.rollNo)) {
                                  delete next.admissionNo;
                                }

                                return normalizeMapping(next, projectFields);
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" className="text-muted-foreground text-xs">
                                — Select column —
                              </SelectItem>
                              <SelectItem value={SKIP_MAPPING_VALUE} className="text-muted-foreground text-xs">
                                — Skip this field —
                              </SelectItem>
                              {selectableHeaders.map((h) => (
                                <SelectItem key={h} value={h} className="text-sm">
                                  {h}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {selected && isMappedColumn(selected)
                            ? sample
                            : selected && isSkippedColumn(selected)
                              ? <span className="italic">Skipped</span>
                              : <span className="italic">No mapping</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isMapped && isMappedColumn(selected) ? (
                            <CheckCircle className="h-4 w-4 text-success mx-auto" />
                          ) : selected && isSkippedColumn(selected) ? (
                            <span className="text-xs text-muted-foreground">skipped</span>
                          ) : fieldLocked ? (
                            <span className="text-xs text-muted-foreground">auto</span>
                          ) : field.required ? (
                            <AlertCircle className="h-4 w-4 text-destructive mx-auto" />
                          ) : (
                            <span className="text-xs text-muted-foreground">optional</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {unmappedRequired.length > 0 && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Map all required (*) fields before continuing.
            </p>
          )}

          {duplicateMappedColumns.length > 0 && (
            <Card className="border-warning/60 bg-warning/5">
              <CardContent className="p-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <p className="text-sm text-warning">
                  <strong>Duplicate column selections found:</strong> {duplicateMappedColumns.join(", ")}.
                </p>
              </CardContent>
            </Card>
          )}

          {duplicateCount > 0 && (
            <Card className="border-warning/60 bg-warning/5">
              <CardContent className="p-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <p className="text-sm text-warning">
                  <strong>{duplicateCount} duplicate(s)</strong> detected by father mobile/admission/roll.
                  They will still be imported but flagged.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={reset}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="gap-2"
              disabled={unmappedRequired.length > 0 || duplicateMappedColumns.length > 0}
              onClick={() => { setErrors([]); setStep("preview"); }}
            >
              Preview Data <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Preview ──────────────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" /> Data Preview (first 10 rows)
                </CardTitle>
                <Badge variant="secondary">{rows.length} total records</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      {visiblePreviewFields.map((f) => (
                        <TableHead key={f.key}>
                          {f.label}
                          {f.required && <span className="text-destructive ml-1">*</span>}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        {visiblePreviewFields.map((f) => {
                          const val = row[mapping[f.key]] ?? "";
                          const invalid =
                            (f.key === "fatherMobile" || f.key === "fatherWhatsapp") &&
                            val && !isValidPhone(val);
                          return (
                            <TableCell key={f.key}>
                              <span className={invalid ? "text-destructive" : ""}>{val || "–"}</span>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {duplicateCount > 0 && (
            <Card className="border-warning/60 bg-warning/5">
              <CardContent className="p-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                <p className="text-sm text-warning">
                  <strong>{duplicateCount} duplicate(s)</strong> detected by father mobile/admission/roll.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" className="gap-2" onClick={() => setStep("mapping")}>
              <ArrowLeft className="h-4 w-4" /> Back to Mapping
            </Button>
            <Button className="gap-2" onClick={handleImport}>
              <Database className="h-4 w-4" /> Import {rows.length} Records
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ─────────────────────────────────────────────────────── */}
      {step === "done" && importDone && (
        <Card className="shadow-md">
          <CardContent className="p-12 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-success mx-auto" />
            <h2 className="text-2xl font-semibold">Import Complete!</h2>
            <p className="text-muted-foreground">
              <strong>{importDone.count}</strong> records imported from{" "}
              <span className="font-medium">{filename}</span>.
            </p>
            {importDone.dupes > 0 && (
              <Badge variant="outline" className="text-warning border-warning">
                {importDone.dupes} duplicates detected
              </Badge>
            )}
            <Separator />
            <Button onClick={reset} className="gap-2 mt-2">
              <RefreshCw className="h-4 w-4" /> Import Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Step bar component ───────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  const steps: { key: Step; label: string; sub: string }[] = [
    { key: "upload",  label: "Upload File",     sub: "Excel / CSV" },
    { key: "mapping", label: "Column Mapping",  sub: "Map fields" },
    { key: "preview", label: "Preview",         sub: "Verify data" },
    { key: "done",    label: "Import",          sub: "Complete" },
  ];
  const idx = steps.findIndex((s) => s.key === step);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors
                    ${i < idx ? "bg-success text-white" : i === idx ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {i < idx ? <CheckCircle className="h-4 w-4" /> : i + 1}
                </div>
                <div className="hidden sm:block">
                  <p className={`text-sm font-medium ${i === idx ? "text-primary" : i < idx ? "text-success" : "text-muted-foreground"}`}>
                    {s.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.sub}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-1 mx-3 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${i < idx ? "w-full bg-success" : "w-0"}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
