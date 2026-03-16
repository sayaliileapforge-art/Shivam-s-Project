import { useState } from "react";
import { Type, Square, Circle, Minus, QrCode, Variable } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";

// Common dynamic field keys for ID cards / certificates
const DYNAMIC_FIELDS = [
  { key: "name",        label: "Name" },
  { key: "photo",       label: "Photo" },
  { key: "roll_no",     label: "Roll No" },
  { key: "class",       label: "Class" },
  { key: "section",     label: "Section" },
  { key: "dob",         label: "Date of Birth" },
  { key: "father_name", label: "Father Name" },
  { key: "mother_name", label: "Mother Name" },
  { key: "address",     label: "Address" },
  { key: "phone",       label: "Phone" },
  { key: "email",       label: "Email" },
  { key: "school_name", label: "School Name" },
  { key: "valid_till",  label: "Valid Till" },
  { key: "emp_id",      label: "Employee ID" },
  { key: "department",  label: "Department" },
  { key: "designation", label: "Designation" },
  { key: "custom",      label: "Custom…" },
];

interface Props {
  onAddText: () => void;
  onAddRect: () => void;
  onAddCircle: () => void;
  onAddLine: () => void;
  onAddQRCode: (text: string) => void;
  onAddDynamicField: (key: string) => void;
}

const SHAPE_BUTTONS = [
  { label: "Text",      icon: Type,   action: "text"   },
  { label: "Rectangle", icon: Square, action: "rect"   },
  { label: "Circle",    icon: Circle, action: "circle" },
  { label: "Line",      icon: Minus,  action: "line"   },
] as const;

export function ElementsPanel({ onAddText, onAddRect, onAddCircle, onAddLine, onAddQRCode, onAddDynamicField }: Props) {
  const [qrText, setQrText] = useState("https://example.com");
  const [customField, setCustomField] = useState("");

  const handlers: Record<string, () => void> = {
    text: onAddText, rect: onAddRect, circle: onAddCircle, line: onAddLine,
  };

  return (
    <div className="p-3 space-y-4">
      {/* Shapes & Text */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Shapes & Text
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SHAPE_BUTTONS.map(({ label, icon: Icon, action }) => (
            <Button key={action} variant="outline" className="h-14 flex-col gap-1 text-xs" onClick={handlers[action]}>
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* QR Code */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
          <QrCode className="h-3 w-3" /> QR Code
        </p>
        <Input
          value={qrText}
          onChange={(e) => setQrText(e.target.value)}
          placeholder="URL or text for QR code"
          className="h-8 text-xs mb-2"
        />
        <Button variant="outline" className="w-full gap-2 text-xs h-8" onClick={() => onAddQRCode(qrText)}>
          <QrCode className="h-3.5 w-3.5" /> Add QR Code
        </Button>
      </div>

      <Separator />

      {/* Dynamic Fields */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
          <Variable className="h-3 w-3" /> Dynamic Fields
        </p>
        <p className="text-[10px] text-muted-foreground mb-2">
          Click to place a merge field on the canvas.
        </p>
        <div className="flex flex-wrap gap-1">
          {DYNAMIC_FIELDS.filter((f) => f.key !== "custom").map((f) => (
            <button
              key={f.key}
              onClick={() => onAddDynamicField(f.key)}
              className="px-2 py-1 text-[10px] rounded-md border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors font-medium"
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* Custom field */}
        <div className="flex gap-1 mt-2">
          <Input
            value={customField}
            onChange={(e) => setCustomField(e.target.value)}
            placeholder="custom_key"
            className="h-7 text-xs flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 shrink-0"
            onClick={() => { if (customField.trim()) { onAddDynamicField(customField.trim()); setCustomField(""); } }}
          >
            + Add
          </Button>
        </div>
      </div>
    </div>
  );
}
