/**
 * RuleBuilderWorkflow.tsx
 * Full-page 4-step Rule Builder wizard matching the reference UI.
 * Route: /projects/:id/rule-builder
 *
 * Steps:
 *  1. Upload CSV
 *  2. Rule Builder  (multi-rule: left sidebar + center editor + right preview + bottom CSV bar)
 *  3. Field Mapping (per-rule mapping in tabs)
 *  4. Preview & Generate
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router";
import { nanoid } from "nanoid";
import {
  ArrowLeft, Plus, Trash2, ChevronRight, ChevronLeft,
  CheckCircle2, AlertTriangle, Wand2,
  Eye, EyeOff, Save, Info, GripVertical,
  FileSpreadsheet, Layers, Settings2, Play, Loader2,
  MoreVertical, ChevronUp, ChevronDown, ExternalLink,
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";

import { parseCsvFile, type ParsedCsv, type CsvRow, type CsvField } from "../../lib/csvBinding";
import { API_BASE, resolveProfileImageUrl } from "../../lib/apiService";
import { mapTemplateRecordToProjectTemplate, resolveTemplatePreview, type TemplateRecord } from "../../lib/templateApi";
import { DESIGNER_CONTEXT_KEY } from "../../lib/fabricUtils";
import { type ProjectTemplate } from "../../lib/projectStore";
import {
  createRule,
  updateRule as updateRuleApi,
  deleteRule as deleteRuleApi,
  getRuleById,
  getProjectRuleSession,
  autoMapFields,
  extractTemplateFields,
  applyMappings,
  filterRowsByRule,
  CONDITION_OPERATOR_LABELS,
  type Condition,
  type ConditionGroup,
  type FieldMapping,
  type ConditionOperator,
} from "../../lib/ruleBuilderApi";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;
type PreviewTemplateOption = ProjectTemplate & { isGlobal?: boolean; _id?: string };

interface RuleEntry {
  localId: string;
  _id?: string;
  name: string;
  template: PreviewTemplateOption | null;
  conditionGroups: ConditionGroup[];
  fieldMappings: FieldMapping[];
  groupOperator: "AND" | "OR";
  isDefault: boolean;
  active: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Upload CSV" },
  { id: 2, label: "Rule Builder" },
  { id: 3, label: "Field Mapping" },
];

const OPERATORS: ConditionOperator[] = [
  "equals", "not_equals", "contains", "not_contains",
  "starts_with", "ends_with", "is_empty", "is_not_empty",
];

const VALUE_LESS_OPERATORS: ConditionOperator[] = ["is_empty", "is_not_empty"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Infer CsvField metadata from raw row objects (mirrors csvBinding.ts logic)
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_KEY_RE = [/photo/i, /image/i, /\bimg\b/i, /picture/i, /\bpic\b/i, /avatar/i, /logo/i, /icon/i];
const BARCODE_KEY_RE = [/barcode/i, /\bqr\b/i, /qrcode/i];

function inferFieldType(key: string): CsvField["type"] {
  if (BARCODE_KEY_RE.some((re) => re.test(key))) return "barcode";
  if (IMAGE_KEY_RE.some((re) => re.test(key))) return "image";
  return "text";
}

type FieldSchema = { key: string; label: string };

/** Normalise a string for fuzzy matching: lower-case, strip non-alphanumeric. */
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Build CsvField[] from raw DataRecord rows.
 * If a project field schema is provided, its labels replace the auto-generated ones.
 * When schema has keys not present in rows, those fields are still included.
 */
function inferCsvFieldsFromRows(
  rows: Record<string, string>[],
  schema: FieldSchema[] = [],
): CsvField[] {
  const schemaLabelMap = new Map(schema.map((f) => [f.key, f.label]));
  // Start with schema keys (preserves configured field order)
  const schemaKeys = schema.map((f) => f.key);
  // Scan EVERY row (not just rows[0]) — early rows may be sparse test records
  // that only carry a subset of keys present in later production rows.
  const rowKeys = rows.length > 0
    ? [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k.length > 0)))]
    : [];
  const allKeys = [...new Set([...schemaKeys, ...rowKeys])].filter((k) => k.length > 0);

  if (allKeys.length === 0) return [];

  return allKeys.map((k) => ({
    key: k,
    label:
      schemaLabelMap.get(k) ??
      k.trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type: inferFieldType(k),
  }));
}

/**
 * Enhanced auto-mapping that uses the project field schema for label-based matching.
 * Matching order:
 *  1. Exact key normalisation  (norm(templateField) === norm(csvCol))
 *  2. Schema label match       (norm(label) === norm(templateField))
 *  3. Partial key match        (one contains the other)
 *  4. Partial label match      (schema label partially overlaps templateField)
 */
function buildMappingsWithSchema(
  templateFields: string[],
  csvColumns: string[],
  schema: FieldSchema[],
): FieldMapping[] {
  // Pre-build maps: normalised label → raw key, normalised key → raw key
  const labelToKey = new Map<string, string>();
  const keyNormToKey = new Map<string, string>();
  for (const f of schema) {
    labelToKey.set(norm(f.label), f.key);
    keyNormToKey.set(norm(f.key), f.key);
  }

  return templateFields.map((field) => {
    const normField = norm(field);
    let matched = "";

    // 1. Direct key exact match
    matched = csvColumns.find((col) => norm(col) === normField) ?? "";

    // 2. Schema label exact match
    if (!matched) {
      const keyByLabel = labelToKey.get(normField);
      if (keyByLabel) matched = csvColumns.find((col) => col === keyByLabel) ?? "";
    }

    // 3. Partial key match
    if (!matched) {
      matched =
        csvColumns.find((col) => {
          const nc = norm(col);
          return nc.includes(normField) || normField.includes(nc);
        }) ?? "";
    }

    // 4. Partial schema label match
    if (!matched) {
      for (const f of schema) {
        const nl = norm(f.label);
        if (nl.includes(normField) || normField.includes(nl)) {
          matched = csvColumns.find((col) => col === f.key) ?? "";
          if (matched) break;
        }
      }
    }

    return {
      templateField: field,
      csvColumn: matched,
      fieldType: inferFieldType(matched || field),
    };
  });
}

function makeRule(
  template: PreviewTemplateOption | null,
  csvColumns: string[],
  schema: FieldSchema[] = [],
): RuleEntry {
  const fields = template ? extractTemplateFields(template.canvasJSON) : [];
  const mappings = schema.length > 0
    ? buildMappingsWithSchema(fields, csvColumns, schema)
    : autoMapFields(fields, csvColumns);
  return {
    localId: nanoid(),
    name: template?.templateName ?? "New Rule",
    template,
    conditionGroups: [],
    fieldMappings: mappings,
    groupOperator: "AND",
    isDefault: false,
    active: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stepper
// ─────────────────────────────────────────────────────────────────────────────

function Stepper({ current, completed }: { current: Step; completed: Set<Step> }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2 transition-all ${
                current === step.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : completed.has(step.id)
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-muted bg-background text-muted-foreground"
              }`}
            >
              {completed.has(step.id) && current !== step.id ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                step.id
              )}
            </div>
            <span
              className={`hidden lg:block text-xs font-medium ${
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
              className={`mx-3 h-px w-8 lg:w-14 transition-colors ${
                completed.has(step.id) ? "bg-emerald-400" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 – Upload CSV
// ─────────────────────────────────────────────────────────────────────────────

interface CsvLoadedInfo {
  /** Last-updated ISO string from saved rules */
  lastUpdated?: string;
}

function StepUploadCsv({
  csv,
  savedInfo,
  onCsvLoaded,
  onContinue,
}: {
  csv: ParsedCsv | null;
  savedInfo: CsvLoadedInfo | null;
  onCsvLoaded: (csv: ParsedCsv) => void;
  onContinue: () => void;
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

  // Already has CSV from project data — show the "data loaded" card
  if (csv) {
    const updatedAt = savedInfo?.lastUpdated
      ? new Date(savedInfo.lastUpdated).toLocaleString()
      : null;

    return (
      <div className="flex flex-col gap-6 max-w-3xl mx-auto">
        {/* Already-loaded banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-5">
          <div className="flex-shrink-0 h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300">CSV Data Already Loaded</h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
              <span className="font-medium">{csv.fileName}</span>
              {" · "}{csv.rows.length} records · {csv.fields.length} columns
            </p>
            {updatedAt && (
              <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">Last updated: {updatedAt}</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onContinue}
            >
              Continue Rule Builder
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Column preview */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Detected Columns</p>
          <div className="flex flex-wrap gap-2">
            {csv.fields.map((f) => (
              <div key={f.key} className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1">
                <span className={`inline-block w-2 h-2 rounded-sm flex-shrink-0 ${
                  f.type === "image" ? "bg-sky-400" : f.type === "barcode" ? "bg-emerald-400" : "bg-violet-400"
                }`} />
                <span className="text-xs font-medium">{f.label}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{f.type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Data preview table */}
        {csv.rows.length > 0 && (
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
                            <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              f.type === "image" ? "bg-sky-400" : f.type === "barcode" ? "bg-emerald-400" : "bg-violet-400"
                            }`} />
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
      </div>
    );
  }

  // Fresh upload UI (no CSV loaded yet)
  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      <div
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-14 text-center transition-all cursor-pointer ${
          isDrag
            ? "border-primary bg-primary/5"
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
        ) : (
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
        )}
        <h3 className="text-lg font-semibold mb-1">Upload CSV Data File</h3>
        <p className="text-sm text-muted-foreground">
          Drag &amp; drop your CSV file here, or click to browse
        </p>
      </div>

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

// ─────────────────────────────────────────────────────────────────────────────
// Condition Row
// ─────────────────────────────────────────────────────────────────────────────

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
    <div className="flex items-center gap-2">
      <Select
        value={condition.field}
        onValueChange={(v) => onChange({ ...condition, field: v, value: "" })}
      >
        <SelectTrigger className="h-8 min-w-[130px] flex-1 text-xs">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {csvColumns.map((col) => (
            <SelectItem key={col} value={col}>{col}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.operator}
        onValueChange={(v) => onChange({ ...condition, operator: v as ConditionOperator })}
      >
        <SelectTrigger className="h-8 w-[130px] flex-shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op} value={op}>{CONDITION_OPERATOR_LABELS[op]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue && (
        <Select
          value={condition.value}
          onValueChange={(v) => onChange({ ...condition, value: v })}
        >
          <SelectTrigger className="h-8 min-w-[120px] flex-1 text-xs">
            <SelectValue placeholder="Select value" />
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
        className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule Card (left sidebar)
// ─────────────────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  rule: RuleEntry;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const condCount = rule.conditionGroups.reduce((s, g) => s + g.conditions.length, 0);

  return (
    <div
      className={`group relative flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-all ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
      }`}
      onClick={onSelect}
    >
      <div className="flex-shrink-0 w-9 h-[52px] rounded overflow-hidden border bg-muted">
        <TemplateThumbnailCard template={rule.template} size="sm" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold truncate">{rule.name}</span>
          {rule.isDefault && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">Default</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {rule.active ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">Inactive</Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">{condCount} condition{condCount !== 1 ? "s" : ""}</p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}>
            <ChevronUp className="h-3.5 w-3.5 mr-2" />Move Up
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}>
            <ChevronDown className="h-3.5 w-3.5 mr-2" />Move Down
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: detect blank (all-white / transparent) images via canvas pixel sample
// ─────────────────────────────────────────────────────────────────────────────

function isImgBlank(img: HTMLImageElement): boolean {
  try {
    const SAMPLE = 24;
    const c = document.createElement("canvas");
    c.width = SAMPLE; c.height = SAMPLE;
    const ctx = c.getContext("2d");
    if (!ctx || !img.naturalWidth) return false;
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      if (a > 20 && (r < 238 || g < 238 || b < 238)) nonWhite++;
    }
    return nonWhite < 8; // fewer than 8 non-white pixels → blank
  } catch {
    return false; // cross-origin taint — assume not blank
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TemplateThumbnailCard — unified thumbnail with blank-detection + canvas fallback
// Used by: sidebar rule card, live preview panel, template chooser modal
// ─────────────────────────────────────────────────────────────────────────────

type ThumbSize = "sm" | "md" | "lg";

function TemplateThumbnailCard({
  template,
  size = "md",
  className = "",
}: {
  template: PreviewTemplateOption | null | undefined;
  size?: ThumbSize;
  className?: string;
}) {
  const [imgState, setImgState] = useState<"loading" | "ok" | "blank" | "error">("loading");

  // Reset when the template changes
  useEffect(() => { setImgState("loading"); }, [template?.thumbnail, template?.id]);

  const sizeClasses: Record<ThumbSize, string> = {
    sm: "w-full h-full",
    md: "w-full min-h-[100px]",
    lg: "w-full min-h-[230px]",
  };

  if (!template) {
    return (
      <div className={`${sizeClasses[size]} flex items-center justify-center bg-muted ${className}`}>
        <Layers className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  const thumbUrl = template.thumbnail || "";
  const hasCanvas = Boolean(template.canvasJSON);
  const showCanvas = (!thumbUrl || imgState === "blank" || imgState === "error") && hasCanvas;
  const showPlaceholder = !thumbUrl && !hasCanvas;
  const showFallbackPlaceholder =
    (imgState === "blank" || imgState === "error") && !hasCanvas;

  // Initials for placeholder
  const initials = template.templateName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (showPlaceholder || showFallbackPlaceholder) {
    return (
      <div
        className={`${sizeClasses[size]} flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/60 gap-1 ${className}`}
      >
        <span className="text-lg font-bold text-muted-foreground/60 select-none">{initials}</span>
        <Layers className="h-4 w-4 text-muted-foreground/40" />
      </div>
    );
  }

  if (showCanvas) {
    return (
      <CanvasThumbnail
        canvasJSON={template.canvasJSON!}
        widthMm={template.canvas.width}
        heightMm={template.canvas.height}
        className={`${sizeClasses[size]} ${className}`}
      />
    );
  }

  // Show image; on load run blank detection; on error fall through to canvas/placeholder
  return (
    <img
      key={thumbUrl}
      src={thumbUrl}
      alt={template.templateName}
      className={`${sizeClasses[size]} object-cover ${imgState === "loading" ? "opacity-0" : "opacity-100"} transition-opacity ${className}`}
      onLoad={(e) => {
        const img = e.currentTarget;
        setImgState(isImgBlank(img) ? "blank" : "ok");
      }}
      onError={() => setImgState("error")}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Thumbnail — renders canvasJSON via Fabric StaticCanvas as a fallback
// preview when no thumbnail image URL is available.
// ─────────────────────────────────────────────────────────────────────────────

function CanvasThumbnail({
  canvasJSON,
  widthMm,
  heightMm,
  className = "",
}: {
  canvasJSON: string;
  widthMm: number;
  heightMm: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDataUrl(null);

    (async () => {
      try {
        const { StaticCanvas } = await import("fabric");
        if (cancelled) return;

        // Unwrap pages[] wrapper if present (multi-page canvas format)
        let fabricJSON = canvasJSON;
        try {
          const parsed = JSON.parse(canvasJSON) as Record<string, any>;
          if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
            const p = parsed.pages[0] as Record<string, any>;
            fabricJSON = JSON.stringify(p.canvas ?? p);
          }
        } catch { /* use raw */ }

        // Convert mm → px at 96 DPI
        const MM_TO_PX = 96 / 25.4;
        const srcW = widthMm > 0 ? Math.round(widthMm * MM_TO_PX) : 204;
        const srcH = heightMm > 0 ? Math.round(heightMm * MM_TO_PX) : 324;

        // Strip cross-origin images to prevent canvas taint
        try {
          const json = JSON.parse(fabricJSON) as Record<string, any>;
          if (Array.isArray(json.objects)) {
            json.objects = (json.objects as Record<string, any>[]).filter((o) => {
              if (String(o.type || "").toLowerCase() !== "image") return true;
              const src = String(o.src || "");
              try {
                const u = new URL(src, window.location.href);
                return !(
                  (u.protocol === "http:" || u.protocol === "https:") &&
                  u.origin !== window.location.origin
                );
              } catch { return true; }
            });
          }
          if (json.backgroundImage) {
            const bgSrc = String((json.backgroundImage as Record<string, any>).src || "");
            try {
              const u = new URL(bgSrc, window.location.href);
              if (
                (u.protocol === "http:" || u.protocol === "https:") &&
                u.origin !== window.location.origin
              ) {
                delete json.backgroundImage;
              }
            } catch { /* keep */ }
          }
          fabricJSON = JSON.stringify(json);
        } catch { /* use as-is */ }

        const el = document.createElement("canvas");
        const sc = new StaticCanvas(el, { width: srcW, height: srcH, renderOnAddRemove: false });

        await sc.loadFromJSON(fabricJSON);
        if (!sc.backgroundColor) sc.backgroundColor = "#ffffff";
        (sc as any).clipPath = undefined;
        sc.renderAll();

        let url = "";
        try {
          // Render at 50% to keep the preview lightweight
          url = sc.toDataURL({ format: "png", multiplier: 0.5 } as any);
        } catch { /* cross-origin taint — leave url empty */ }
        sc.dispose();

        if (!cancelled) {
          setDataUrl(url || null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [canvasJSON, widthMm, heightMm]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted min-h-[120px]`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted min-h-[120px]`}>
        <Layers className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img src={dataUrl} alt="" className={`${className} object-cover w-full`} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live Template Preview
// ─────────────────────────────────────────────────────────────────────────────

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
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <Layers className="h-10 w-10" />
        <p className="text-xs text-center text-muted-foreground">No template selected</p>
      </div>
    );
  }

  const resolved = sampleRow ? applyMappings(sampleRow, mappings) : {};

  const getField = (keys: string[]) => { for (const k of keys) { if (resolved[k]) return resolved[k]; } return ""; };
  const photoVal = getField(["Photo", "photo", "image", "Image", "avatar"]);
  const photoUrl = photoVal ? resolveProfileImageUrl(photoVal) : "";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[170px] rounded-lg overflow-hidden border shadow-md bg-white">
        <TemplateThumbnailCard template={template} size="lg" />
        {photoUrl && (
          <div className="absolute inset-0 flex items-start justify-center pointer-events-none pt-10">
            <img
              src={photoUrl}
              alt=""
              className="h-12 w-12 rounded-full object-cover border-2 border-white shadow"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}
      </div>

      <div className="w-full text-center space-y-1">
        <p className="text-xs font-semibold truncate">{template.templateName}</p>
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{template.canvas.width}×{template.canvas.height}mm</Badge>
          <Badge variant="outline" className="text-[10px] capitalize">{template.templateType}</Badge>
          {template.isGlobal && <Badge variant="outline" className="text-[10px] text-sky-600 border-sky-200">Global</Badge>}
        </div>
      </div>

      {sampleRow && mappings.filter((m) => m.csvColumn).length > 0 && (
        <div className="w-full rounded-lg border p-2.5 space-y-1 text-xs bg-muted/30">
          <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px] mb-1.5">Sample data</p>
          {mappings.filter((m) => m.csvColumn).slice(0, 5).map((m) => (
            <div key={m.templateField} className="flex gap-2">
              <span className="text-muted-foreground min-w-[70px] truncate">{m.templateField}:</span>
              <span className="truncate font-medium">{resolved[m.templateField] || resolved[m.csvColumn] || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full Template Preview Dialog
// ─────────────────────────────────────────────────────────────────────────────

function FullTemplatePreviewDialog({
  template,
  onClose,
}: {
  template: PreviewTemplateOption | null;
  onClose: () => void;
}) {
  if (!template) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Layers className="h-4 w-4 text-muted-foreground" />
            {template.templateName}
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs capitalize">{template.templateType}</Badge>
            <Badge variant="outline" className="text-xs">{template.canvas.width}×{template.canvas.height}mm</Badge>
            {template.isGlobal && <Badge variant="outline" className="text-xs text-sky-600 border-sky-200">Global</Badge>}
          </div>
        </DialogHeader>

        <div className="flex items-center justify-center bg-muted/30 min-h-[420px] p-6">
          <div
            className="rounded-xl overflow-hidden border shadow-xl bg-white"
            style={{ maxHeight: "70vh", maxWidth: "100%", width: "fit-content" }}
          >
            {template.thumbnail ? (
              <img
                src={template.thumbnail}
                alt={template.templateName}
                className="block max-h-[65vh] max-w-full object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : template.canvasJSON ? (
              <CanvasThumbnail
                canvasJSON={template.canvasJSON}
                widthMm={template.canvas.width}
                heightMm={template.canvas.height}
                className="min-h-[300px] min-w-[200px]"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 w-64 gap-3 text-muted-foreground">
                <Layers className="h-12 w-12" />
                <p className="text-sm">No preview available</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 – Rule Builder (3-column layout matching reference)
// ─────────────────────────────────────────────────────────────────────────────

function StepRuleBuilder({
  rules,
  selectedRuleId,
  csv,
  allTemplates,
  defaultTemplateId,
  onSelectRule,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onDuplicateRule,
  onMoveRule,
  onDefaultTemplateChange,
  onChangeTemplate,
}: {
  rules: RuleEntry[];
  selectedRuleId: string | null;
  csv: ParsedCsv | null;
  allTemplates: PreviewTemplateOption[];
  defaultTemplateId: string;
  onSelectRule: (id: string) => void;
  onAddRule: () => void;
  onUpdateRule: (id: string, patch: Partial<RuleEntry>) => void;
  onDeleteRule: (id: string) => void;
  onDuplicateRule: (id: string) => void;
  onMoveRule: (idx: number, dir: "up" | "down") => void;
  onDefaultTemplateChange: (val: string) => void;
  onChangeTemplate: (ruleId: string) => void;
}) {
  const selectedRule = rules.find((r) => r.localId === selectedRuleId) ?? null;
  const csvColumns = csv?.fields.map((f) => f.key) ?? [];
  const csvRows = csv?.rows ?? [];
  const [previewTemplate, setPreviewTemplate] = useState<PreviewTemplateOption | null>(null);

  const patch = useCallback(
    (p: Partial<RuleEntry>) => { if (selectedRule) onUpdateRule(selectedRule.localId, p); },
    [selectedRule, onUpdateRule],
  );

  const conditionGroups = selectedRule?.conditionGroups ?? [];

  const addCondition = () => {
    if (!selectedRule) return;
    const newCond: Condition = { id: nanoid(), field: csvColumns[0] ?? "", operator: "equals", value: "" };
    if (conditionGroups.length === 0) {
      patch({ conditionGroups: [{ id: nanoid(), operator: "AND", conditions: [newCond] }] });
    } else {
      patch({ conditionGroups: conditionGroups.map((g, i) => i === 0 ? { ...g, conditions: [...g.conditions, newCond] } : g) });
    }
  };

  const addConditionGroup = () => {
    if (!selectedRule) return;
    patch({
      conditionGroups: [
        ...conditionGroups,
        { id: nanoid(), operator: "AND", conditions: [{ id: nanoid(), field: csvColumns[0] ?? "", operator: "equals", value: "" }] },
      ],
    });
  };

  const updateCondition = (groupIdx: number, condIdx: number, c: Condition) => {
    patch({ conditionGroups: conditionGroups.map((g, gi) => gi !== groupIdx ? g : { ...g, conditions: g.conditions.map((x, ci) => ci !== condIdx ? x : c) }) });
  };

  const removeCondition = (groupIdx: number, condIdx: number) => {
    const group = conditionGroups[groupIdx];
    const next = group.conditions.filter((_, i) => i !== condIdx);
    if (next.length === 0 && conditionGroups.length > 1) {
      patch({ conditionGroups: conditionGroups.filter((_, i) => i !== groupIdx) });
    } else {
      patch({ conditionGroups: conditionGroups.map((g, i) => i !== groupIdx ? g : { ...g, conditions: next }) });
    }
  };

  const updateGroupOperator = (groupIdx: number, op: "AND" | "OR") => {
    patch({ conditionGroups: conditionGroups.map((g, i) => i !== groupIdx ? g : { ...g, operator: op }) });
  };

  const matchedCount = useMemo(() => {
    if (!csv || !selectedRule) return 0;
    return filterRowsByRule({ conditionGroups: selectedRule.conditionGroups, groupOperator: selectedRule.groupOperator }, csv.rows).length;
  }, [csv, selectedRule]);

  return (
    <>
      {previewTemplate && (
        <FullTemplatePreviewDialog
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      {/* 3-column main area */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* LEFT SIDEBAR: Templates & Rules */}
        <div className="w-[260px] flex-shrink-0 border-r flex flex-col overflow-hidden bg-background">
          <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30">
            <span className="text-xs font-semibold">Templates &amp; Rules</span>
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 px-2" onClick={onAddRule}>
              <Plus className="h-3 w-3" />
              Add Template Rule
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {rules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Layers className="h-7 w-7" />
                <p className="text-xs text-center">No template rules yet</p>
                <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={onAddRule}>
                  <Plus className="h-3 w-3" />Add first rule
                </Button>
              </div>
            ) : (
              rules.map((rule, idx) => (
                <RuleCard
                  key={rule.localId}
                  rule={rule}
                  selected={rule.localId === selectedRuleId}
                  onSelect={() => onSelectRule(rule.localId)}
                  onDelete={() => onDeleteRule(rule.localId)}
                  onDuplicate={() => onDuplicateRule(rule.localId)}
                  onMoveUp={() => onMoveRule(idx, "up")}
                  onMoveDown={() => onMoveRule(idx, "down")}
                  isFirst={idx === 0}
                  isLast={idx === rules.length - 1}
                />
              ))
            )}
            {rules.length > 0 && (
              <button
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground border border-dashed rounded-lg py-2 hover:bg-muted/40 hover:text-foreground transition-colors mt-1"
                onClick={onAddRule}
              >
                <Plus className="h-3 w-3" />Add Template Rule
              </button>
            )}
          </div>

          <div className="border-t px-3 py-2 bg-muted/20">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Templates are matched in order from top to bottom.
            </p>
          </div>
        </div>

        {/* CENTER: Rule Editor */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {selectedRule ? (
            <div className="p-5 space-y-5 max-w-2xl">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">Edit Rule: {selectedRule.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Rows matching these conditions will use this template.</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Active</span>
                    <Switch checked={selectedRule.active} onCheckedChange={(v) => patch({ active: v })} className="scale-90" />
                  </div>
                </div>
              </div>

              {/* Template row */}
              {selectedRule.template && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  {selectedRule.template.thumbnail && (
                    <img src={selectedRule.template.thumbnail} alt="" className="h-8 w-6 object-cover rounded flex-shrink-0"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{selectedRule.template.templateName}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{selectedRule.template.templateType}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs flex-shrink-0" onClick={() => onChangeTemplate(selectedRule.localId)}>
                    Change
                  </Button>
                </div>
              )}

              {/* Conditions section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">Conditions</h4>
                    <span className="text-xs text-muted-foreground">(All conditions must match)</span>
                  </div>
                  {csv && (
                    <Badge variant={matchedCount > 0 ? "default" : "secondary"} className="text-xs">
                      {matchedCount} matching
                    </Badge>
                  )}
                </div>

                <div className="rounded-lg border p-3 bg-muted/10 space-y-2">
                  {conditionGroups.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No conditions — all records will match this template.
                    </p>
                  )}
                  {conditionGroups.map((group, groupIdx) => (
                    <div key={group.id}>
                      {groupIdx > 0 && (
                        <div className="flex items-center gap-2 my-2">
                          <div className="h-px flex-1 bg-border" />
                          <Select value={selectedRule.groupOperator} onValueChange={(v) => patch({ groupOperator: v as "AND" | "OR" })}>
                            <SelectTrigger className="h-6 w-[60px] text-[10px] font-semibold">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AND">AND</SelectItem>
                              <SelectItem value="OR">OR</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}
                      <div className="space-y-2">
                        {group.conditions.map((cond, condIdx) => (
                          <div key={cond.id}>
                            {condIdx > 0 && (
                              <div className="flex items-center justify-center my-1.5">
                                <button
                                  type="button"
                                  title={group.operator === 'AND' ? 'Click to switch to OR (match any condition for this field)' : 'Click to switch to AND (all conditions must match)'}
                                  onClick={() => updateGroupOperator(groupIdx, group.operator === 'AND' ? 'OR' : 'AND')}
                                  className={
                                    group.operator === 'OR'
                                      ? 'text-[10px] font-bold px-2.5 py-0.5 rounded-full border cursor-pointer transition-colors bg-blue-100 border-blue-400 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:border-blue-500 dark:text-blue-300'
                                      : 'text-[10px] font-bold px-2.5 py-0.5 rounded-full border cursor-pointer transition-colors bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                                  }
                                >
                                  {group.operator}
                                </button>
                              </div>
                            )}
                            <ConditionRow
                              condition={cond}
                              csvColumns={csvColumns}
                              csvRows={csvRows}
                              onChange={(c) => updateCondition(groupIdx, condIdx, c)}
                              onRemove={() => removeCondition(groupIdx, condIdx)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={addCondition} disabled={csvColumns.length === 0}>
                    <Plus className="h-3.5 w-3.5" />Add Condition
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={addConditionGroup} disabled={csvColumns.length === 0}>
                    <Plus className="h-3.5 w-3.5" />Add Condition Group
                  </Button>
                </div>
              </div>

              {/* How it works */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">How it works</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      If a CSV row matches all the conditions above, this template will be used.
                      If multiple rules match, the first matching rule (from top to bottom) will be applied.
                    </p>
                  </div>
                </div>
              </div>

              {/* Default template fallback */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-xs font-medium">If no template matches</p>
                <Select value={defaultTemplateId || "__none__"} onValueChange={onDefaultTemplateChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Use Default Template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {allTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.templateName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Select a template to use when no rules match a row.</p>
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />Manage Default Template
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <Settings2 className="h-10 w-10" />
              <p className="text-sm font-medium">Select a rule to edit</p>
              <p className="text-xs text-center max-w-xs">Click a template rule from the left panel, or add a new one.</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onAddRule}>
                <Plus className="h-4 w-4" />Add Template Rule
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT: Template Preview */}
        <div className="w-[260px] flex-shrink-0 border-l flex flex-col overflow-hidden bg-background">
          <div className="px-3 py-2.5 border-b bg-muted/30">
            <span className="text-xs font-semibold">Template Preview</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <LiveTemplatePreview
              template={selectedRule?.template ?? null}
              sampleRow={csv?.rows[0] ?? null}
              mappings={selectedRule?.fieldMappings ?? []}
            />
          </div>
          {selectedRule?.template && (
            <div className="border-t p-3">
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1.5"
                onClick={() => setPreviewTemplate(selectedRule.template!)}
              >
                <Eye className="h-3.5 w-3.5" />View Full Template
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: CSV Columns Detected bar */}
      {csv && (
        <div className="flex-shrink-0 border-t bg-background px-4 py-2.5">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap flex-shrink-0">
              CSV Columns Detected ({csv.fields.length})
            </span>
            <div className="flex items-center gap-2 overflow-x-auto flex-1 pb-0.5">
              {csv.fields.map((f) => (
                <div key={f.key} className="flex items-center gap-1.5 rounded border bg-muted/50 px-2 py-1 flex-shrink-0">
                  <span className={`inline-block w-2 h-2 rounded-sm flex-shrink-0 ${
                    f.type === "image" ? "bg-sky-400" : f.type === "barcode" ? "bg-emerald-400" : "bg-violet-400"
                  }`} />
                  <span className="text-[11px] font-medium">{f.label}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">{f.type}</span>
                </div>
              ))}
            </div>
            {csv.fields.length > 8 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs flex-shrink-0">View All Columns</Button>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 – Field Mapping
// ─────────────────────────────────────────────────────────────────────────────

function StepFieldMapping({
  rules,
  csv,
  selectedRuleId,
  onSelectRule,
  onUpdateRule,
  schema,
}: {
  rules: RuleEntry[];
  csv: ParsedCsv | null;
  selectedRuleId: string | null;
  onSelectRule: (id: string) => void;
  onUpdateRule: (id: string, patch: Partial<RuleEntry>) => void;
  schema: FieldSchema[];
}) {
  const csvColumns = csv?.fields.map((f) => f.key) ?? [];
  const sampleRow = csv?.rows[0] ?? {};
  // Build key → label lookup for display in Select options
  const keyToLabel = new Map(schema.map((f) => [f.key, f.label]));

  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground max-w-lg mx-auto">
        <Settings2 className="h-10 w-10" />
        <p className="font-medium">No rules configured</p>
        <p className="text-sm text-center">Go back to Rule Builder step to add template rules first.</p>
      </div>
    );
  }

  const activeTab = selectedRuleId ?? rules[0]?.localId ?? "";

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h2 className="text-base font-semibold">Field Mapping</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Map each template variable to a column from your CSV file.</p>
      </div>

      <Tabs value={activeTab} onValueChange={onSelectRule}>
        <TabsList className="h-9">
          {rules.map((rule) => {
            const mapped = rule.fieldMappings.filter((m) => m.csvColumn).length;
            const total = rule.fieldMappings.length;
            return (
              <TabsTrigger key={rule.localId} value={rule.localId} className="text-xs gap-1.5">
                {rule.name}
                {total > 0 && (
                  <span className={`inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full text-[10px] px-1 ${
                    mapped === total ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                  }`}>
                    {mapped}/{total}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {rules.map((rule) => {
          const mappings = rule.fieldMappings;
          const mappedCount = mappings.filter((m) => m.csvColumn).length;

          return (
            <TabsContent key={rule.localId} value={rule.localId} className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm">{rule.name} — {rule.template?.templateName ?? "No template"}</CardTitle>
                      <Badge variant={mappedCount === mappings.length ? "default" : "secondary"} className="text-xs">
                        {mappedCount}/{mappings.length} Mapped
                      </Badge>
                    </div>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                      onClick={() => onUpdateRule(rule.localId, { fieldMappings: buildMappingsWithSchema(mappings.map((m) => m.templateField), csvColumns, schema) })}>
                      <Wand2 className="h-3 w-3" />Auto Map
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {mappings.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center px-4">No variable fields detected in the selected template.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8"></th>
                            <th className="px-3 py-2 text-left font-medium">Template Field</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase">Type</th>
                            <th className="px-3 py-2 text-left font-medium">CSV Column</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Sample</th>
                            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mappings.map((m, idx) => {
                            const sample = m.csvColumn ? (sampleRow[m.csvColumn] ?? "") : "";
                            return (
                              <tr key={m.templateField} className="border-b last:border-0 hover:bg-muted/20">
                                <td className="px-3 py-2">
                                  <span className={`inline-flex h-5 w-[26px] items-center justify-center rounded text-[9px] font-bold ${
                                    m.fieldType === "image" ? "bg-sky-100 text-sky-700" : m.fieldType === "barcode" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"
                                  }`}>
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
                                      onUpdateRule(rule.localId, { fieldMappings: next });
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-sm w-full max-w-[220px]">
                                      <SelectValue placeholder="— Not mapped —" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">— Not mapped —</SelectItem>
                                      {csvColumns.map((col) => {
                                        const colLabel = keyToLabel.get(col);
                                        return (
                                          <SelectItem key={col} value={col}>
                                            {colLabel ? (
                                              <span>
                                                {colLabel}
                                                <span className="text-muted-foreground text-[11px] ml-1.5 opacity-70">({col})</span>
                                              </span>
                                            ) : col}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[160px] truncate">
                                  {m.fieldType === "image" && sample ? <span className="text-sky-600">{sample}</span> : (sample || <span className="opacity-40">—</span>)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {m.csvColumn ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" /> : <AlertTriangle className="h-4 w-4 text-amber-400 mx-auto" />}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {mappings.some((m) => !m.csvColumn) && (
                        <div className="px-3 py-2 border-t bg-amber-50 dark:bg-amber-950/20 flex items-center gap-2 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                          {mappings.filter((m) => !m.csvColumn).length} field(s) not mapped.
                          <button className="underline underline-offset-2 font-medium"
                            onClick={() => onUpdateRule(rule.localId, { fieldMappings: buildMappingsWithSchema(mappings.map((m) => m.templateField), csvColumns, schema) })}>
                            Auto-map now
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 – Preview & Generate
// ─────────────────────────────────────────────────────────────────────────────

function openDesignerWithTemplate(
  template: PreviewTemplateOption,
  projectId: string,
  navigate: ReturnType<typeof useNavigate>,
) {
  const templateId = (template as any)._id || template.remoteId || template.id;
  const rawMargin = (template as any).margin ?? {};
  const normalizedMargin = { top: Number(rawMargin.top ?? 0) || 0, left: Number(rawMargin.left ?? 0) || 0, right: Number(rawMargin.right ?? 0) || 0, bottom: Number(rawMargin.bottom ?? 0) || 0 };
  localStorage.setItem("vendor_designer_template_config", JSON.stringify({ templateName: template.templateName, templateType: template.templateType, canvas: template.canvas, margin: normalizedMargin }));
  localStorage.setItem(DESIGNER_CONTEXT_KEY, JSON.stringify({ projectId, templateId, projectName: "", templateName: template.templateName }));
  navigate("/designer-studio");
}

function StepPreviewGenerate({
  rules,
  csv,
  projectId,
}: {
  rules: RuleEntry[];
  csv: ParsedCsv | null;
  projectId: string;
}) {
  const navigate = useNavigate();
  const [showSample, setShowSample] = useState(true);

  const ruleMatches = useMemo(() => {
    if (!csv) return [] as { rule: RuleEntry; rows: CsvRow[] }[];
    return rules.map((rule) => ({
      rule,
      rows: filterRowsByRule({ conditionGroups: rule.conditionGroups, groupOperator: rule.groupOperator }, csv.rows),
    }));
  }, [csv, rules]);

  const totalConditions = rules.reduce((s, r) => s + r.conditionGroups.reduce((gs, g) => gs + g.conditions.length, 0), 0);
  const totalMapped = rules.reduce((s, r) => s + r.fieldMappings.filter((m) => m.csvColumn).length, 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Records", value: csv?.rows.length ?? 0, color: "" },
          { label: "Rules Configured", value: rules.length, color: rules.length > 0 ? "text-emerald-600" : "text-amber-600" },
          { label: "Total Conditions", value: totalConditions, color: "" },
          { label: "Fields Mapped", value: totalMapped, color: "" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {ruleMatches.map(({ rule, rows }) => (
        <Card key={rule.localId}>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
              <div className="flex items-center gap-3">
                {rule.template?.thumbnail && (
                  <img src={rule.template.thumbnail} alt="" className="h-12 w-8 rounded object-cover border" />
                )}
                <div>
                  <p className="font-semibold">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {rule.template?.templateName ?? "No template"} · {" "}
                    <span className={rows.length > 0 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                      {rows.length} records
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => rule.template && openDesignerWithTemplate(rule.template, projectId, navigate)} disabled={!rule.template}>
                  Open in Designer
                </Button>
                <Button size="sm" onClick={() => rule.template && openDesignerWithTemplate(rule.template, projectId, navigate)} disabled={!rule.template || rows.length === 0} className="gap-1.5">
                  <Play className="h-3.5 w-3.5" />Generate ({rows.length})
                </Button>
              </div>
            </div>

            {rows.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left text-muted-foreground w-8">#</th>
                        {csv?.fields.slice(0, 5).map((f) => (
                          <th key={f.key} className="px-3 py-2 text-left text-muted-foreground whitespace-nowrap">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(showSample ? rows.slice(0, 5) : rows).map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          {csv?.fields.slice(0, 5).map((f) => (
                            <td key={f.key} className="px-3 py-2 max-w-[120px] truncate">{row[f.key] || <span className="opacity-40">—</span>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {showSample && rows.length > 5 && (
                    <div className="px-3 py-2 border-t bg-muted/30 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Showing 5 of {rows.length} rows</p>
                      <button className="text-xs text-primary hover:underline" onClick={() => setShowSample(false)}>Show all</button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                No records match this rule's conditions.
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {rules.length === 0 && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="font-medium">No rules configured</p>
            <p className="text-sm text-center">Go back to the Rule Builder step to configure template assignment rules.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Chooser Modal
// ─────────────────────────────────────────────────────────────────────────────

function TemplateChooser({
  allTemplates,
  currentTemplateId,
  onSelect,
  onClose,
}: {
  allTemplates: PreviewTemplateOption[];
  currentTemplateId?: string;
  onSelect: (t: PreviewTemplateOption) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">Select Template</h2>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">✕</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allTemplates.map((t) => (
            <button
              key={t.id}
              className={`rounded-lg border-2 p-3 text-left transition-all hover:border-primary ${
                currentTemplateId === t.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"
              }`}
              onClick={() => { onSelect(t); onClose(); }}
            >
              <div className="w-full h-28 rounded mb-2 overflow-hidden">
                <TemplateThumbnailCard template={t} size="sm" className="h-28 w-full" />
              </div>
              <p className="text-xs font-semibold truncate">{t.templateName}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{t.templateType}</p>
            </button>
          ))}
          {allTemplates.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Layers className="h-8 w-8 mb-2" />
              <p className="text-sm">No templates found for this project.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Export
// ─────────────────────────────────────────────────────────────────────────────

export function RuleBuilderWorkflow() {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateIdParam = searchParams.get("templateId") ?? "";

  const [step, setStep] = useState<Step>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [csvSavedInfo, setCsvSavedInfo] = useState<{ lastUpdated?: string } | null>(null);
  const [allTemplates, setAllTemplates] = useState<PreviewTemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [rules, setRules] = useState<RuleEntry[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>("__none__");
  const [choosingForRuleId, setChoosingForRuleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [projectFieldSchema, setProjectFieldSchema] = useState<FieldSchema[]>([]);

  // ── Load templates + restore saved session ─────────────────────────────────
  useEffect(() => {
    if (!projectId) return;

    const loadAll = async () => {
      setTemplatesLoading(true);
      setSessionLoading(true);

      try {
        // Fetch templates, session rules, raw project records AND project schema all in parallel.
        // NOTE: Use /projects/:id/templates (not /templates?projectId=...) because:
        //   • It queries ProductTemplate directly — returns full documents WITH designData/canvasJSON
        //   • /templates?projectId=... hits TemplateGalleryMeta first which has NO designData,
        //     so canvasJSON would be undefined and extractTemplateFields() would return []
        //   • Strictly project-scoped: only { projectId } or { productId } matches — no global leak
        const [templatesJson, session, rawRecordsJson, projectJson] = await Promise.all([
          fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/templates`, { cache: "no-store" }).then((r) => r.json()),
          getProjectRuleSession(projectId).catch(() => null),
          fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/records`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null),
          fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => null),
        ]);

        // The backend /api/projects/:id/templates already enforces strict project-scoping
        // ({ projectId } OR { productId: ObjectId(id) }). No frontend re-filter needed —
        // it would incorrectly drop old-style templates that only store productId.
        const items: TemplateRecord[] = Array.isArray(templatesJson?.data) ? templatesJson.data : [];
        const mapped: PreviewTemplateOption[] = items.map((t) => {
          const base = mapTemplateRecordToProjectTemplate(t);
          // Resolve the raw preview_image / previewImageUrl through the URL normalizer
          // so relative paths (/uploads/...) become fully-qualified URLs and
          // corrupt data: URIs are discarded. Falls back to the base thumbnail if
          // the resolver returns empty (e.g. no preview at all).
          const resolvedThumb = resolveTemplatePreview(t, { fallbackToPlaceholder: false });
          return {
            ...base,
            thumbnail: resolvedThumb || base.thumbnail || undefined,
            isGlobal: t.isGlobal === true,
            _id: t._id,
          };
        });
        setAllTemplates(mapped);

        // ── Extract flat field schema from project's dataFieldsByCategory ───────────────
        const rawProjectData = projectJson?.data;
        const schema: FieldSchema[] = [];
        if (rawProjectData?.dataFieldsByCategory && typeof rawProjectData.dataFieldsByCategory === "object") {
          for (const cat of Object.values(rawProjectData.dataFieldsByCategory as Record<string, FieldSchema[]>)) {
            if (Array.isArray(cat)) {
              for (const f of cat) {
                if (f?.key && f?.label && !schema.some((s) => s.key === f.key)) {
                  schema.push({ key: f.key, label: f.label });
                }
              }
            }
          }
        }
        setProjectFieldSchema(schema);

        // ── Resolve best available CSV rows ───────────────────────────────
        // Priority: session rows (already cleaned) → raw DataRecord variables
        const rawRecords: Record<string, string>[] =
          Array.isArray(rawRecordsJson?.data) ? rawRecordsJson.data : [];

        const bestRows: Record<string, string>[] =
          session && session.csvRows.length > 0 ? session.csvRows : rawRecords;

        // ── Build COMPREHENSIVE column list from ALL available sources ─────
        // Sources (in priority order for deduplication):
        //   1. dataFieldsByCategory keys  — authoritative project schema (15+ fields)
        //   2. Actual DataRecord variable keys — any extra columns in raw rows
        //   3. csvColumn values in saved PrintRule fieldMappings — previously mapped cols
        //
        // This ensures ALL configured/mapped columns appear in the Field Mapping UI
        // even when DataRecord rows only carry a subset of columns (e.g. Photo/Name/Roll).
        // Scan EVERY row for unique keys — rows[0] may be a sparse test record
        // (e.g. only Photo/Name/Roll) while production rows further down carry
        // the full 26-column schema. Using flatMap + Set gives the true key union.
        const recordColKeys: string[] =
          bestRows.length > 0
            ? [...new Set(bestRows.flatMap((r) => Object.keys(r).filter((k) => k.length > 0)))]
            : [];
        const schemaColKeys: string[] = schema.map((f) => f.key);
        const savedMappingCols: string[] = (session?.rules ?? []).flatMap((r) =>
          (r.fieldMappings ?? [])
            .map((m) => m.csvColumn)
            .filter((c): c is string => Boolean(c)),
        );

        // Union: schema order first (respects user-defined field order), then any extras
        const allColKeys: string[] = [
          ...new Set([...schemaColKeys, ...recordColKeys, ...savedMappingCols]),
        ].filter((k) => k.length > 0);

        const schemaLabelMap = new Map(schema.map((f) => [f.key, f.label]));

        const bestFields: CsvField[] =
          allColKeys.length > 0
            ? allColKeys.map((k) => ({
                key: k,
                label:
                  schemaLabelMap.get(k) ??
                  k.trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                type: inferFieldType(k),
              }))
            : inferCsvFieldsFromRows(bestRows, schema);

        const hasCsvData = bestRows.length > 0 && bestFields.length > 0;

        const builtCsv: ParsedCsv | null = hasCsvData
          ? {
              fields: bestFields,
              rows: bestRows,
              fileName: session?.csvMeta?.fileName ?? "Project Data",
              errors: [],
            }
          : null;

        if (builtCsv) {
          setCsv(builtCsv);
          setCsvSavedInfo({
            lastUpdated: session?.csvMeta?.lastUpdated ?? new Date().toISOString(),
          });
        }

        const cols = bestFields.map((f) => f.key);

        // ── Restore saved session ──────────────────────────────────────────
        if (session && session.rules.length > 0) {
          // Reconstruct RuleEntry[] from saved PrintRules + templates
          const restoredRules: RuleEntry[] = session.rules.map((r) => {
            const tplId = String((r as any).templateId ?? "");
            const template =
              mapped.find((t) => (t as any)._id === tplId || t.id === tplId) ?? null;
            // Use saved fieldMappings if present; otherwise re-derive with schema
            const fieldMappings =
              r.fieldMappings && r.fieldMappings.length > 0
                ? r.fieldMappings
                : template
                ? buildMappingsWithSchema(extractTemplateFields(template.canvasJSON), cols, schema)
                : [];
            return {
              localId: nanoid(),
              _id: r._id,
              name: r.templateName,
              template,
              conditionGroups: r.conditionGroups,
              fieldMappings,
              groupOperator: r.groupOperator,
              isDefault: r.isDefault,
              active: r.isActive,
            };
          });

          // Also auto-create rules for any project templates not yet covered by a saved rule
          // (handles the "new template added to project" case)
          const coveredTemplateIds = new Set(
            restoredRules
              .map((r) => (r.template as any)?._id ?? r.template?.id)
              .filter(Boolean),
          );
          const missingTemplates = mapped.filter(
            (t) => !coveredTemplateIds.has((t as any)._id) && !coveredTemplateIds.has(t.id),
          );
          const allRules: RuleEntry[] = [
            ...restoredRules,
            ...missingTemplates.map((tpl) =>
              makeRule(tpl, cols, schema),
            ),
          ];

          setRules(allRules);
          setSelectedRuleId(allRules[0]?.localId ?? null);

          // Restore "If no template matches" dropdown from the rule with isDefault=true
          const restoredDefaultRule = allRules.find(r => r.isDefault === true);
          if (restoredDefaultRule) {
            const restoredDefaultTplId =
              (restoredDefaultRule.template as any)?._id ??
              restoredDefaultRule.template?.id ??
              "";
            if (restoredDefaultTplId) setDefaultTemplateId(restoredDefaultTplId);
          }

          // Jump directly to Rule Builder step if we also have CSV data
          if (hasCsvData) {
            setCompletedSteps(new Set([1 as Step]));
            setStep(2);
          }
        } else if (hasCsvData && mapped.length > 0) {
          // CSV data exists but no saved rules — seed one rule per template
          // Put the preferred template (from URL param) first, otherwise keep API order
          const preferredFirst = templateIdParam
            ? (mapped.find((m) => m.id === templateIdParam || (m as any)._id === templateIdParam) ?? null)
            : null;
          const orderedTemplates = preferredFirst
            ? [preferredFirst, ...mapped.filter((m) => m !== preferredFirst)]
            : mapped;
          const seededRules = orderedTemplates.map((tpl) => makeRule(tpl, cols, schema));
          setRules(seededRules);
          setSelectedRuleId(seededRules[0]?.localId ?? null);
          // Stay on step 1 so user sees the banner and clicks "Continue"
        } else {
          // Truly first time — no data, no rules — seed one rule per template with no columns
          if (mapped.length > 0) {
            const preferredFirst = templateIdParam
              ? (mapped.find((m) => m.id === templateIdParam || (m as any)._id === templateIdParam) ?? null)
              : null;
            const orderedTemplates = preferredFirst
              ? [preferredFirst, ...mapped.filter((m) => m !== preferredFirst)]
              : mapped;
            const seededRules = orderedTemplates.map((tpl) => makeRule(tpl, [], schema));
            setRules(seededRules);
            setSelectedRuleId(seededRules[0]?.localId ?? null);
          }
        }
      } catch (err) {
        toast.error("Failed to load project data");
        console.error(err);
      } finally {
        setTemplatesLoading(false);
        setSessionLoading(false);
      }
    };

    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, templateIdParam]);

  const handleCsvLoaded = (parsed: ParsedCsv) => {
    setCsv(parsed);
    setCsvSavedInfo(null); // new file, clear saved metadata
    const cols = parsed.fields.map((f) => f.key);
    setRules((prev) =>
      prev.map((rule) => ({
        ...rule,
        fieldMappings: rule.template
          ? buildMappingsWithSchema(extractTemplateFields(rule.template.canvasJSON), cols, projectFieldSchema)
          : buildMappingsWithSchema(rule.fieldMappings.map((m) => m.templateField), cols, projectFieldSchema),
      })),
    );
    setCompletedSteps((prev) => new Set([...prev, 1]));    setStep(2);
  };

  const handleAddRule = () => {
    const cols = csv?.fields.map((f) => f.key) ?? [];
    const template = allTemplates.find((t) => !rules.some((r) => r.template?.id === t.id)) ?? allTemplates[0] ?? null;
    const newRule = makeRule(template, cols, projectFieldSchema);
    setRules((prev) => [...prev, newRule]);
    setSelectedRuleId(newRule.localId);
  };

  const handleUpdateRule = useCallback((id: string, p: Partial<RuleEntry>) => {
    setRules((prev) => prev.map((r) => r.localId === id ? { ...r, ...p } : r));
  }, []);

  const handleDeleteRule = (id: string) => {
    const rule = rules.find((r) => r.localId === id);
    // Soft-delete from backend if it has a saved _id
    if (rule?._id) {
      deleteRuleApi(rule._id).catch(() => {/* non-critical */});
    }
    setRules((prev) => {
      const next = prev.filter((r) => r.localId !== id).map((r, i) => ({ ...r, priority: i + 1 }));
      if (selectedRuleId === id) setSelectedRuleId(next[0]?.localId ?? null);
      return next;
    });
  };

  // Updates "If no template matches" selection AND keeps rule.isDefault in sync
  const handleDefaultTemplateChange = (val: string) => {
    setDefaultTemplateId(val);
    setRules(prev =>
      prev.map(r => {
        const tplId =
          (r.template as any)?._id ?? r.template?.id ?? r.template?.remoteId ?? "";
        return { ...r, isDefault: val !== "__none__" && tplId === val };
      }),
    );
  };

  const handleDuplicateRule = (id: string) => {
    const rule = rules.find((r) => r.localId === id);
    if (!rule) return;
    const dup: RuleEntry = { ...rule, localId: nanoid(), _id: undefined, name: `${rule.name} (copy)`, priority: rules.length + 1 };
    setRules((prev) => [...prev, dup]);
    setSelectedRuleId(dup.localId);
  };

  const handleMoveRule = (idx: number, dir: "up" | "down") => {
    setRules((prev) => {
      const next = [...prev];
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((r, i) => ({ ...r, priority: i + 1 }));
    });
  };

  const handleTemplateSelected = (t: PreviewTemplateOption) => {
    if (!choosingForRuleId) return;
    const cols = csv?.fields.map((f) => f.key) ?? [];
    const fields = extractTemplateFields(t.canvasJSON);
    const existingRule = rules.find((r) => r.localId === choosingForRuleId);
    handleUpdateRule(choosingForRuleId, {
      template: t,
      name: existingRule?.name === existingRule?.template?.templateName ? t.templateName : existingRule?.name ?? t.templateName,
      fieldMappings: autoMapFields(fields, cols),
    });
    setChoosingForRuleId(null);
  };

  const handleSaveRules = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      let savedCount = 0;
      for (const rule of rules) {
        if (!rule.template) continue;
        const templateMongoId = (rule.template as any)._id || rule.template.remoteId || "";
        if (!templateMongoId) continue;
        const payload = {
          projectId,
          templateId: templateMongoId,
          templateName: rule.name,
          csvFileName: csv?.fileName ?? "",
          groupOperator: rule.groupOperator,
          conditionGroups: rule.conditionGroups,
          fieldMappings: rule.fieldMappings,
          isDefault: rule.isDefault,
        };
        if (rule._id) {
          await updateRuleApi(rule._id, payload);
        } else {
          const created = await createRule(payload);
          handleUpdateRule(rule.localId, { _id: created._id });
        }
        savedCount++;
      }
      toast.success(`${savedCount} rule${savedCount !== 1 ? "s" : ""} saved`);
      // Navigate back to project after successful save
      if (projectId) navigate(`/projects/${projectId}`);
    } catch (err) {
      toast.error((err as Error).message || "Failed to save rules");
    } finally {
      setIsSaving(false);
    }
  };

  const goToStep = (target: Step) => {
    if (target === 1) { setStep(1); return; }
    if (target === 2) {
      if (!csv) { toast.error("Upload a CSV file first"); return; }
      setCompletedSteps((prev) => new Set([...prev, 1])); setStep(2); return;
    }
    if (target === 3) {
      if (!csv) { toast.error("Upload a CSV file first"); return; }
      if (rules.length === 0) { toast.error("Add at least one template rule first"); return; }
      setCompletedSteps((prev) => new Set([...prev, 1, 2])); setStep(3); return;
    }
  };

  const canProceed =
    step === 1 ? Boolean(csv) :
    step === 2 ? Boolean(csv && rules.length > 0) :
    Boolean(csv && rules.length > 0);

  if (templatesLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Restoring Rule Builder…</p>
      </div>
    );
  }

  const choosingRule = choosingForRuleId ? rules.find((r) => r.localId === choosingForRuleId) : null;

  return (
    <TooltipProvider>
      {choosingForRuleId && (
        <TemplateChooser
          allTemplates={allTemplates}
          currentTemplateId={choosingRule?.template?.id}
          onSelect={handleTemplateSelected}
          onClose={() => setChoosingForRuleId(null)}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-background">
        {/* Top header — single fixed-height row; stepper always inline */}
        <div className="border-b bg-card flex-shrink-0 z-40">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 gap-3">
            {/* Left: back + title */}
            <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
              <Button size="sm" variant="ghost" className="h-8 px-2 gap-1 text-muted-foreground flex-shrink-0" asChild>
                <Link to={`/projects/${projectId}`}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm">Back</span>
                </Link>
              </Button>
              <div className="h-4 w-px bg-border flex-shrink-0" />
              <h1 className="font-semibold text-sm whitespace-nowrap flex items-center gap-1">
                Rule Builder
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>Map multiple templates to CSV data using conditions.</TooltipContent>
                </Tooltip>
              </h1>
            </div>

            {/* Centre: stepper — always visible at all breakpoints */}
            <div className="flex flex-1 justify-center flex-shrink min-w-0 overflow-hidden">
              <Stepper current={step} completed={completedSteps} />
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {step >= 2 && (
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs hidden sm:flex"
                  onClick={handleSaveRules} disabled={isSaving || rules.length === 0}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Rules
                </Button>
              )}
              {step < 3 ? (
                <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => goToStep((step + 1) as Step)} disabled={!canProceed}>
                  <span className="hidden sm:inline">{step === 1 ? "Next: Rule Builder" : "Next: Field Mapping"}</span>
                  <span className="sm:hidden">Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" className="h-8 gap-1 text-xs" onClick={handleSaveRules} disabled={isSaving || rules.length === 0}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Save &amp; Finish</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className={`flex-1 flex flex-col overflow-hidden min-h-0`}>
          {step === 1 && (
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
              <StepUploadCsv
                csv={csv}
                savedInfo={csvSavedInfo}
                onCsvLoaded={handleCsvLoaded}
                onContinue={() => {
                  setCompletedSteps((prev) => new Set([...prev, 1 as Step]));
                  setStep(2);
                }}
              />
            </div>
          )}
          {step === 2 && (
            <StepRuleBuilder
              rules={rules}
              selectedRuleId={selectedRuleId}
              csv={csv}
              allTemplates={allTemplates}
              defaultTemplateId={defaultTemplateId}
              onSelectRule={setSelectedRuleId}
              onAddRule={handleAddRule}
              onUpdateRule={handleUpdateRule}
              onDeleteRule={handleDeleteRule}
              onDuplicateRule={handleDuplicateRule}
              onMoveRule={handleMoveRule}
              onDefaultTemplateChange={handleDefaultTemplateChange}
              onChangeTemplate={(ruleId) => setChoosingForRuleId(ruleId)}
            />
          )}
          {step === 3 && (
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
              <StepFieldMapping
                rules={rules}
                csv={csv}
                selectedRuleId={selectedRuleId}
                onSelectRule={setSelectedRuleId}
                onUpdateRule={handleUpdateRule}
                schema={projectFieldSchema}
              />
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t bg-card flex-shrink-0">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => step > 1 ? setStep((s) => (s - 1) as Step) : navigate(`/projects/${projectId ?? ''}`)} disabled={false}>
              <ChevronLeft className="h-4 w-4" />Cancel
            </Button>

            <div className="flex items-center gap-1.5">
              {STEPS.map((s) => (
                <button key={s.id} onClick={() => { if (s.id <= step || completedSteps.has(s.id)) setStep(s.id); }}
                  className={`h-2 rounded-full transition-all ${step === s.id ? "bg-primary w-5" : completedSteps.has(s.id) ? "bg-emerald-400 w-2" : "bg-muted-foreground/30 w-2"}`} />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {step >= 2 && (
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs sm:hidden"
                  onClick={handleSaveRules} disabled={isSaving || rules.length === 0}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Rules
                </Button>
              )}
              {step < 3 ? (
                <Button size="sm" className="gap-1.5" onClick={() => goToStep((step + 1) as Step)} disabled={!canProceed}>
                  {step === 2 ? "Next: Field Mapping" : "Next: Rule Builder"}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5" onClick={handleSaveRules} disabled={isSaving || rules.length === 0}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save &amp; Finish
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
