/**
 * RuleBuilderWorkflow.tsx
 * Full-page 3-step Rule Builder wizard.
 * Route: /projects/:id/rule-builder?templateId=xxx&ruleId=xxx
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router";
import { nanoid } from "nanoid";
import {
  ArrowLeft, Plus, Trash2, ChevronRight, ChevronLeft,
  Upload, CheckCircle2, AlertTriangle, Sparkles, Wand2,
  Eye, EyeOff, Save, RotateCcw, Info, GripVertical,
  FileSpreadsheet, Layers, Settings2, ListFilter, Play, Loader2,
} from "lucide-react";

import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../components/ui/tooltip";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";

import { parseCsvFile, type ParsedCsv, type CsvRow } from "../../lib/csvBinding";
import { API_BASE, resolveProfileImageUrl } from "../../lib/apiService";
import { mapTemplateRecordToProjectTemplate, type TemplateRecord } from "../../lib/templateApi";
import { DESIGNER_CONTEXT_KEY } from "../../lib/fabricUtils";
import { type ProjectTemplate } from "../../lib/projectStore";
import {
  createRule, updateRule, getRuleById,
  autoMapFields, extractTemplateFields, applyMappings, filterRowsByRule,
  CONDITION_OPERATOR_LABELS,
  type Condition, type ConditionGroup, type FieldMapping, type PrintRule,
  type ConditionOperator,
} from "../../lib/ruleBuilderApi";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

type PreviewTemplateOption = ProjectTemplate & { isGlobal?: boolean; _id?: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: 1, label: "Upload CSV", icon: <FileSpreadsheet className="h-4 w-4" /> },
  { id: 2, label: "Rule Builder", icon: <Settings2 className="h-4 w-4" /> },
  { id: 3, label: "Preview & Generate", icon: <Play className="h-4 w-4" /> },
];

const OPERATORS: ConditionOperator[] = [
  "equals", "not_equals", "contains", "not_contains",
  "starts_with", "ends_with", "is_empty", "is_not_empty",
];

const VALUE_LESS_OPERATORS: ConditionOperator[] = ["is_empty", "is_not_empty"];

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ current, completed }: { current: Step; completed: Set<Step> }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold border-2 transition-all ${
                current === step.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : completed.has(step.id)
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-muted bg-muted text-muted-foreground"
              }`}
            >
              {completed.has(step.id) && current !== step.id ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                step.id
              )}
            </div>
            <span
              className={`hidden sm:block text-sm font-medium ${
                current === step.id
                  ? "text-foreground"
                  : completed.has(step.id)
                  ? "text-emerald-600"
                  : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={`mx-3 h-px w-12 sm:w-20 transition-colors ${
                completed.has(step.id) ? "bg-emerald-400" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Upload CSV ───────────────────────────────────────────────────────

function StepUploadCsv({
  csv,
  onCsvLoaded,
}: {
  csv: ParsedCsv | null;
  onCsvLoaded: (csv: ParsedCsv) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDrag, setIsDrag] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    setLoading(true);
    try {
      const parsed = await parseCsvFile(file);
      onCsvLoaded(parsed);
      toast.success(`CSV loaded: ${parsed.rows.length} records, ${parsed.fields.length} columns`);
    } catch {
      toast.error("Failed to parse CSV");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Upload zone */}
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-all cursor-pointer ${
          isDrag
            ? "border-primary bg-primary/5"
            : csv
            ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20"
            : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDrag(true); }}
        onDragLeave={() => setIsDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        {loading ? (
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        ) : csv ? (
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
        ) : (
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
        )}

        <h3 className="text-lg font-semibold mb-1">
          {csv ? csv.fileName : "Upload CSV Data File"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {csv
            ? `${csv.rows.length} records · ${csv.fields.length} columns`
            : "Drag & drop your CSV file here, or click to browse"}
        </p>

        {csv && (
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Replace file
          </Button>
        )}
      </div>

      {/* Preview table */}
      {csv && csv.rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Data Preview</CardTitle>
              <Badge variant="secondary">{csv.rows.length} records</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {csv.fields.map((f) => (
                      <th key={f.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              f.type === "image" ? "bg-sky-400" : f.type === "barcode" ? "bg-emerald-400" : "bg-violet-400"
                            }`}
                          />
                          {f.label}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csv.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      {csv.fields.map((f) => (
                        <td key={f.key} className="px-3 py-2 max-w-[160px] truncate">
                          {f.type === "image" && row[f.key] ? (
                            <span className="text-sky-600 font-mono">{row[f.key]}</span>
                          ) : (
                            row[f.key] || <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csv.rows.length > 5 && (
                <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                  +{csv.rows.length - 5} more rows
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CSV errors */}
      {csv?.errors && csv.errors.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">CSV warnings</p>
            {csv.errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Condition Row ────────────────────────────────────────────────────────────

function ConditionRow({
  condition,
  csvColumns,
  csvRows,
  onChange,
  onRemove,
}: {
  condition: Condition;
  csvColumns: string[];
  csvRows: CsvRow[];
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  // Unique values for the selected field (used for value dropdown)
  const uniqueValues = useMemo(() => {
    if (!condition.field || !csvRows.length) return [];
    const vals = new Set<string>();
    for (const row of csvRows) {
      const v = (row[condition.field] ?? "").trim();
      if (v) vals.add(v);
      if (vals.size >= 100) break;
    }
    return Array.from(vals).sort();
  }, [condition.field, csvRows]);

  const needsValue = !VALUE_LESS_OPERATORS.includes(condition.operator);

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 hidden sm:block" />

      {/* Field selector */}
      <Select
        value={condition.field}
        onValueChange={(v) => onChange({ ...condition, field: v, value: "" })}
      >
        <SelectTrigger className="h-9 min-w-[140px] flex-1 text-sm">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {csvColumns.map((col) => (
            <SelectItem key={col} value={col}>{col}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select
        value={condition.operator}
        onValueChange={(v) => onChange({ ...condition, operator: v as ConditionOperator })}
      >
        <SelectTrigger className="h-9 w-[150px] flex-shrink-0 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op} value={op}>{CONDITION_OPERATOR_LABELS[op]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value — combobox seeded with CSV values */}
      {needsValue && (
        <Select
          value={condition.value}
          onValueChange={(v) => onChange({ ...condition, value: v })}
        >
          <SelectTrigger className="h-9 min-w-[140px] flex-1 text-sm">
            <SelectValue placeholder="Select or type value" />
          </SelectTrigger>
          <SelectContent>
            {uniqueValues.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
            {condition.value && !uniqueValues.includes(condition.value) && (
              <SelectItem value={condition.value}>{condition.value}</SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
      {!needsValue && <div className="flex-1" />}

      <button
        onClick={onRemove}
        className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Field Mapping Table ──────────────────────────────────────────────────────

function FieldMappingTable({
  mappings,
  csvColumns,
  csvRows,
  onChange,
}: {
  mappings: FieldMapping[];
  csvColumns: string[];
  csvRows: CsvRow[];
  onChange: (m: FieldMapping[]) => void;
}) {
  const mappedCount = mappings.filter((m) => m.csvColumn).length;
  const sampleRow = csvRows[0] ?? {};

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Field Mapping</h3>
          <Badge
            variant={mappedCount === mappings.length ? "default" : "secondary"}
            className="text-xs"
          >
            {mappedCount}/{mappings.length} Mapped
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1"
          onClick={() => onChange(autoMapFields(mappings.map((m) => m.templateField), csvColumns))}
        >
          <Wand2 className="h-3 w-3" />
          Auto Map
        </Button>
      </div>

      {mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No variable fields detected in this template.
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-6"></th>
                <th className="px-3 py-2 text-left font-medium">Template Field</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Field Type</th>
                <th className="px-3 py-2 text-left font-medium">CSV Column</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Sample Data</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m, idx) => {
                const sampleValue = m.csvColumn ? (sampleRow[m.csvColumn] ?? "") : "";
                const isMapped = Boolean(m.csvColumn);
                return (
                  <tr key={m.templateField} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold ${
                          m.fieldType === "image"
                            ? "bg-sky-100 text-sky-700"
                            : m.fieldType === "barcode"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        {m.fieldType === "image" ? "IMG" : m.fieldType === "barcode" ? "BAR" : "T"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{m.templateField}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground capitalize">{m.fieldType}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={m.csvColumn || "__none__"}
                        onValueChange={(v) => {
                          const next = [...mappings];
                          next[idx] = { ...m, csvColumn: v === "__none__" ? "" : v };
                          onChange(next);
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm w-full max-w-[200px]">
                          <SelectValue placeholder="— Not mapped —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not mapped —</SelectItem>
                          {csvColumns.map((col) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">
                      {m.fieldType === "image" && sampleValue ? (
                        <span className="text-sky-600">{sampleValue}</span>
                      ) : (
                        sampleValue || <span className="opacity-40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isMapped ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-400 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {mappings.some((m) => !m.csvColumn) && (
            <div className="px-3 py-2 border-t bg-amber-50 dark:bg-amber-950/20 flex items-center gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {mappings.filter((m) => !m.csvColumn).length} field(s) are not mapped.
              <button
                className="underline underline-offset-2 font-medium"
                onClick={() => onChange(autoMapFields(mappings.map((m) => m.templateField), csvColumns))}
              >
                Auto-map now
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Live Template Preview ────────────────────────────────────────────────────

function LiveTemplatePreview({
  template,
  sampleRow,
  mappings,
}: {
  template: PreviewTemplateOption | null;
  sampleRow: CsvRow | null;
  mappings: FieldMapping[];
}) {
  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Layers className="h-10 w-10" />
        <p className="text-sm">No template selected</p>
      </div>
    );
  }

  const resolved = sampleRow ? applyMappings(sampleRow, mappings) : {};
  const thumbUrl = template.thumbnail || "";

  // Try to get student name / photo from mappings
  const getField = (keys: string[]) => {
    for (const k of keys) {
      if (resolved[k]) return resolved[k];
    }
    return "";
  };
  const name = getField(["Student Name", "student_name", "name", "Name", "fullname"]);
  const photoVal = getField(["Photo", "photo", "image", "Image", "avatar", "profilepic"]);
  const photoUrl = photoVal ? resolveProfileImageUrl(photoVal) : "";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-[200px] rounded-lg overflow-hidden border shadow-md bg-white">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={template.templateName}
            className="w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="h-[270px] flex items-center justify-center bg-muted text-muted-foreground text-xs">
            <Layers className="h-8 w-8" />
          </div>
        )}

        {/* Overlay the photo if we have one */}
        {photoUrl && (
          <div className="absolute inset-0 flex items-start justify-center pointer-events-none pt-12">
            <img
              src={photoUrl}
              alt="student"
              className="h-14 w-14 rounded-full object-cover border-2 border-white shadow"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}
      </div>

      <div className="w-full text-sm space-y-1">
        <p className="font-semibold text-center truncate">{template.templateName}</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {template.canvas.width}×{template.canvas.height}mm
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">{template.templateType}</Badge>
          {template.isGlobal && (
            <Badge variant="outline" className="text-xs text-sky-600 border-sky-200">Global</Badge>
          )}
        </div>

        {/* Mapped field sample preview */}
        {sampleRow && (
          <div className="mt-3 rounded-lg border p-2.5 space-y-1 text-xs bg-muted/30">
            <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px] mb-1.5">Sample data</p>
            {mappings.filter((m) => m.csvColumn).slice(0, 6).map((m) => (
              <div key={m.templateField} className="flex gap-2">
                <span className="text-muted-foreground font-medium min-w-[80px] truncate">{m.templateField}:</span>
                <span className="truncate font-medium">{resolved[m.templateField] || resolved[m.csvColumn] || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Rule Builder ─────────────────────────────────────────────────────

function StepRuleBuilder({
  template,
  csv,
  conditionGroups,
  fieldMappings,
  groupOperator,
  isDefault,
  onConditionGroupsChange,
  onFieldMappingsChange,
  onGroupOperatorChange,
  onIsDefaultChange,
  onChangeTemplate,
  matchedCount,
}: {
  template: PreviewTemplateOption | null;
  csv: ParsedCsv | null;
  conditionGroups: ConditionGroup[];
  fieldMappings: FieldMapping[];
  groupOperator: "AND" | "OR";
  isDefault: boolean;
  onConditionGroupsChange: (g: ConditionGroup[]) => void;
  onFieldMappingsChange: (m: FieldMapping[]) => void;
  onGroupOperatorChange: (op: "AND" | "OR") => void;
  onIsDefaultChange: (v: boolean) => void;
  onChangeTemplate: () => void;
  matchedCount: number;
}) {
  const csvColumns = csv?.fields.map((f) => f.key) ?? [];
  const csvRows = csv?.rows ?? [];

  const addConditionGroup = () => {
    onConditionGroupsChange([
      ...conditionGroups,
      { id: nanoid(), operator: "AND", conditions: [] },
    ]);
  };

  const updateGroup = (idx: number, patch: Partial<ConditionGroup>) => {
    const next = conditionGroups.map((g, i) => i === idx ? { ...g, ...patch } : g);
    onConditionGroupsChange(next);
  };

  const removeGroup = (idx: number) => {
    onConditionGroupsChange(conditionGroups.filter((_, i) => i !== idx));
  };

  const addCondition = (groupIdx: number) => {
    const group = conditionGroups[groupIdx];
    const updated: ConditionGroup = {
      ...group,
      conditions: [
        ...group.conditions,
        { id: nanoid(), field: csvColumns[0] ?? "", operator: "equals", value: "" },
      ],
    };
    updateGroup(groupIdx, updated);
  };

  const updateCondition = (groupIdx: number, condIdx: number, patch: Partial<Condition>) => {
    const group = conditionGroups[groupIdx];
    const next = group.conditions.map((c, i) => i === condIdx ? { ...c, ...patch } : c);
    updateGroup(groupIdx, { conditions: next });
  };

  const removeCondition = (groupIdx: number, condIdx: number) => {
    const group = conditionGroups[groupIdx];
    const next = group.conditions.filter((_, i) => i !== condIdx);
    if (next.length === 0 && conditionGroups.length > 1) {
      removeGroup(groupIdx);
    } else {
      updateGroup(groupIdx, { conditions: next });
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
      {/* LEFT – conditions + mapping */}
      <div className="space-y-6 min-w-0">
        {/* Template info bar */}
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Template</span>
              <span className="font-semibold text-sm truncate">
                {template ? template.templateName : "No template"}
              </span>
              {template && (
                <Badge variant="outline" className="text-xs">{template.templateType}</Badge>
              )}
            </div>
            {csv && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">Data Source</span>
                <span className="text-xs font-medium text-emerald-600">{csv.fileName}</span>
                <span className="text-xs text-muted-foreground">{csv.rows.length} records</span>
                <Badge
                  variant={matchedCount > 0 ? "default" : "secondary"}
                  className="text-xs ml-1"
                >
                  {matchedCount} matching
                </Badge>
              </div>
            )}
          </div>
          <Button size="sm" variant="ghost" className="text-xs h-8" onClick={onChangeTemplate}>
            Change Template
          </Button>
        </div>

        {/* Conditions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">1. Conditions</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">All must match</p>
              </div>
              {conditionGroups.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Groups joined by</span>
                  <Select value={groupOperator} onValueChange={(v) => onGroupOperatorChange(v as "AND" | "OR")}>
                    <SelectTrigger className="h-7 w-[70px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">AND</SelectItem>
                      <SelectItem value="OR">OR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {conditionGroups.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">
                No conditions — all records will match this rule.
              </p>
            )}

            {conditionGroups.map((group, groupIdx) => (
              <div key={group.id} className="rounded-lg border p-3 space-y-2.5 bg-muted/20">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Group {groupIdx + 1}
                    </span>
                    {group.conditions.length > 1 && (
                      <Select
                        value={group.operator}
                        onValueChange={(v) => updateGroup(groupIdx, { operator: v as "AND" | "OR" })}
                      >
                        <SelectTrigger className="h-6 w-[60px] text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">AND</SelectItem>
                          <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <button
                    onClick={() => removeGroup(groupIdx)}
                    className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {group.conditions.map((condition, condIdx) => (
                  <div key={condition.id}>
                    {condIdx > 0 && (
                      <div className="flex items-center gap-2 my-1">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-semibold text-muted-foreground px-1">{group.operator}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <ConditionRow
                      condition={condition}
                      csvColumns={csvColumns}
                      csvRows={csvRows}
                      onChange={(c) => updateCondition(groupIdx, condIdx, c)}
                      onRemove={() => removeCondition(groupIdx, condIdx)}
                    />
                  </div>
                ))}

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1 text-muted-foreground"
                  onClick={() => addCondition(groupIdx)}
                  disabled={csvColumns.length === 0}
                >
                  <Plus className="h-3 w-3" />
                  Add Condition
                </Button>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={addConditionGroup}
                disabled={csvColumns.length === 0}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Condition
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                onClick={() => {
                  const g = conditionGroups[conditionGroups.length - 1];
                  if (g) {
                    onConditionGroupsChange([...conditionGroups, { id: nanoid(), operator: "AND", conditions: [] }]);
                  } else {
                    addConditionGroup();
                  }
                }}
                disabled={csvColumns.length === 0}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Condition Group
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Field mapping */}
        <Card>
          <CardContent className="pt-5">
            <FieldMappingTable
              mappings={fieldMappings}
              csvColumns={csvColumns}
              csvRows={csvRows}
              onChange={onFieldMappingsChange}
            />
          </CardContent>
        </Card>

        {/* Options */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Set as Default Rule</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Default rules apply to all records not matched by other rules.
                </p>
              </div>
              <Switch checked={isDefault} onCheckedChange={onIsDefaultChange} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT – live preview */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Template Preview</CardTitle>
              {csv && csv.rows.length > 0 && (
                <Badge variant="secondary" className="text-xs">Sample Data</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <LiveTemplatePreview
              template={template}
              sampleRow={csv?.rows[0] ?? null}
              mappings={fieldMappings}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Step 3: Preview & Generate ───────────────────────────────────────────────

function openDesignerWithTemplate(template: PreviewTemplateOption, projectId: string, navigate: ReturnType<typeof useNavigate>) {
  const templateId = (template as any)._id || template.remoteId || template.id;
  const rawMargin = (template as any).margin ?? {};
  const normalizedMargin = {
    top:    Number(rawMargin.top    ?? 0) || 0,
    left:   Number(rawMargin.left   ?? 0) || 0,
    right:  Number(rawMargin.right  ?? 0) || 0,
    bottom: Number(rawMargin.bottom ?? 0) || 0,
  };
  localStorage.setItem("vendor_designer_template_config", JSON.stringify({
    templateName: template.templateName,
    templateType: template.templateType,
    canvas:       template.canvas,
    margin:       normalizedMargin,
  }));
  localStorage.setItem(DESIGNER_CONTEXT_KEY, JSON.stringify({
    projectId,
    templateId,
    projectName:  "",
    templateName: template.templateName,
  }));
  navigate("/designer-studio");
}

function StepPreviewGenerate({
  template,
  csv,
  conditionGroups,
  groupOperator,
  fieldMappings,
  projectId,
}: {
  template: PreviewTemplateOption | null;
  csv: ParsedCsv | null;
  conditionGroups: ConditionGroup[];
  groupOperator: "AND" | "OR";
  fieldMappings: FieldMapping[];
  projectId: string;
}) {
  const navigate = useNavigate();

  const matchedRows = useMemo(() => {
    if (!csv) return [];
    return filterRowsByRule({ conditionGroups, groupOperator }, csv.rows);
  }, [csv, conditionGroups, groupOperator]);

  const [showSample, setShowSample] = useState(true);
  const displayRows = showSample ? matchedRows.slice(0, 10) : matchedRows;

  const handleOpenDesigner = () => {
    if (!template) return;
    openDesignerWithTemplate(template, projectId, navigate);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Records", value: csv?.rows.length ?? 0, color: "text-foreground" },
          {
            label: "Matching Records",
            value: matchedRows.length,
            color: matchedRows.length > 0 ? "text-emerald-600" : "text-amber-600",
          },
          {
            label: "Conditions",
            value: conditionGroups.reduce((s, g) => s + g.conditions.length, 0),
            color: "text-foreground",
          },
          {
            label: "Fields Mapped",
            value: fieldMappings.filter((m) => m.csvColumn).length,
            color: "text-foreground",
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template + action */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {template?.thumbnail && (
                <img
                  src={template.thumbnail}
                  alt=""
                  className="h-12 w-12 rounded object-cover border"
                />
              )}
              <div>
                <p className="font-semibold">{template?.templateName ?? "No template"}</p>
                <p className="text-xs text-muted-foreground">
                  {template?.canvas.width}×{template?.canvas.height}mm · {template?.templateType}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleOpenDesigner}
                disabled={!template}
              >
                <Layers className="h-4 w-4 mr-2" />
                Open in Designer
              </Button>
              <Button
                onClick={handleOpenDesigner}
                disabled={!template || matchedRows.length === 0}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Generate ({matchedRows.length})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matched records preview */}
      {matchedRows.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Matching Records
                <Badge variant="secondary" className="ml-2 text-xs">{matchedRows.length}</Badge>
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => setShowSample((v) => !v)}
              >
                {showSample ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showSample ? "Show all" : "Show sample"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">#</th>
                    {csv?.fields.slice(0, 6).map((f) => (
                      <th key={f.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      {csv?.fields.slice(0, 6).map((f) => (
                        <td key={f.key} className="px-3 py-2 max-w-[120px] truncate">
                          {row[f.key] || <span className="opacity-40">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {showSample && matchedRows.length > 10 && (
                <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                  Showing 10 of {matchedRows.length} matching records.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="font-medium">No records match the current conditions</p>
            <p className="text-sm text-center">
              Try relaxing the conditions in the Rule Builder step or check your CSV data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RuleBuilderWorkflow() {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const templateIdParam = searchParams.get("templateId") ?? "";
  const ruleIdParam = searchParams.get("ruleId") ?? "";

  // ── Page state ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());

  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [template, setTemplate] = useState<PreviewTemplateOption | null>(null);
  const [allTemplates, setAllTemplates] = useState<PreviewTemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const [conditionGroups, setConditionGroups] = useState<ConditionGroup[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [groupOperator, setGroupOperator] = useState<"AND" | "OR">("AND");
  const [isDefault, setIsDefault] = useState(false);
  const [priority, setPriority] = useState(1);
  const [ruleName, setRuleName] = useState("");

  const [savedRuleId, setSavedRuleId] = useState<string | null>(ruleIdParam || null);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplateChooser, setShowTemplateChooser] = useState(false);

  // ── Load templates for project ───────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    setTemplatesLoading(true);
    fetch(`${API_BASE}/templates?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const items: TemplateRecord[] = Array.isArray(json?.data) ? json.data : [];
        const mapped: PreviewTemplateOption[] = items.map((t) => ({
          ...mapTemplateRecordToProjectTemplate(t),
          isGlobal: t.isGlobal === true,
          _id: t._id,
        }));
        setAllTemplates(mapped);

        // Auto-select from URL param or first template
        if (templateIdParam) {
          const found = mapped.find(
            (m) => m.id === templateIdParam || (m as any)._id === templateIdParam
          );
          if (found) selectTemplate(found);
          else if (mapped.length > 0) selectTemplate(mapped[0]);
        } else if (mapped.length > 0) {
          selectTemplate(mapped[0]);
        }
      })
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setTemplatesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, templateIdParam]);

  // ── Load existing rule if editing ────────────────────────────────────────────
  useEffect(() => {
    if (!ruleIdParam) return;
    getRuleById(ruleIdParam)
      .then((rule) => {
        setConditionGroups(rule.conditionGroups);
        setFieldMappings(rule.fieldMappings);
        setGroupOperator(rule.groupOperator);
        setIsDefault(rule.isDefault);
        setPriority(rule.priority);
        setRuleName(rule.templateName);
        setSavedRuleId(rule._id);
      })
      .catch(() => toast.error("Failed to load rule"));
  }, [ruleIdParam]);

  // ── Select template → auto-extract fields → auto-map ─────────────────────────
  const selectTemplate = useCallback((t: PreviewTemplateOption) => {
    setTemplate(t);
    const fields = extractTemplateFields(t.canvasJSON);
    const csvCols = csv?.fields.map((f) => f.key) ?? [];
    const mappings = autoMapFields(fields.length > 0 ? fields : [], csvCols);
    setFieldMappings(mappings);
    if (!ruleName) setRuleName(t.templateName);
  }, [csv, ruleName]);

  // Re-run auto-map when CSV loaded (after template already set)
  const handleCsvLoaded = (parsed: ParsedCsv) => {
    setCsv(parsed);
    if (template) {
      const fields = extractTemplateFields(template.canvasJSON);
      const cols = parsed.fields.map((f) => f.key);
      setFieldMappings(autoMapFields(fields, cols));
    }
    setCompletedSteps((prev) => new Set([...prev, 1]));
    setStep(2);
  };

  // ── Matched records count ────────────────────────────────────────────────────
  const matchedCount = useMemo(() => {
    if (!csv) return 0;
    return filterRowsByRule({ conditionGroups, groupOperator }, csv.rows).length;
  }, [csv, conditionGroups, groupOperator]);

  // ── Save rule ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!projectId || !template) {
      toast.error("Select a template first");
      return;
    }
    const templateMongoId = (template as any)._id || template.remoteId || "";
    if (!templateMongoId) {
      toast.error("Template is not saved to the database yet");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        projectId,
        templateId: templateMongoId,
        templateName: ruleName || template.templateName,
        csvFileName: csv?.fileName ?? "",
        groupOperator,
        conditionGroups,
        fieldMappings,
        priority,
        isDefault,
      };

      if (savedRuleId) {
        await updateRule(savedRuleId, payload);
        toast.success("Rule updated");
      } else {
        const created = await createRule(payload);
        setSavedRuleId(created._id);
        toast.success("Rule saved");
      }
    } catch (err) {
      toast.error((err as Error).message || "Failed to save rule");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goToStep = (target: Step) => {
    if (target === 1) {
      setStep(1);
      return;
    }
    if (target === 2) {
      if (!csv) { toast.error("Upload a CSV first"); return; }
      setCompletedSteps((prev) => new Set([...prev, 1]));
      setStep(2);
      return;
    }
    if (target === 3) {
      if (!csv) { toast.error("Upload a CSV first"); return; }
      if (!template) { toast.error("Select a template first"); return; }
      setCompletedSteps((prev) => new Set([...prev, 1, 2]));
      setStep(3);
    }
  };

  const canProceed = step === 1 ? Boolean(csv) : step === 2 ? Boolean(csv && template) : false;

  // ── Template chooser modal ────────────────────────────────────────────────────
  const TemplateChooser = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background">
          <h2 className="font-semibold">Select Template</h2>
          <Button size="sm" variant="ghost" onClick={() => setShowTemplateChooser(false)}>✕</Button>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allTemplates.map((t) => (
            <button
              key={t.id}
              className={`rounded-lg border-2 p-3 text-left transition-all hover:border-primary ${
                template?.id === t.id ? "border-primary bg-primary/5" : "border-transparent"
              }`}
              onClick={() => { selectTemplate(t); setShowTemplateChooser(false); }}
            >
              {t.thumbnail ? (
                <img src={t.thumbnail} alt="" className="w-full h-28 object-cover rounded mb-2" />
              ) : (
                <div className="w-full h-28 rounded mb-2 bg-muted flex items-center justify-center">
                  <Layers className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <p className="text-xs font-semibold truncate">{t.templateName}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{t.templateType}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (templatesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      {showTemplateChooser && <TemplateChooser />}

      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="border-b bg-card sticky top-0 z-40">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 gap-1 text-muted-foreground"
                asChild
              >
                <Link to={`/projects/${projectId}`}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back</span>
                </Link>
              </Button>
              <div className="h-4 w-px bg-border" />
              <div className="min-w-0">
                <h1 className="font-semibold text-sm sm:text-base truncate">Rule Builder</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Map multiple templates to your CSV data using conditions and field mapping.
                </p>
              </div>
            </div>

            <div className="hidden md:flex">
              <Stepper current={step} completed={completedSteps} />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                onClick={handleSave}
                disabled={isSaving || !template || !projectId}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {savedRuleId ? "Update Rule" : "Save Rule"}
              </Button>
              {step < 3 ? (
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => goToStep((step + 1) as Step)}
                  disabled={!canProceed}
                >
                  {step === 2 ? "Preview & Generate" : "Next: Rule Builder"}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => {
                    if (!template || !projectId) return;
                    openDesignerWithTemplate(template, projectId, navigate);
                  }}
                  disabled={!template}
                >
                  <Play className="h-3.5 w-3.5" />
                  Open Designer
                </Button>
              )}
            </div>
          </div>

          {/* Mobile stepper */}
          <div className="md:hidden flex justify-center pb-3">
            <Stepper current={step} completed={completedSteps} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">
          {step === 1 && (
            <StepUploadCsv csv={csv} onCsvLoaded={handleCsvLoaded} />
          )}
          {step === 2 && (
            <StepRuleBuilder
              template={template}
              csv={csv}
              conditionGroups={conditionGroups}
              fieldMappings={fieldMappings}
              groupOperator={groupOperator}
              isDefault={isDefault}
              onConditionGroupsChange={setConditionGroups}
              onFieldMappingsChange={setFieldMappings}
              onGroupOperatorChange={setGroupOperator}
              onIsDefaultChange={setIsDefault}
              onChangeTemplate={() => setShowTemplateChooser(true)}
              matchedCount={matchedCount}
            />
          )}
          {step === 3 && (
            <StepPreviewGenerate
              template={template}
              csv={csv}
              conditionGroups={conditionGroups}
              groupOperator={groupOperator}
              fieldMappings={fieldMappings}
              projectId={projectId ?? ""}
            />
          )}
        </div>

        {/* Footer nav */}
        <div className="border-t bg-card">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => step > 1 && setStep((s) => (s - 1) as Step)}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex gap-1.5 items-center text-xs text-muted-foreground">
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    if (s.id <= step || completedSteps.has(s.id)) setStep(s.id);
                  }}
                  className={`h-2 w-2 rounded-full transition-all ${
                    step === s.id ? "bg-primary w-4" : completedSteps.has(s.id) ? "bg-emerald-400" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>

            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => goToStep((step + 1) as Step)}
              disabled={!canProceed || step === 3}
            >
              {step === 2 ? "Preview & Generate" : "Next: Rule Builder"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
