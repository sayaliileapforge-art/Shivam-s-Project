import { useMemo, useState } from "react";
import { Search, Type, ImageIcon, Barcode, GripVertical } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type VariableFieldType = "text" | "image" | "barcode";

export interface VariableField {
  key: string;
  label: string;
  type: VariableFieldType;
}

const DEFAULT_FIELDS: VariableField[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "address", label: "Address", type: "text" },
  { key: "class", label: "Class", type: "text" },
  { key: "dob", label: "Date of Birth", type: "text" },
  { key: "roll_no", label: "Roll No", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "photo", label: "Photo", type: "image" },
  { key: "avatar", label: "Avatar", type: "image" },
  { key: "barcode", label: "Barcode", type: "barcode" },
];

interface Props {
  onAddField: (fieldKey: string) => void;
}

function FieldTypeIcon({ type }: { type: VariableFieldType }) {
  if (type === "image") return <ImageIcon className="h-3.5 w-3.5 text-sky-600" />;
  if (type === "barcode") return <Barcode className="h-3.5 w-3.5 text-emerald-600" />;
  return <Type className="h-3.5 w-3.5 text-violet-600" />;
}

export function VariableFieldsPanel({ onAddField }: Props) {
  const [query, setQuery] = useState("");
  const [customKey, setCustomKey] = useState("");

  const fields = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEFAULT_FIELDS;
    return DEFAULT_FIELDS.filter(
      (field) => field.key.toLowerCase().includes(q) || field.label.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="space-y-3 p-3">
      <div>
        <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dynamic Fields</p>
        <p className="mt-1 text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-normal max-w-full">
          Click to add, or drag a field onto the canvas.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search variables..."
          className="h-8 pl-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        {fields.map((field) => (
          <button
            key={field.key}
            draggable
            onClick={() => onAddField(field.key)}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/json",
                JSON.stringify({
                  type: "dynamic-field",
                  fieldKey: field.key,
                  fieldType: field.type,
                  label: field.label,
                })
              );
              event.dataTransfer.effectAllowed = "copy";
            }}
            className="flex w-full items-center gap-2 rounded-md border border-border/80 bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent"
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            <FieldTypeIcon type={field.type} />
            <div className="min-w-0 flex-1">
              <p className="break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-normal max-w-full text-xs font-medium leading-4">{field.label}</p>
              <p className="break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-normal max-w-full text-[10px] text-muted-foreground">{"{{"}{field.key}{"}}"}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-md border border-dashed p-2">
        <p className="mb-1 ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Field</p>
        <div className="flex gap-1.5">
          <Input
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder="student_id"
            className="h-8 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs"
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
