import { useMemo, useState } from "react";
import {
  Search, Type, ImageIcon, Barcode, GripVertical, FileText,
  ChevronDown, ChevronRight, Building2, GraduationCap,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import type { CsvField } from "../../../lib/csvBinding";

export type VariableFieldType = "text" | "image" | "barcode";

export interface VariableField {
  key: string;
  label: string;
  type: VariableFieldType;
  fromCsv?: boolean;
  /** Which predefined group this field belongs to (for search result labelling). */
  group?: "client" | "school";
}

// ── Client Variables ──────────────────────────────────────────────────────────
const CLIENT_FIELDS: VariableField[] = [
  { key: "company_name",    label: "Company Name",    type: "text",  group: "client" },
  { key: "logo",            label: "Logo",            type: "image", group: "client" },
  { key: "address",         label: "Address",         type: "text",  group: "client" },
  { key: "email",           label: "Email",           type: "text",  group: "client" },
  { key: "mobile",          label: "Mobile",          type: "text",  group: "client" },
  { key: "phone",           label: "Phone",           type: "text",  group: "client" },
  { key: "website",         label: "Website",         type: "text",  group: "client" },
  { key: "registration_no", label: "Registration No", type: "text",  group: "client" },
  { key: "signature",       label: "Signature",       type: "image", group: "client" },
  { key: "authorized_name", label: "Authorized Name", type: "text",  group: "client" },
  { key: "designation",     label: "Designation",     type: "text",  group: "client" },
];

// ── School / Student Variables ────────────────────────────────────────────────
const SCHOOL_FIELDS: VariableField[] = [
  { key: "photo",            label: "Photo",            type: "image", group: "school" },
  { key: "full_name",        label: "Full Name",        type: "text",  group: "school" },
  { key: "school_code",      label: "School Code",      type: "text",  group: "school" },
  { key: "admission_number", label: "Admission Number", type: "text",  group: "school" },
  { key: "roll_number",      label: "Roll Number",      type: "text",  group: "school" },
  { key: "class",            label: "Class",            type: "text",  group: "school" },
  { key: "section",          label: "Section",          type: "text",  group: "school" },
  { key: "dob",              label: "Date of Birth",    type: "text",  group: "school" },
  { key: "father_name",      label: "Father Name",      type: "text",  group: "school" },
  { key: "mother_name",      label: "Mother Name",      type: "text",  group: "school" },
  { key: "father_mobile",    label: "Father Mobile",    type: "text",  group: "school" },
  { key: "address",          label: "Address",          type: "text",  group: "school" },
  { key: "school_house",     label: "School House",     type: "text",  group: "school" },
  { key: "transport_mode",   label: "Transport Mode",   type: "text",  group: "school" },
  { key: "session_year",     label: "Session Year",     type: "text",  group: "school" },
];

// Combined list used for search
const ALL_STATIC_FIELDS: VariableField[] = [
  ...CLIENT_FIELDS,
  // deduplicate school fields whose key already appears in CLIENT_FIELDS
  ...SCHOOL_FIELDS.filter(
    (sf) => !CLIENT_FIELDS.some((cf) => cf.key === sf.key)
  ),
];

interface Props {
  onAddField: (fieldKey: string, fieldType?: string) => void;
  /** Optional CSV-derived fields to show at the top. */
  csvFields?: CsvField[];
}

function FieldTypeIcon({ type }: { type: VariableFieldType }) {
  if (type === "image") return <ImageIcon className="h-3.5 w-3.5 text-sky-600" />;
  if (type === "barcode") return <Barcode className="h-3.5 w-3.5 text-emerald-600" />;
  return <Type className="h-3.5 w-3.5 text-violet-600" />;
}

interface FieldButtonProps {
  field: VariableField;
  onAdd: (key: string, type?: string) => void;
  /** Show a small group badge in search results. */
  showGroup?: boolean;
}
function FieldButton({ field, onAdd, showGroup }: FieldButtonProps) {
  return (
    <button
      draggable
      onClick={() => onAdd(field.key, field.type)}
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
      className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-accent ${
        field.fromCsv
          ? "border-primary/30 bg-primary/5 hover:border-primary/50"
          : "border-border/80 bg-card"
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      <FieldTypeIcon type={field.type} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-normal max-w-full text-xs font-medium leading-4">
            {field.label}
          </p>
          {showGroup && field.group && (
            <Badge
              variant="outline"
              className={`text-[9px] h-3.5 px-1 shrink-0 ${
                field.group === "client"
                  ? "border-orange-300 text-orange-600"
                  : "border-blue-300 text-blue-600"
              }`}
            >
              {field.group === "client" ? "Client" : "School"}
            </Badge>
          )}
        </div>
        <p className="break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-normal max-w-full text-[10px] text-muted-foreground">
          {"{{"}{field.key}{"}}"}
        </p>
      </div>
    </button>
  );
}

interface GroupSectionProps {
  title: string;
  icon: React.ReactNode;
  fields: VariableField[];
  onAdd: (key: string) => void;
  defaultOpen?: boolean;
  accentClass?: string;
}
function GroupSection({ title, icon, fields, onAdd, defaultOpen = true, accentClass = "" }: GroupSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs font-semibold uppercase tracking-wider hover:bg-accent/60 transition-colors ${accentClass}`}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {icon}
        <span>{title}</span>
        <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1.5">{fields.length}</Badge>
      </button>
      {open && (
        <div className="space-y-1 p-1.5 pt-0.5">
          {fields.map((f) => (
            <FieldButton key={f.key} field={f} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  );
}

export function VariableFieldsPanel({ onAddField, csvFields }: Props) {
  const [query, setQuery] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [activeTab, setActiveTab] = useState<"student" | "client">("student");

  const csvMapped: VariableField[] = useMemo(
    () =>
      (csvFields ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        fromCsv: true,
      })),
    [csvFields]
  );

  // Search results: filtered across CSV + static fields (deduplicated by key)
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const results: VariableField[] = [];
    const pool: VariableField[] = [...csvMapped, ...ALL_STATIC_FIELDS];
    for (const f of pool) {
      if (seen.has(f.key)) continue;
      if (f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)) {
        seen.add(f.key);
        results.push(f);
      }
    }
    return results;
  }, [query, csvMapped]);

  const isSearching = query.trim().length > 0;

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Variable Fields
        </p>
        <p className="text-[10px] text-muted-foreground">Click or drag to canvas</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search variables…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {isSearching ? (
        /* ── Search results (flat, with group badge) ── */
        <div className="space-y-1.5">
          {searchResults.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-4">No variables match "{query}"</p>
          ) : (
            searchResults.map((f) => (
              <FieldButton key={f.key} field={f} onAdd={onAddField} showGroup />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* ── CSV fields (when available) ── */}
          {csvMapped.length > 0 && (
            <div className="rounded-md border border-primary/30 overflow-hidden">
              <div className="flex items-center gap-2 px-2.5 py-2 bg-primary/5">
                <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-xs font-semibold uppercase tracking-wider text-primary flex-1">
                  CSV Fields
                </p>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{csvMapped.length}</Badge>
              </div>
              <div className="space-y-1 p-1.5 pt-0.5">
                {csvMapped.map((f) => (
                  <FieldButton key={f.key} field={f} onAdd={onAddField} />
                ))}
              </div>
            </div>
          )}

          {/* ── Tab toggle ── */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setActiveTab("student")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "student"
                  ? "bg-background text-blue-600 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5 shrink-0" />
              Student
            </button>
            <button
              onClick={() => setActiveTab("client")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "client"
                  ? "bg-background text-orange-600 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              Client
            </button>
          </div>

          {/* ── Active tab fields ── */}
          <div className="space-y-1">
            {activeTab === "student"
              ? SCHOOL_FIELDS.map((f) => (
                  <FieldButton key={f.key} field={f} onAdd={onAddField} />
                ))
              : CLIENT_FIELDS.map((f) => (
                  <FieldButton key={f.key} field={f} onAdd={onAddField} />
                ))}
          </div>
        </div>
      )}

      {/* Custom field */}
      <div className="rounded-md border border-dashed p-2">
        <p className="mb-1 ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Custom Field
        </p>
        <div className="flex gap-1.5">
          <Input
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="my_field"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const key = customKey.trim().replace(/[{}\s]/g, "");
                if (!key) return;
                onAddField(key);
                setCustomKey("");
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs shrink-0"
            onClick={() => {
              const key = customKey.trim().replace(/[{}\s]/g, "");
              if (!key) return;
              onAddField(key);
              setCustomKey("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
