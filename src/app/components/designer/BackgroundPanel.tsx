import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Pencil, X, Bookmark, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Slider } from "../ui/slider";

// --- Color palette ------------------------------------------------------------
// Organised: whites/neutrals ? dark neutrals ? reds ? oranges/yellows
//            ? greens ? teals ? blues ? purples/pinks
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
type GradientType = "linear" | "radial";

type GradientStop = {
  id: string;
  color: string;
  position: number;
  opacity: number;
};

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

// --- Saved fills (localStorage) -----------------------------------------------
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

// --- Gradient helpers ---------------------------------------------------------
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function splitTopLevelComma(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => `${c}${c}`)
      .join("");
  }
  const value = Number.parseInt(clean.slice(0, 6), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function stopToCss(stop: GradientStop): string {
  const { r, g, b } = hexToRgb(stop.color);
  return `rgba(${r},${g},${b},${clamp(stop.opacity, 0, 1).toFixed(3)}) ${clamp(stop.position, 0, 100).toFixed(1)}%`;
}

function gradientValue(type: GradientType, angle: number, stops: GradientStop[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const body = sorted.map(stopToCss).join(",");
  if (type === "radial") {
    return `radial-gradient(circle at center,${body})`;
  }
  return `linear-gradient(${angle}deg,${body})`;
}

function parseColorOpacity(color: string): { hex: string; opacity: number } {
  const rgba = color.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => p.trim());
    const r = Number(parts[0] ?? 0);
    const g = Number(parts[1] ?? 0);
    const b = Number(parts[2] ?? 0);
    const a = parts[3] === undefined ? 1 : Number(parts[3]);
    return {
      hex: rgbToHex(r, g, b),
      opacity: Number.isFinite(a) ? clamp(a, 0, 1) : 1,
    };
  }

  const hexMatch = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const raw = hexMatch[1];
    if (raw.length === 8) {
      const rgbHex = `#${raw.slice(0, 6)}`;
      const alpha = Number.parseInt(raw.slice(6), 16) / 255;
      return { hex: rgbHex, opacity: clamp(alpha, 0, 1) };
    }
    if (raw.length === 3) {
      const expanded = raw
        .split("")
        .map((c) => `${c}${c}`)
        .join("");
      return { hex: `#${expanded}`, opacity: 1 };
    }
    return { hex: `#${raw}`, opacity: 1 };
  }

  return { hex: "#000000", opacity: 1 };
}

function parseGradient(input: string): { type: GradientType; angle: number; stops: GradientStop[] } | null {
  const raw = input.trim();
  const linear = raw.match(/^linear-gradient\((.*)\)$/i);
  const radial = raw.match(/^radial-gradient\((.*)\)$/i);
  if (!linear && !radial) return null;

  const type: GradientType = linear ? "linear" : "radial";
  const inner = (linear?.[1] ?? radial?.[1] ?? "").trim();
  const args = splitTopLevelComma(inner);
  if (args.length < 2) return null;

  let angle = 90;
  let stopArgs = args;

  if (type === "linear") {
    const first = args[0];
    if (/deg$/i.test(first)) {
      const parsed = Number.parseFloat(first);
      angle = Number.isFinite(parsed) ? parsed : 90;
      stopArgs = args.slice(1);
    }
  } else if (/\bat\b|circle|ellipse/i.test(args[0])) {
    stopArgs = args.slice(1);
  }

  if (stopArgs.length < 2) return null;

  const parsedStops = stopArgs
    .map((token, idx) => {
      const m = token.match(/(.+?)\s+([-\d.]+)%$/);
      const colorToken = m ? m[1].trim() : token.trim();
      const pos = m ? Number.parseFloat(m[2]) : (idx / Math.max(stopArgs.length - 1, 1)) * 100;
      const color = parseColorOpacity(colorToken);
      return {
        id: `parsed-${idx}`,
        color: color.hex,
        opacity: color.opacity,
        position: clamp(Number.isFinite(pos) ? pos : 0, 0, 100),
      } satisfies GradientStop;
    })
    .sort((a, b) => a.position - b.position);

  return {
    type,
    angle,
    stops: parsedStops,
  };
}

interface Props {
  onSetColor: (color: string) => void;
  onSetImage: (dataUrl: string, fitMode?: "cover" | "contain") => void;
  onSetSVG: (svgString: string, fitMode?: "cover" | "contain") => void;
  onSetBackgroundFitMode?: (fitMode: "cover" | "contain") => void;
  onMoveBackground?: (offsetX: number, offsetY: number) => void;
  onResetBackgroundPosition?: () => void;
  onClearBackground: () => void;
  currentBg: string;
}

export function BackgroundPanel({
  onSetColor,
  onSetImage,
  onSetSVG,
  onSetBackgroundFitMode,
  onMoveBackground,
  onResetBackgroundPosition,
  onClearBackground,
  currentBg,
}: Props) {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [fillType, setFillType] = useState<FillType>("solid");
  const [solidColor, setSolidColor] = useState("#ffffff");
  const [gradientType, setGradientType] = useState<GradientType>("linear");
  const [gradientAngle, setGradientAngle] = useState(90);
  const [gradientStops, setGradientStops] = useState<GradientStop[]>([
    { id: "stop-0", color: "#ffffff", position: 0, opacity: 1 },
    { id: "stop-1", color: "#000000", position: 100, opacity: 1 },
  ]);
  const [selectedStopId, setSelectedStopId] = useState("stop-0");
  const [savedFills, setSavedFills] = useState<SavedFill[]>(loadSavedFills);
  const [imageFitMode, setImageFitMode] = useState<"cover" | "contain">("contain");
  const barRef = useRef<HTMLDivElement>(null);
  const draggingStopRef = useRef<string | null>(null);
  const lastAppliedBgRef = useRef<string>("");

  const currentGradient = useMemo(
    () => gradientValue(gradientType, gradientAngle, gradientStops),
    [gradientType, gradientAngle, gradientStops]
  );

  const sortedStops = useMemo(
    () => [...gradientStops].sort((a, b) => a.position - b.position),
    [gradientStops]
  );

  const selectedStop =
    gradientStops.find((stop) => stop.id === selectedStopId) ?? sortedStops[0] ?? null;

  useEffect(() => {
    // Ignore echo updates coming from this panel itself to keep editing state stable.
    if (lastAppliedBgRef.current && currentBg === lastAppliedBgRef.current) return;

    if (currentBg.startsWith("linear-gradient") || currentBg.startsWith("radial-gradient")) {
      const parsed = parseGradient(currentBg);
      if (parsed) {
        setFillType("gradient");
        setGradientType(parsed.type);
        setGradientAngle(parsed.angle);
        setGradientStops(parsed.stops);
        setSelectedStopId(parsed.stops[0]?.id ?? "stop-0");
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
    reader.onload = (ev) => onSetImage(ev.target?.result as string, imageFitMode);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleSVGFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onSetSVG(ev.target?.result as string, imageFitMode);
    reader.readAsText(file);
    e.target.value = "";
  };

  const applySolidColor = (color: string) => {
    setFillType("solid");
    setSolidColor(color);
    lastAppliedBgRef.current = color;
    onSetColor(color);
  };

  const applyGradient = (type: GradientType, angle: number, stops: GradientStop[]) => {
    setFillType("gradient");
    const css = gradientValue(type, angle, stops);
    lastAppliedBgRef.current = css;
    onSetColor(css);
  };

  const selectPreset = (preset: GradientPreset) => {
    const nextStops: GradientStop[] = [
      { id: `${Date.now()}-0`, color: preset.start, position: 0, opacity: 1 },
      { id: `${Date.now()}-1`, color: preset.end, position: 100, opacity: 1 },
    ];
    setGradientType("linear");
    setGradientStops(nextStops);
    setSelectedStopId(nextStops[0].id);
    applyGradient("linear", gradientAngle, nextStops);
  };

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const activeId = draggingStopRef.current;
      if (!activeId || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
      setGradientStops((prev) =>
        prev.map((stop) => (stop.id === activeId ? { ...stop, position: pct } : stop))
      );
    };
    const onMouseUp = () => {
      if (draggingStopRef.current) {
        draggingStopRef.current = null;
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (fillType === "gradient") {
      applyGradient(gradientType, gradientAngle, gradientStops);
    }
  }, [fillType, gradientType, gradientAngle, gradientStops]);

  const addStopAt = (position: number) => {
    const fallback = selectedStop ?? sortedStops[0] ?? { color: "#ffffff", opacity: 1 };
    const stop: GradientStop = {
      id: `stop-${Date.now()}-${Math.round(position * 10)}`,
      color: fallback.color,
      opacity: fallback.opacity,
      position: clamp(position, 0, 100),
    };
    setGradientStops((prev) => [...prev, stop]);
    setSelectedStopId(stop.id);
  };

  const removeSelectedStop = () => {
    if (!selectedStop || gradientStops.length <= 2) return;
    const next = gradientStops.filter((s) => s.id !== selectedStop.id);
    setGradientStops(next);
    setSelectedStopId(next[0]?.id ?? "");
  };

  const updateSelectedStop = (patch: Partial<GradientStop>) => {
    if (!selectedStop) return;
    setGradientStops((prev) =>
      prev.map((stop) => (stop.id === selectedStop.id ? { ...stop, ...patch } : stop))
    );
  };

  // -- Save / delete helpers ----------------------------------------------------
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
        setGradientType(parsed.type);
        setGradientAngle(parsed.angle);
        setGradientStops(parsed.stops);
        setSelectedStopId(parsed.stops[0]?.id ?? "");
        applyGradient(parsed.type, parsed.angle, parsed.stops);
      }
    }
  };

  // Already saved check
  const currentValue = fillType === "solid" ? solidColor : currentGradient;
  const isCurrentSaved = savedFills.some((f) => f.value === currentValue);

  return (
    <div className="p-3 space-y-4">
      {/* -- Fill Type -------------------------------------------------------- */}
      <div>
        <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
            onClick={() => applyGradient(gradientType, gradientAngle, gradientStops)}
          >
            Gradient
          </Button>
        </div>
      </div>

      {/* -- Solid Color ------------------------------------------------------ */}
      {fillType === "solid" && (
        <div className="space-y-3">
          {/* Current color row */}
          <div>
            <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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

          {/* Color palette � always visible */}
          <div>
            <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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

      {/* -- Gradient --------------------------------------------------------- */}
      {fillType === "gradient" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              <Button
                variant={gradientType === "linear" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setGradientType("linear")}
              >
                Linear
              </Button>
              <Button
                variant={gradientType === "radial" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setGradientType("radial")}
              >
                Radial
              </Button>
            </div>
          </div>

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
                }}
                className="flex-1"
                disabled={gradientType === "radial"}
              />
              <span className="text-xs text-muted-foreground w-12 text-right">{gradientAngle}�</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Stops</Label>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  onClick={() => addStopAt(50)}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  onClick={removeSelectedStop}
                  disabled={gradientStops.length <= 2}
                >
                  Remove
                </Button>
              </div>
            </div>

            <div
              ref={barRef}
              className="relative h-8 rounded-md border cursor-crosshair"
              style={{ background: currentGradient }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && barRef.current) {
                  const rect = barRef.current.getBoundingClientRect();
                  const pos = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
                  addStopAt(pos);
                }
              }}
              title="Click to add a stop. Drag handles to move."
            >
              {sortedStops.map((stop) => {
                const isActive = selectedStop?.id === stop.id;
                return (
                  <button
                    key={stop.id}
                    type="button"
                    className={`absolute -bottom-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 shadow ${
                      isActive ? "border-primary ring-2 ring-primary/30" : "border-white"
                    }`}
                    style={{
                      left: `${stop.position}%`,
                      backgroundColor: `rgba(${hexToRgb(stop.color).r},${hexToRgb(stop.color).g},${hexToRgb(stop.color).b},${stop.opacity})`,
                    }}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      draggingStopRef.current = stop.id;
                      setSelectedStopId(stop.id);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedStopId(stop.id);
                    }}
                    title={`${Math.round(stop.position)}%`}
                  />
                );
              })}
            </div>

            {selectedStop && (
              <div className="space-y-2 rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedStop.color}
                      onChange={(e) => updateSelectedStop({ color: e.target.value })}
                      className="h-8 w-10 rounded border cursor-pointer"
                    />
                    <span className="text-[10px] text-muted-foreground font-mono">{selectedStop.color}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-muted-foreground">Position</Label>
                    <span className="text-[10px] text-muted-foreground">{Math.round(selectedStop.position)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[selectedStop.position]}
                    onValueChange={([v]) => updateSelectedStop({ position: v })}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs text-muted-foreground">Opacity</Label>
                    <span className="text-[10px] text-muted-foreground">{Math.round(selectedStop.opacity * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(selectedStop.opacity * 100)]}
                    onValueChange={([v]) => updateSelectedStop({ opacity: clamp(v / 100, 0, 1) })}
                  />
                </div>
              </div>
            )}
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
                const value = gradientValue("linear", gradientAngle, [
                  { id: `${g.id}-a`, color: g.start, position: 0, opacity: 1 },
                  { id: `${g.id}-b`, color: g.end, position: 100, opacity: 1 },
                ]);
                const isActive = currentBg === value;
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

      {/* -- Saved Combinations ----------------------------------------------- */}
      <div>
        <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
                  className="flex-1 min-w-0 text-left text-[10px] text-muted-foreground font-mono break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-normal max-w-full leading-snug hover:text-foreground transition-colors"
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

      {/* -- Background (no bg / clear) --------------------------------------- */}
      <div>
        <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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

      {/* -- Image ------------------------------------------------------------ */}
      <div>
        <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
          Upload an image to use as canvas background.
        </p>
      </div>

      {/* -- Image Fit Mode (if image is active) ------------------------------ */}
      {(currentBg === "image" || currentBg === "svg") && (
        <>
          <Separator />
          <div>
            <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Fit Mode
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant={imageFitMode === "contain" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => {
                  setImageFitMode("contain");
                  onSetBackgroundFitMode?.("contain");
                }}
              >
                Fit
              </Button>
              <Button
                variant={imageFitMode === "cover" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => {
                  setImageFitMode("cover");
                  onSetBackgroundFitMode?.("cover");
                }}
              >
                Fill
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5 leading-tight">
              <strong>Fit:</strong> Full image visible, centered, no cropping
              <br />
              <strong>Fill:</strong> Fills entire canvas (may crop edges)
            </p>
          </div>

          {/* -- Position Controls (both modes) ------------------------------ */}
          {(imageFitMode === "contain" || imageFitMode === "cover") && (
            <>
              <Separator />
              <div>
                <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Position
                </p>
                <div className="grid grid-cols-3 gap-1 mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => onMoveBackground?.(0, -10)}
                    title="Move up"
                  >
                    ?
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => onResetBackgroundPosition?.()}
                    title="Reset to center"
                  >
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => onMoveBackground?.(0, 10)}
                    title="Move down"
                  >
                    ?
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => onMoveBackground?.(-10, 0)}
                    title="Move left"
                  >
                    ?
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    disabled
                  >
                    �
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px]"
                    onClick={() => onMoveBackground?.(10, 0)}
                    title="Move right"
                  >
                    ?
                  </Button>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1.5">
                  Use arrow buttons to adjust image position.
                </p>
              </div>
            </>
          )}
        </>
      )}

      <Separator />

      {/* -- SVG -------------------------------------------------------------- */}
      <div>
        <p className="ds-label-auto text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          SVG Background
        </p>
        <Button
          variant="outline"
          className="w-full gap-2 text-xs h-9"
          onClick={() => svgInputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          Upload SVG
        </Button>
        <input
          ref={svgInputRef}
          type="file"
          accept=".svg"
          className="hidden"
          onChange={handleSVGFile}
        />
        {currentBg === "svg" && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-1 text-xs text-destructive hover:text-destructive gap-1"
            onClick={onClearBackground}
          >
            <X className="h-3 w-3" /> Remove SVG
          </Button>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          Supports both Cover (fill) and Fit (contain) modes with positioning controls.
        </p>
      </div>
    </div>
  );
}
