import { useState, useRef, useEffect } from "react";
import * as fabric from "fabric";
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
import { Slider } from "../ui/slider";
import {
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, ImagePlus,
  Lock, Unlock, ChevronsUp, ChevronsDown, ArrowUp, ArrowDown, Maximize2,
  WrapText, RefreshCw, Upload, CaseUpper, CaseLower, CaseSensitive, Trash2,
  Rows3, MoveHorizontal, RectangleHorizontal, Type,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { pxToMm, MM_TO_PX } from "../../../lib/fabricUtils";
import type { FabricCanvasHandle } from "./FabricCanvas";

/**
 * Sanitise a colour value for use in <input type="color">.
 * The browser requires a strict "#rrggbb" format; values like "transparent",
 * "", undefined or rgb(…) are rejected and produce console warnings.
 */
function toColorInput(val: unknown, fallback = "#000000"): string {
  const s = String(val ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

export type CustomFont = { name: string; dataUrl: string };

interface Props {
  selected: fabric.FabricObject | null;
  canvasRef: React.RefObject<FabricCanvasHandle | null>;
  onRefresh: () => void;
  displayScale: number;
  customFonts?: CustomFont[];
  onAddCustomFont?: (font: CustomFont) => void;
}

const FONT_FAMILIES = [
  "Inter", "Poppins", "Roboto", "Montserrat", "Lato", "Open Sans", "Georgia",
  "Times New Roman", "Courier New", "Arial",
];

const CUSTOM_TEXT_EFFECTS_KEY = "designer_custom_text_effects";

type TextEffectConfig = {
  stroke: string;
  strokeWidth: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
};

type TextEffectPreset = {
  id: string;
  label: string;
  config: TextEffectConfig;
};

const TEXT_EFFECT_PRESETS: TextEffectPreset[] = [
  {
    id: "clean",
    label: "Clean",
    config: {
      stroke: "#000000",
      strokeWidth: 0,
      shadowEnabled: false,
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
  },
  {
    id: "outline-bold",
    label: "Outline",
    config: {
      stroke: "#0f172a",
      strokeWidth: 2,
      shadowEnabled: false,
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
  },
  {
    id: "drop-shadow",
    label: "Shadow",
    config: {
      stroke: "#000000",
      strokeWidth: 0,
      shadowEnabled: true,
      shadowColor: "#0f172a",
      shadowOpacity: 0.35,
      shadowBlur: 10,
      shadowOffsetX: 3,
      shadowOffsetY: 4,
    },
  },
  {
    id: "glow-cyan",
    label: "Glow",
    config: {
      stroke: "#06b6d4",
      strokeWidth: 1,
      shadowEnabled: true,
      shadowColor: "#22d3ee",
      shadowOpacity: 0.85,
      shadowBlur: 20,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
  },
  {
    id: "soft-pop",
    label: "Soft Pop",
    config: {
      stroke: "#ffffff",
      strokeWidth: 1,
      shadowEnabled: true,
      shadowColor: "#111827",
      shadowOpacity: 0.22,
      shadowBlur: 14,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
    },
  },
  {
    id: "hard-shadow",
    label: "Hard Shadow",
    config: {
      stroke: "#000000",
      strokeWidth: 0,
      shadowEnabled: true,
      shadowColor: "#000000",
      shadowOpacity: 0.5,
      shadowBlur: 0,
      shadowOffsetX: 4,
      shadowOffsetY: 4,
    },
  },
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hexToRgba(hex: string, opacity: number): string {
  const cleaned = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(cleaned)) {
    return `rgba(0,0,0,${clamp(opacity, 0, 1)})`;
  }
  const expanded = cleaned.length === 3
    ? cleaned.split("").map((ch) => `${ch}${ch}`).join("")
    : cleaned;
  const value = Number.parseInt(expanded, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${clamp(opacity, 0, 1).toFixed(3)})`;
}

function normalizeColorToHex(color: string | undefined, fallback = "#000000"): string {
  if (!color) return fallback;
  const raw = color.trim();

  const hex = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hex) {
    const token = hex[1];
    if (token.length === 3) {
      const expanded = token.split("").map((ch) => `${ch}${ch}`).join("");
      return `#${expanded}`;
    }
    return `#${token.slice(0, 6)}`;
  }

  const rgba = raw.match(/rgba?\(([^)]+)\)/i);
  if (!rgba) return fallback;
  const parts = rgba[1].split(",").map((part) => Number(part.trim()));
  const r = clamp(Number.isFinite(parts[0]) ? parts[0] : 0, 0, 255);
  const g = clamp(Number.isFinite(parts[1]) ? parts[1] : 0, 0, 255);
  const b = clamp(Number.isFinite(parts[2]) ? parts[2] : 0, 0, 255);
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseColorOpacity(color: string | undefined): { hex: string; opacity: number } {
  if (!color) return { hex: "#000000", opacity: 1 };
  const raw = color.trim();

  const rgba = raw.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((part) => part.trim());
    const r = Number(parts[0] ?? 0);
    const g = Number(parts[1] ?? 0);
    const b = Number(parts[2] ?? 0);
    const a = Number(parts[3] ?? 1);
    const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      opacity: clamp(Number.isFinite(a) ? a : 1, 0, 1),
    };
  }

  return { hex: normalizeColorToHex(raw), opacity: 1 };
}

function loadCustomTextEffects(): TextEffectPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TEXT_EFFECTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistCustomTextEffects(effects: TextEffectPreset[]) {
  localStorage.setItem(CUSTOM_TEXT_EFFECTS_KEY, JSON.stringify(effects));
}

function getTextEffectFromObject(text: fabric.IText | fabric.Textbox): TextEffectConfig {
  const shadowRaw =
    text.shadow instanceof fabric.Shadow
      ? text.shadow.toObject()
      : (text.shadow as Record<string, unknown> | null | undefined);
  const shadowColor = parseColorOpacity(
    typeof shadowRaw?.color === "string" ? shadowRaw.color : undefined
  );

  return {
    stroke: normalizeColorToHex(text.stroke as string | undefined, "#000000"),
    strokeWidth: Number(text.strokeWidth ?? 0),
    shadowEnabled: Boolean(shadowRaw),
    shadowColor: shadowColor.hex,
    shadowOpacity: shadowColor.opacity,
    shadowBlur: Number((shadowRaw?.blur as number | undefined) ?? 0),
    shadowOffsetX: Number((shadowRaw?.offsetX as number | undefined) ?? 0),
    shadowOffsetY: Number((shadowRaw?.offsetY as number | undefined) ?? 0),
  };
}

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
  );
}

/** Reusable numeric input paired with a slider. Shows [ value ] unit inline. */
function NumericInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit = "px",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const [raw, setRaw] = useState<string>(() =>
    String(Number.isFinite(value) ? value : 0)
  );
  const editingRef = useRef(false);

  // Sync from external changes (slider movement) while not being edited
  useEffect(() => {
    if (!editingRef.current) {
      setRaw(String(Number.isFinite(value) ? value : 0));
    }
  }, [value]);

  const commit = (str: string) => {
    editingRef.current = false;
    const n = parseFloat(str);
    if (!Number.isFinite(n)) {
      setRaw(String(Number.isFinite(value) ? value : 0));
      return;
    }
    const clamped = clamp(n, min, max);
    setRaw(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <input
        type="number"
        className="w-10 h-6 text-[11px] text-center bg-background border rounded px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
        value={raw}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          editingRef.current = true;
          setRaw(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
      />
      {unit && (
        <span className="text-[10px] text-muted-foreground leading-none">{unit}</span>
      )}
    </div>
  );
}

export function PropertiesPanel({ selected, canvasRef, onRefresh, displayScale, customFonts = [], onAddCustomFont }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef  = useRef<HTMLInputElement>(null);
  const [lockRatio, setLockRatio] = useState(false);
  const [customTextEffects, setCustomTextEffects] = useState<TextEffectPreset[]>(loadCustomTextEffects);
  const [customEffectName, setCustomEffectName] = useState("");

  // Display px ↔ mm conversion (canvas px = realMm * MM_TO_PX * displayScale)
  const scale = displayScale > 0 ? displayScale : 1;
  const toMm  = (px: number) => pxToMm(px) / scale;
  const toPx  = (mm: number) => mm * MM_TO_PX * scale;

  const posLeft = selected ? +toMm(selected.left ?? 0).toFixed(2) : 0;
  const posTop  = selected ? +toMm(selected.top  ?? 0).toFixed(2) : 0;
  const objW    = selected ? +toMm(selected.getScaledWidth()).toFixed(2)  : 0;
  const objH    = selected ? +toMm(selected.getScaledHeight()).toFixed(2) : 0;

  const setWidth = (mm: number) => {
    if (!selected || mm <= 0) return;
    const newWpx = toPx(mm);
    const ratio  = selected.getScaledHeight() / (selected.getScaledWidth() || 1);
    selected.set({ scaleX: newWpx / (selected.width ?? 1) });
    if (lockRatio) selected.set({ scaleY: (newWpx * ratio) / (selected.height ?? 1) });
    if (selected instanceof fabric.IText || selected instanceof fabric.Textbox) {
      (selected as any).initDimensions?.();
    }
    selected.setCoords();
    canvasRef.current?.constrainSelectedToSafeArea();
    fc?.fire("object:modified", { target: selected });
    fc?.renderAll();
    onRefresh();
  };

  const setHeight = (mm: number) => {
    if (!selected || mm <= 0) return;
    const newHpx = toPx(mm);
    const ratio  = selected.getScaledWidth() / (selected.getScaledHeight() || 1);
    selected.set({ scaleY: newHpx / (selected.height ?? 1) });
    if (lockRatio) selected.set({ scaleX: (newHpx * ratio) / (selected.width ?? 1) });
    if (selected instanceof fabric.IText || selected instanceof fabric.Textbox) {
      (selected as any).initDimensions?.();
    }
    selected.setCoords();
    canvasRef.current?.constrainSelectedToSafeArea();
    fc?.fire("object:modified", { target: selected });
    fc?.renderAll();
    onRefresh();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => canvasRef.current?.addImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9 _-]/g, " ").trim() || "Custom Font";
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        const ff = new FontFace(name, `url(${dataUrl})`);
        ff.load().then((loaded) => {
          document.fonts.add(loaded);
          onAddCustomFont?.({ name, dataUrl });
          // Apply to selected text immediately
          if (selected && (selected instanceof fabric.IText || selected instanceof fabric.Textbox)) {
            selected.set({ fontFamily: name });
            canvasRef.current?.getCanvas()?.renderAll();
            onRefresh();
          }
        }).catch(() => {});
      } catch { /* FontFace may not support all formats */ }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const isText  = selected instanceof fabric.IText || selected instanceof fabric.Textbox;
  const isTextbox = selected instanceof fabric.Textbox;
  const fc = canvasRef.current?.getCanvas();
  const allFonts = [...FONT_FAMILIES, ...customFonts.map(f => f.name)];
  const textEffect = isText ? getTextEffectFromObject(selected as fabric.IText | fabric.Textbox) : null;

  const applyTextEffect = (effect: TextEffectConfig) => {
    if (!isText) return;
    const text = selected as fabric.IText | fabric.Textbox;
    const shadow = effect.shadowEnabled
      ? new fabric.Shadow({
        color: hexToRgba(effect.shadowColor, effect.shadowOpacity),
        blur: Math.max(0, effect.shadowBlur),
        offsetX: effect.shadowOffsetX,
        offsetY: effect.shadowOffsetY,
      })
      : null;

    text.set({
      stroke: effect.stroke,
      strokeWidth: Math.max(0, effect.strokeWidth),
      // paintFirst: "stroke" renders the stroke layer first, then fill on top.
      // This gives a clean outer outline — fill is never obscured by the stroke.
      // When there is no stroke, restore "fill" so there is no rendering change.
      paintFirst: effect.strokeWidth > 0 ? "stroke" : "fill",
      shadow,
    } as any);
    (text as any).initDimensions?.();
    text.setCoords();
    canvasRef.current?.constrainSelectedToSafeArea();
    fc?.fire("object:modified", { target: text });
    fc?.renderAll();
    onRefresh();
  };

  const updateTextEffect = (patch: Partial<TextEffectConfig>) => {
    if (!textEffect) return;
    applyTextEffect({ ...textEffect, ...patch });
  };

  const saveCurrentTextEffect = () => {
    if (!textEffect) return;
    const label = customEffectName.trim() || `Custom ${customTextEffects.length + 1}`;
    const nextPreset: TextEffectPreset = {
      id: `${Date.now()}`,
      label,
      config: textEffect,
    };
    const next = [nextPreset, ...customTextEffects];
    setCustomTextEffects(next);
    persistCustomTextEffects(next);
    setCustomEffectName("");
  };

  const deleteCustomTextEffect = (id: string) => {
    const next = customTextEffects.filter((effect) => effect.id !== id);
    setCustomTextEffects(next);
    persistCustomTextEffects(next);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (props: Record<string, any>) => {
    if (!fc || !selected) return;
    selected.set(props);
    if (selected instanceof fabric.IText || selected instanceof fabric.Textbox) {
      (selected as any).initDimensions?.();
    }
    selected.setCoords();
    canvasRef.current?.constrainSelectedToSafeArea();
    fc.fire("object:modified", { target: selected });
    fc.renderAll();
    onRefresh();
  };

  return (
    <div className="space-y-4 p-3">
      {/* Image upload */}
      <div>
        <SLabel>Images</SLabel>
        <Button variant="outline" className="w-full gap-2 text-xs h-8"
          onClick={() => imageInputRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" /> Upload Image
        </Button>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
          onChange={handleImageUpload} />
      </div>

      <Separator />

      {selected ? (
        <>
          {/* ── Layer Order ─────────────────────────────────────── */}
          <div>
            <SLabel>Layer Order</SLabel>
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" className="h-8 text-xs gap-1.5"
                onClick={() => { canvasRef.current?.bringForward(); onRefresh(); }}>
                <ArrowUp className="h-3 w-3" /> Forward
              </Button>
              <Button variant="outline" className="h-8 text-xs gap-1.5"
                onClick={() => { canvasRef.current?.sendBackward(); onRefresh(); }}>
                <ArrowDown className="h-3 w-3" /> Backward
              </Button>
              <Button variant="outline" className="h-8 text-xs gap-1.5"
                onClick={() => { canvasRef.current?.bringToFront(); onRefresh(); }}>
                <ChevronsUp className="h-3 w-3" /> To front
              </Button>
              <Button variant="outline" className="h-8 text-xs gap-1.5"
                onClick={() => { canvasRef.current?.sendToBack(); onRefresh(); }}>
                <ChevronsDown className="h-3 w-3" /> To back
              </Button>
            </div>
          </div>

          <Separator />

          {/* ── Align to page ────────────────────────────────────── */}
          <div>
            <SLabel>Align to page</SLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {(["Top", "Left", "Middle", "Center", "Bottom", "Right"] as const).map((label) => (
                <Button key={label} variant="outline" className="h-8 text-xs"
                  onClick={() => {
                    canvasRef.current?.alignToPage(label.toLowerCase() as Parameters<FabricCanvasHandle["alignToPage"]>[0]);
                    onRefresh();
                  }}>
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* ── Text properties ──────────────────────────────────── */}
          {isText && (
            <>
              <div>
                <SLabel>Text</SLabel>
                <Input
                  value={(selected as fabric.IText).text ?? ""}
                  onChange={(e) => {
                    (selected as fabric.IText).set({ text: e.target.value });
                    canvasRef.current?.constrainSelectedToSafeArea();
                    fc?.renderAll();
                    onRefresh();
                  }}
                  className="h-8 text-sm mb-2" placeholder="Text content"
                />

                {/* Font family + custom font upload */}
                <div className="flex gap-1 mb-2">
                  <Select value={(selected as fabric.IText).fontFamily ?? "Inter"}
                    onValueChange={(v) => set({ fontFamily: v })}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {customFonts.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Fonts</div>
                          {customFonts.map((f) => <SelectItem key={f.name} value={f.name} className="text-xs">{f.name}</SelectItem>)}
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">System Fonts</div>
                        </>
                      )}
                      {FONT_FAMILIES.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" title="Upload custom font (.ttf, .otf, .woff)"
                    onClick={() => fontInputRef.current?.click()}>
                    <Upload className="h-3 w-3" />
                  </Button>
                </div>
                <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={handleFontUpload} />

                <div className="flex items-center gap-2 mb-2">
                  <Slider min={6} max={120} step={1}
                    value={[(selected as fabric.IText).fontSize ?? 16]}
                    onValueChange={([v]) => set({ fontSize: v })} className="flex-1" />
                  <NumericInput
                    value={(selected as fabric.IText).fontSize ?? 16}
                    onChange={(v) => set({ fontSize: v })}
                    min={6} max={120} unit="px"
                  />
                </div>

                {/* Line height + letter spacing */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
                      <Rows3 className="h-3 w-3" /> Line Height
                    </Label>
                    <div className="flex items-center gap-1">
                      <Slider
                        min={0.5} max={4} step={0.05}
                        value={[(selected as fabric.IText).lineHeight ?? 1.16]}
                        onValueChange={([v]) => set({ lineHeight: +v.toFixed(2) })}
                        className="flex-1"
                      />
                      <NumericInput
                        value={+((selected as fabric.IText).lineHeight ?? 1.16).toFixed(2)}
                        onChange={(v) => set({ lineHeight: v })}
                        min={0.5} max={4} step={0.05} unit=""
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
                      <MoveHorizontal className="h-3 w-3" /> Spacing
                    </Label>
                    <div className="flex items-center gap-1">
                      <Slider
                        min={-200} max={1000} step={10}
                        value={[(selected as fabric.IText).charSpacing ?? 0]}
                        onValueChange={([v]) => set({ charSpacing: v })}
                        className="flex-1"
                      />
                      <NumericInput
                        value={(selected as fabric.IText).charSpacing ?? 0}
                        onChange={(v) => set({ charSpacing: v })}
                        min={-200} max={1000} step={10} unit=""
                      />
                    </div>
                  </div>
                </div>

                {/* Text mode selector */}
                {(() => {
                  const rawMode = (selected as any).__textMode as string | undefined;
                  // Default is "auto" (Auto Size). Legacy "none"/undefined objects
                  // also get treated as "auto" so the Auto Size button stays lit.
                  const textMode =
                    rawMode === "wrap" || rawMode === "auto_wrap"
                      ? rawMode
                      : "auto"; // auto, none, undefined → Auto Size highlighted
                  return (
                    <div className="mb-2">
                      <span className="text-[10px] text-muted-foreground font-medium block mb-1.5">Text Mode</span>
                      <ToggleGroup
                        type="single"
                        value={textMode}
                        onValueChange={(val) => {
                          // val is empty string when the active button is clicked again
                          // (toggle OFF) → fall back to Normal ("none").
                          if (!val) {
                            canvasRef.current?.setTextMode("none");
                            onRefresh();
                            return;
                          }
                          const mode = val as "auto" | "wrap" | "auto_wrap";
                          if (mode === "auto") {
                            if (isTextbox) canvasRef.current?.disableWordWrap();
                            else canvasRef.current?.setTextMode("auto");
                          } else if (mode === "wrap") {
                            if (!isTextbox) canvasRef.current?.enableWordWrap();
                            else canvasRef.current?.setTextMode("wrap");
                          } else {
                            canvasRef.current?.setTextMode("auto_wrap");
                          }
                          onRefresh();
                        }}
                        className="grid grid-cols-3 gap-1 w-full">
                        <ToggleGroupItem
                          value="auto"
                          className="h-8 flex-col gap-0.5 text-[9px] px-1 w-full"
                          title="Auto Size: single line, font dynamically scales to fit width">
                          <Maximize2 className="h-3 w-3" />
                          Auto Size
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="wrap"
                          className="h-8 flex-col gap-0.5 text-[9px] px-1 w-full"
                          title="Word Wrap: fixed width, height grows with text, font fixed">
                          <WrapText className="h-3 w-3" />
                          Word Wrap
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="auto_wrap"
                          className="h-8 flex-col gap-0.5 text-[9px] px-1 w-full"
                          title="Auto+Wrap: shrink font first, wrap when font reaches minimum">
                          <RefreshCw className="h-3 w-3" />
                          Auto+Wrap
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  );
                })()}

                <div className="flex gap-1 mb-2">
                  <Button
                    variant={(selected as fabric.IText).fontWeight === "bold" ? "secondary" : "outline"}
                    size="icon" className="h-8 w-8"
                    onClick={() => set({ fontWeight: (selected as fabric.IText).fontWeight === "bold" ? "normal" : "bold" })}>
                    <Bold className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={(selected as fabric.IText).fontStyle === "italic" ? "secondary" : "outline"}
                    size="icon" className="h-8 w-8"
                    onClick={() => set({ fontStyle: (selected as fabric.IText).fontStyle === "italic" ? "normal" : "italic" })}>
                    <Italic className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={(selected as fabric.IText).underline ? "secondary" : "outline"}
                    size="icon" className="h-8 w-8"
                    onClick={() => set({ underline: !(selected as fabric.IText).underline })}>
                    <Underline className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex gap-1 mb-2">
                  <Button
                    variant="outline"
                    className="h-8 text-xs px-2"
                    onClick={() => {
                      const txt = ((selected as fabric.IText).text ?? "").toUpperCase();
                      set({ text: txt });
                    }}
                  >
                    <CaseUpper className="h-3.5 w-3.5 mr-1" />
                    UPPER
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 text-xs px-2"
                    onClick={() => {
                      const txt = ((selected as fabric.IText).text ?? "").toLowerCase();
                      set({ text: txt });
                    }}
                  >
                    <CaseLower className="h-3.5 w-3.5 mr-1" />
                    lower
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8 text-xs px-2"
                    onClick={() => {
                      const txt = ((selected as fabric.IText).text ?? "").replace(/\b\w/g, (c) => c.toUpperCase());
                      set({ text: txt });
                    }}
                  >
                    <CaseSensitive className="h-3.5 w-3.5 mr-1" />
                    Capitalize
                  </Button>
                </div>

                <div className="flex gap-1 mb-2">
                  {(["left", "center", "right"] as const).map((align) => {
                    const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                    return (
                      <Button key={align}
                        variant={(selected as fabric.IText).textAlign === align ? "secondary" : "outline"}
                        size="icon" className="h-8 w-8"
                        onClick={() => set({ textAlign: align })}>
                        <Icon className="h-3.5 w-3.5" />
                      </Button>
                    );
                  })}
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <div className="flex gap-2 mt-0.5">
                    <input type="color"
                      value={toColorInput((selected as fabric.IText).fill, "#000000")}
                      onChange={(e) => set({ fill: e.target.value })}
                      className="h-8 w-10 rounded border cursor-pointer" />
                    <Input
                      value={((selected as fabric.IText).fill as string) ?? "#000000"}
                      onChange={(e) => set({ fill: e.target.value })}
                      className="h-8 flex-1 text-xs font-mono" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Background</Label>
                  <div className="flex gap-2 mt-0.5">
                    <input type="color"
                      value={toColorInput((selected as any).backgroundColor, "#ffffff")}
                      onChange={(e) => set({ backgroundColor: e.target.value })}
                      className="h-8 w-10 rounded border cursor-pointer" />
                    <Input
                      value={(selected as any).backgroundColor as string ?? "#ffffff"}
                      onChange={(e) => set({ backgroundColor: e.target.value })}
                      className="h-8 flex-1 text-xs font-mono" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Background Padding</Label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Slider
                      min={0} max={30} step={1}
                      value={[((selected as any).backgroundPadding as number) ?? 0]}
                      onValueChange={(v) => set({ backgroundPadding: v[0] })}
                      className="flex-1" />
                    <NumericInput
                      value={((selected as any).backgroundPadding as number) ?? 0}
                      onChange={(v) => set({ backgroundPadding: v })}
                      min={0} max={30} unit="px"
                    />
                  </div>
                </div>

                <Separator className="my-3" />

                <div>
                  <SLabel>Text Effects</SLabel>
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    {TEXT_EFFECT_PRESETS.map((preset) => (
                      <Button
                        key={preset.id}
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => applyTextEffect(preset.config)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-2 border rounded-md p-2 mb-2">
                    <Label className="text-xs text-muted-foreground">Outline</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={textEffect?.stroke ?? "#000000"}
                        onChange={(e) => updateTextEffect({ stroke: e.target.value })}
                        className="h-8 w-10 rounded border cursor-pointer"
                      />
                      <Input
                        value={textEffect?.stroke ?? "#000000"}
                        onChange={(e) => updateTextEffect({ stroke: e.target.value })}
                        className="h-8 flex-1 text-xs font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={0}
                        max={10}
                        step={0.1}
                        value={[textEffect?.strokeWidth ?? 0]}
                        onValueChange={([v]) => updateTextEffect({ strokeWidth: v })}
                        className="flex-1"
                      />
                      <NumericInput
                        value={textEffect?.strokeWidth ?? 0}
                        onChange={(v) => updateTextEffect({ strokeWidth: v })}
                        min={0} max={10} step={0.1} unit="px"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 border rounded-md p-2 mb-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Shadow / Glow</Label>
                      <Button
                        variant={textEffect?.shadowEnabled ? "secondary" : "outline"}
                        className="h-7 text-[10px] px-2"
                        onClick={() => updateTextEffect({ shadowEnabled: !(textEffect?.shadowEnabled ?? false) })}
                      >
                        {textEffect?.shadowEnabled ? "On" : "Off"}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={textEffect?.shadowColor ?? "#000000"}
                        onChange={(e) => updateTextEffect({ shadowColor: e.target.value })}
                        className="h-8 w-10 rounded border cursor-pointer"
                      />
                      <Input
                        value={textEffect?.shadowColor ?? "#000000"}
                        onChange={(e) => updateTextEffect({ shadowColor: normalizeColorToHex(e.target.value, "#000000") })}
                        className="h-8 flex-1 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Opacity</Label>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={[textEffect?.shadowOpacity ?? 0.35]}
                          onValueChange={([v]) => updateTextEffect({ shadowOpacity: v })}
                          className="flex-1"
                        />
                        <NumericInput
                          value={Math.round((textEffect?.shadowOpacity ?? 0.35) * 100)}
                          onChange={(v) => updateTextEffect({ shadowOpacity: v / 100 })}
                          min={0} max={100} unit="%"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Blur</Label>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Slider
                          min={0}
                          max={40}
                          step={1}
                          value={[textEffect?.shadowBlur ?? 0]}
                          onValueChange={([v]) => updateTextEffect({ shadowBlur: v })}
                          className="flex-1"
                        />
                        <NumericInput
                          value={textEffect?.shadowBlur ?? 0}
                          onChange={(v) => updateTextEffect({ shadowBlur: v })}
                          min={0} max={40} unit="px"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Offset X</Label>
                        <Input
                          type="number"
                          step={1}
                          value={textEffect?.shadowOffsetX ?? 0}
                          onChange={(e) => updateTextEffect({ shadowOffsetX: Number(e.target.value) || 0 })}
                          className="h-8 text-xs mt-0.5"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Offset Y</Label>
                        <Input
                          type="number"
                          step={1}
                          value={textEffect?.shadowOffsetY ?? 0}
                          onChange={(e) => updateTextEffect({ shadowOffsetY: Number(e.target.value) || 0 })}
                          className="h-8 text-xs mt-0.5"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Save Custom Preset</Label>
                    <div className="flex gap-1.5">
                      <Input
                        value={customEffectName}
                        onChange={(e) => setCustomEffectName(e.target.value)}
                        placeholder="Preset name"
                        className="h-8 text-xs"
                      />
                      <Button variant="outline" className="h-8 text-xs" onClick={saveCurrentTextEffect}>
                        Save
                      </Button>
                    </div>

                    {customTextEffects.length > 0 ? (
                      <div className="space-y-1.5">
                        {customTextEffects.map((preset) => (
                          <div
                            key={preset.id}
                            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent/60"
                          >
                            <Button
                              variant="outline"
                              className="h-7 text-[10px] px-2 flex-1 justify-start"
                              onClick={() => applyTextEffect(preset.config)}
                            >
                              {preset.label}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => deleteCustomTextEffect(preset.id)}
                              title="Delete preset"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground italic">
                        No custom text effect presets yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* ── Fill / Stroke for shapes ─────────────────────────── */}
          {!isText && selected.type !== "image" && (
            <>
              <div>
                <SLabel>Fill</SLabel>
                <div className="flex gap-2">
                  <input type="color"
                    value={toColorInput((selected as fabric.Rect).fill, "#6366f1")}
                    onChange={(e) => set({ fill: e.target.value })}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <Input value={((selected as fabric.Rect).fill as string) ?? "#6366f1"}
                    onChange={(e) => set({ fill: e.target.value })}
                    className="h-8 flex-1 text-xs font-mono" />
                </div>
              </div>
              <div>
                <SLabel>Stroke</SLabel>
                <div className="flex gap-2">
                  <input type="color"
                    value={toColorInput((selected as fabric.Rect).stroke, "#000000")}
                    onChange={(e) => set({ stroke: e.target.value })}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <div className="flex flex-col gap-1 flex-1">
                    <Input value={((selected as fabric.Rect).stroke as string) ?? "#000000"}
                      onChange={(e) => set({ stroke: e.target.value })}
                      className="h-8 text-xs font-mono" />
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[10px] text-muted-foreground shrink-0">Width</Label>
                      <Slider
                        min={0} max={20} step={0.5}
                        value={[(selected as fabric.Rect).strokeWidth ?? 1]}
                        onValueChange={([v]) => set({ strokeWidth: v })}
                        className="flex-1"
                      />
                      <NumericInput
                        value={(selected as fabric.Rect).strokeWidth ?? 1}
                        onChange={(v) => set({ strokeWidth: v })}
                        min={0} max={20} step={0.5} unit="px"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {/* Border radius — only for Rect */}
              {selected instanceof fabric.Rect && (
                <div>
                  <SLabel>Border Radius</SLabel>
                  <div className="flex items-center gap-2">
                    <RectangleHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Slider
                      min={0} max={200} step={1}
                      value={[(selected as fabric.Rect).rx ?? 0]}
                      onValueChange={([v]) => set({ rx: v, ry: v })}
                      className="flex-1"
                    />
                    <NumericInput
                      value={(selected as fabric.Rect).rx ?? 0}
                      onChange={(v) => set({ rx: v, ry: v })}
                      min={0} max={200} unit="px"
                    />
                  </div>
                </div>
              )}
              <Separator />
            </>
          )}

          {/* ── Opacity ──────────────────────────────────────────── */}
          <div>
            <SLabel>Opacity</SLabel>
            <div className="flex items-center gap-2">
              <Slider min={0} max={1} step={0.01}
                value={[selected.opacity ?? 1]}
                onValueChange={([v]) => set({ opacity: v })} className="flex-1" />
              <NumericInput
                value={Math.round((selected.opacity ?? 1) * 100)}
                onChange={(v) => set({ opacity: v / 100 })}
                min={0} max={100} unit="%"
              />
            </div>
          </div>

          <Separator />

          {/* ── Position (mm) ────────────────────────────────────── */}
          <div>
            <SLabel>Position (mm)</SLabel>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Top</Label>
                <Input type="number" step={0.1}
                  value={posTop}
                  onChange={(e) => set({ top: toPx(parseFloat(e.target.value) || 0) })}
                  className="h-8 text-sm mt-0.5" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Left</Label>
                <Input type="number" step={0.1}
                  value={posLeft}
                  onChange={(e) => set({ left: toPx(parseFloat(e.target.value) || 0) })}
                  className="h-8 text-sm mt-0.5" />
              </div>
            </div>
          </div>

          {/* ── Size (mm) ────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Size (mm)
              </span>
              <Button variant="ghost" size="icon" className="h-5 w-5 -mr-1"
                onClick={() => setLockRatio(!lockRatio)}
                title={lockRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}>
                {lockRatio
                  ? <Lock className="h-3 w-3 text-primary" />
                  : <Unlock className="h-3 w-3 text-muted-foreground" />}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Width</Label>
                <Input type="number" step={0.1} min={0.1}
                  value={objW}
                  onChange={(e) => setWidth(parseFloat(e.target.value) || 0.1)}
                  className="h-8 text-sm mt-0.5" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Height</Label>
                <Input type="number" step={0.1} min={0.1}
                  value={objH}
                  onChange={(e) => setHeight(parseFloat(e.target.value) || 0.1)}
                  className="h-8 text-sm mt-0.5" />
              </div>
            </div>
          </div>

          {/* ── Rotation ─────────────────────────────────────────── */}
          <div>
            <SLabel>Rotation</SLabel>
            <div className="flex items-center gap-2">
              <Slider min={-180} max={180} step={1}
                value={[selected.angle ?? 0]}
                onValueChange={([v]) => set({ angle: v })} className="flex-1" />
              <NumericInput
                value={Math.round(selected.angle ?? 0)}
                onChange={(v) => set({ angle: v })}
                min={-180} max={180} unit="°"
              />
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">
          Select an element on the canvas to edit its properties.
        </p>
      )}
    </div>
  );
}
