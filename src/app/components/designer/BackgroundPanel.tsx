import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Pencil, X, Bookmark, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Slider } from "../ui/slider";

// ─── Color palette ────────────────────────────────────────────────────────────
// Organised: whites/neutrals → dark neutrals → reds → oranges/yellows
//            → greens → teals → blues → purples/pinks
const COLOR_SWATCHES = [
  // Whites / Neutrals
  "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1", "#94a3b8",
  // Dark neutrals / Blacks
  "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#000000",
  // Reds
  "#fef2f2", "#fecaca", "#f87171", "#ef4444", "#dc2626", "#991b1b",
  // Oranges / Yellows
  "#fff7ed", "#fed7aa", "#fb923c", "#f97316", "#fbbf24", "#f59e0b",
  // Greens
  "#f0fdf4", "#bbf7d0", "#4ade80", "#22c55e", "#16a34a", "#15803d",
  // Teals / Cyans
  "#f0fdfa", "#99f6e4", "#2dd4bf", "#14b8a6", "#0891b2", "#0e7490",
  // Blues
  "#eff6ff", "#bfdbfe", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8",
  // Purples / Pinks
  "#fdf4ff", "#e9d5ff", "#a855f7", "#9333ea", "#ec4899", "#be185d",
];

type FillType = "solid" | "gradient";

type GradientPreset = {
  id: string;
  label: string;
  start: string;
  end: string;
};

const GRADIENT_PRESETS: GradientPreset[] = [
  { id: "spring", label: "Spring", start: "#b5ef8a", end: "#5cf4d2" },
  { id: "sky", label: "Sky", start: "#79f1ff", end: "#63a4ff" },
  { id: "mist", label: "Mist", start: "#e2e8f0", end: "#f8fafc" },
  { id: "rose-dawn", label: "Rose Dawn", start: "#c5d8ff", end: "#fda4af" },
  { id: "peach", label: "Peach", start: "#fbc2eb", end: "#fcd34d" },
  { id: "lavender", label: "Lavender", start: "#c4b5fd", end: "#bfdbfe" },
  { id: "fuchsia", label: "Fuchsia", start: "#f472b6", end: "#fb7185" },
  { id: "aqua", label: "Aqua", start: "#38bdf8", end: "#22d3ee" },
  { id: "mint", label: "Mint", start: "#34d399", end: "#6ee7b7" },
  { id: "sunrise", label: "Sunrise", start: "#fb7185", end: "#facc15" },
  { id: "deep-sea", label: "Deep Sea", start: "#1e3a8a", end: "#06b6d4" },
  { id: "silver", label: "Silver", start: "#cbd5e1", end: "#e2e8f0" },
  { id: "teal-ice", label: "Teal Ice", start: "#2dd4bf", end: "#7dd3fc" },
  { id: "soft-lemon", label: "Soft Lemon", start: "#d9f99d", end: "#fde68a" },
  { id: "emerald", label: "Emerald", start: "#10b981", end: "#14b8a6" },
  { id: "violet", label: "Violet", start: "#4f46e5", end: "#7c3aed" },
  { id: "turquoise", label: "Turquoise", start: "#22d3ee", end: "#34d399" },
  { id: "ocean-blue", label: "Ocean Blue", start: "#93c5fd", end: "#3b82f6" },
  { id: "orchid", label: "Orchid", start: "#a78bfa", end: "#f5d0fe" },
  { id: "lagoon", label: "Lagoon", start: "#0f766e", end: "#67e8f9" },
];

// ─── Saved fills (localStorage) ───────────────────────────────────────────────
const SAVED_FILLS_KEY = "designer_saved_fills";

interface SavedFill {
  id: string;
  type: "solid" | "gradient";
  value: string; // hex or linear-gradient(...)
  label: string;
}

function loadSavedFills(): SavedFill[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_FILLS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistSavedFills(fills: SavedFill[]) {
  localStorage.setItem(SAVED_FILLS_KEY, JSON.stringify(fills));
}

// ─── Gradient helpers ─────────────────────────────────────────────────────────
function gradientValue(angle: number, start: string, end: string): string {
  return `linear-gradient(${angle}deg,${start},${end})`;
}

function parseGradient(input: string): { angle: number; start: string; end: string } | null {
  const match = input.match(/linear-gradient\(([-\d.]+)deg,\s*([^,]+),\s*([^)]+)\)/i);
  if (!match) return null;
  const angle = Number(match[1]);
  return {
    angle: Number.isFinite(angle) ? angle : 90,
    start: match[2].trim(),
    end: match[3].trim(),
  };
}

interface Props {
  onSetColor: (color: string) => void;
  onSetImage: (dataUrl: string) => void;
  onClearBackground: () => void;
  currentBg: string;
}

export function BackgroundPanel({ onSetColor, onSetImage, onClearBackground, currentBg }: Props) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [fillType, setFillType] = useState<FillType>("solid");
  const [solidColor, setSolidColor] = useState("#ffffff");
  const [gradientAngle, setGradientAngle] = useState(90);
  const [gradientStart, setGradientStart] = useState("#ffffff");
  const [gradientEnd, setGradientEnd] = useState("#000000");
  const [savedFills, setSavedFills] = useState<SavedFill[]>(loadSavedFills);

  const currentGradient = useMemo(
    () => gradientValue(gradientAngle, gradientStart, gradientEnd),
    [gradientAngle, gradientStart, gradientEnd]
  );

  useEffect(() => {
    if (currentBg.startsWith("linear-gradient")) {
      const parsed = parseGradient(currentBg);
      if (parsed) {
        setFillType("gradient");
        setGradientAngle(parsed.angle);
        setGradientStart(parsed.start);
        setGradientEnd(parsed.end);
      }
      return;
    }
    if (currentBg.startsWith("#")) {
      setFillType("solid");
      setSolidColor(currentBg);
    }
  }, [currentBg]);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onSetImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const applySolidColor = (color: string) => {
    setFillType("solid");
    setSolidColor(color);
    onSetColor(color);
  };

  const applyGradient = (angle: number, start: string, end: string) => {
    setFillType("gradient");
    onSetColor(gradientValue(angle, start, end));
  };

  const selectPreset = (preset: GradientPreset) => {
    setGradientStart(preset.start);
    setGradientEnd(preset.end);
    applyGradient(gradientAngle, preset.start, preset.end);
  };

  // ── Save / delete helpers ────────────────────────────────────────────────────
  const saveFill = (type: "solid" | "gradient", value: string) => {
    // Avoid exact duplicates
    if (savedFills.some((f) => f.value === value)) return;
    const label =
      type === "solid"
        ? value.toUpperCase()
        : `Gradient ${savedFills.filter((f) => f.type === "gradient").length + 1}`;
    const next: SavedFill[] = [
      { id: `${Date.now()}`, type, value, label },
      ...savedFills,
    ];
    setSavedFills(next);
    persistSavedFills(next);
  };

  const deleteSavedFill = (id: string) => {
    const next = savedFills.filter((f) => f.id !== id);
    setSavedFills(next);
    persistSavedFills(next);
  };

  const applySavedFill = (fill: SavedFill) => {
    if (fill.type === "solid") {
      applySolidColor(fill.value);
    } else {
      const parsed = parseGradient(fill.value);
      if (parsed) {
        setGradientStart(parsed.start);
        setGradientEnd(parsed.end);
        setGradientAngle(parsed.angle);
        applyGradient(parsed.angle, parsed.start, parsed.end);
      }
    }
  };

  // Already saved check
  const currentValue =
    fillType === "solid" ? solidColor : gradientValue(gradientAngle, gradientStart, gradientEnd);
  const isCurrentSaved = savedFills.some((f) => f.value === currentValue);

  return (
    <div className="p-3 space-y-4">
      {/* ── Fill Type ──────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Fill Type
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={fillType === "solid" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => applySolidColor(solidColor)}
          >
            Solid
          </Button>
          <Button
            variant={fillType === "gradient" ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => applyGradient(gradientAngle, gradientStart, gradientEnd)}
          >
            Gradient
          </Button>
        </div>
      </div>

      {/* ── Solid Color ────────────────────────────────────────────────────── */}
      {fillType === "solid" && (
        <div className="space-y-3">
          {/* Current color row */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Fill Color
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-7 w-12 rounded border border-border shadow-sm"
                  style={{ backgroundColor: solidColor }}
                />
                <span className="text-xs text-muted-foreground font-mono">{solidColor}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => colorInputRef.current?.click()}
                  className="p-1.5 rounded hover:bg-accent transition-colors"
                  title="Pick custom color"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => saveFill("solid", solidColor)}
                  disabled={isCurrentSaved}
                  className="p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-40"
                  title={isCurrentSaved ? "Already saved" : "Save this color"}
                >
                  <Bookmark
                    className={`h-3.5 w-3.5 ${isCurrentSaved ? "fill-primary text-primary" : "text-muted-foreground"}`}
                  />
                </button>
              </div>
              <input
                ref={colorInputRef}
                type="color"
                value={solidColor}
                onChange={(e) => applySolidColor(e.target.value)}
                className="sr-only"
              />
            </div>
          </div>

          {/* Color palette – always visible */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Color Palette
            </p>
            <div className="grid grid-cols-6 gap-1">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  onClick={() => applySolidColor(color)}
                  title={color}
                  className={`h-7 w-full rounded border-2 transition-transform hover:scale-110 ${
                    currentBg === color ? "border-primary shadow-md" : "border-border/40"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Gradient ───────────────────────────────────────────────────────── */}
      {fillType === "gradient" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Angle</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Slider
                min={0}
                max={360}
                step={1}
                value={[gradientAngle]}
                onValueChange={([v]) => {
                  setGradientAngle(v);
                  applyGradient(v, gradientStart, gradientEnd);
                }}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-12 text-right">{gradientAngle}°</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Start Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={gradientStart}
                  onChange={(e) => {
                    setGradientStart(e.target.value);
                    applyGradient(gradientAngle, e.target.value, gradientEnd);
                  }}
                  className="h-8 w-10 rounded border cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground font-mono">{gradientStart}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">End Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={gradientEnd}
                  onChange={(e) => {
                    setGradientEnd(e.target.value);
                    applyGradient(gradientAngle, gradientStart, e.target.value);
                  }}
                  className="h-8 w-10 rounded border cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground font-mono">{gradientEnd}</span>
              </div>
            </div>
          </div>

          {/* Preview + save */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <button
                onClick={() => saveFill("gradient", currentGradient)}
                disabled={isCurrentSaved}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors disabled:opacity-40"
                title={isCurrentSaved ? "Already saved" : "Save this gradient"}
              >
                <Bookmark
                  className={`h-3 w-3 ${isCurrentSaved ? "fill-primary text-primary" : "text-muted-foreground"}`}
                />
                <span className={isCurrentSaved ? "text-primary" : "text-muted-foreground"}>
                  {isCurrentSaved ? "Saved" : "Save gradient"}
                </span>
              </button>
            </div>
            <div className="h-10 rounded-md border" style={{ background: currentGradient }} />
          </div>

          {/* Presets */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Presets</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {GRADIENT_PRESETS.map((g) => {
                const value = gradientValue(gradientAngle, g.start, g.end);
                const isActive =
                  currentBg === value || (g.start === gradientStart && g.end === gradientEnd);
                return (
                  <button
                    key={g.id}
                    onClick={() => selectPreset(g)}
                    title={g.label}
                    className={`h-8 rounded-md border-2 transition-transform hover:scale-105 ${
                      isActive ? "border-primary shadow-md" : "border-transparent"
                    }`}
                    style={{ background: value }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* ── Saved Combinations ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Saved Combinations
        </p>
        {savedFills.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            No saved fills yet. Use the bookmark icon to save a color or gradient.
          </p>
        ) : (
          <div className="space-y-1.5">
            {savedFills.map((fill) => (
              <div
                key={fill.id}
                className="flex items-center gap-2 group rounded-md px-1.5 py-1 hover:bg-accent/60 transition-colors"
              >
                {/* Swatch */}
                <button
                  onClick={() => applySavedFill(fill)}
                  title={`Apply: ${fill.label}`}
                  className="h-7 w-10 flex-shrink-0 rounded border border-border shadow-sm transition-transform hover:scale-105"
                  style={
                    fill.type === "solid"
                      ? { backgroundColor: fill.value }
                      : { background: fill.value }
                  }
                />
                {/* Label */}
                <button
                  onClick={() => applySavedFill(fill)}
                  className="flex-1 text-left text-[10px] text-muted-foreground font-mono truncate leading-none hover:text-foreground transition-colors"
                  title={fill.value}
                >
                  {fill.label}
                </button>
                {/* Type badge */}
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60 flex-shrink-0">
                  {fill.type}
                </span>
                {/* Delete */}
                <button
                  onClick={() => deleteSavedFill(fill.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                  title="Remove saved fill"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Background (no bg / clear) ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Background
        </p>
        <button
          onClick={onClearBackground}
          className={`w-full h-14 rounded-lg border-2 flex items-center justify-center text-xs font-medium transition-colors
            ${currentBg === "none"
              ? "border-primary text-primary bg-primary/5"
              : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground"
            }`}
          style={{
            backgroundImage:
              "repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%)",
            backgroundSize: "10px 10px",
          }}
        >
          <span className="bg-white/80 px-2 py-0.5 rounded text-xs">No background</span>
        </button>
      </div>

      <Separator />

      {/* ── Image ──────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Image
        </p>
        <Button
          variant="outline"
          className="w-full gap-2 text-xs h-9"
          onClick={() => imgInputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          Upload image
        </Button>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFile}
        />
        {currentBg === "image" && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-1 text-xs text-destructive hover:text-destructive gap-1"
            onClick={onClearBackground}
          >
            <X className="h-3 w-3" /> Remove image
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          Image will be stretched to fill the canvas.
        </p>
      </div>
    </div>
  );
}
