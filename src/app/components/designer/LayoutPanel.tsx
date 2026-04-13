import { ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  PAGE_PRESETS,
  TEMPLATE_TYPES,
  type TemplateConfig,
} from "../../../lib/fabricUtils";

interface Props {
  config: TemplateConfig;
  showMargins: boolean;
  onChange: (partial: Partial<TemplateConfig>) => void;
  onToggleMargins: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
  );
}

export function LayoutPanel({ config, showMargins, onChange, onToggleMargins }: Props) {
  const matchedPreset =
    PAGE_PRESETS.find(
      (p) =>
        p.id !== "custom" &&
        p.width === config.canvas.width &&
        p.height === config.canvas.height
    )?.id ?? "custom";

  return (
    <div className="space-y-5 p-3">

      {/* Template Name */}
      <div>
        <SectionLabel>Template Name</SectionLabel>
        <Input
          value={config.templateName}
          onChange={(e) => onChange({ templateName: e.target.value })}
          className="h-8 text-sm"
          placeholder="Untitled Template"
        />
      </div>

      <Separator />

      {/* Canvas Size */}
      <div>
        <SectionLabel>Size</SectionLabel>

        {/* Preset selector */}
        <Select
          value={matchedPreset}
          onValueChange={(id) => {
            const p = PAGE_PRESETS.find((pr) => pr.id === id);
            if (p && p.id !== "custom") {
              onChange({ canvas: { ...config.canvas, width: p.width, height: p.height } });
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs mb-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Width + Height */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Width (mm)</Label>
            <Input
              type="number"
              min={10}
              max={3000}
              value={config.canvas.width}
              onChange={(e) =>
                onChange({ canvas: { ...config.canvas, width: Math.max(10, parseInt(e.target.value) || 10) } })
              }
              className="h-8 text-sm mt-0.5"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Height (mm)</Label>
            <Input
              type="number"
              min={10}
              max={3000}
              value={config.canvas.height}
              onChange={(e) =>
                onChange({ canvas: { ...config.canvas, height: Math.max(10, parseInt(e.target.value) || 10) } })
              }
              className="h-8 text-sm mt-0.5"
            />
          </div>
        </div>

        {/* Swap orientation */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 text-xs h-7 gap-1"
          onClick={() =>
            onChange({
              canvas: { width: config.canvas.height, height: config.canvas.width },
            })
          }
        >
          <ChevronDown className="h-3 w-3 rotate-90" />
          Swap Orientation
        </Button>
      </div>

      <Separator />

      {/* Margin */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Margin (mm)</SectionLabel>
          <button
            onClick={onToggleMargins}
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${
              showMargins
                ? "bg-blue-100 text-blue-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {showMargins ? "Guides On" : "Guides Off"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["top", "left", "right", "bottom"] as (keyof TemplateConfig["margin"])[]).map((side) => (
            <div key={side}>
              <Label className="text-xs text-muted-foreground capitalize">{side}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={config.margin[side]}
                onChange={(e) =>
                  onChange({
                    margin: {
                      ...config.margin,
                      [side]: Math.max(0, parseFloat(e.target.value) || 0),
                    },
                  })
                }
                className="h-8 text-sm mt-0.5"
              />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Template Type */}
      <div>
        <SectionLabel>Template Type</SectionLabel>
        <Select
          value={config.templateType}
          onValueChange={(v) => onChange({ templateType: v as TemplateConfig["templateType"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Config JSON preview */}
      <div>
        <SectionLabel>Config JSON</SectionLabel>
        <pre className="bg-muted text-[9px] leading-relaxed p-2 rounded overflow-auto max-h-40 text-muted-foreground">
          {JSON.stringify(
            {
              templateName: config.templateName,
              templateType: config.templateType,
              canvas: config.canvas,
              margin: config.margin,
            },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
}
