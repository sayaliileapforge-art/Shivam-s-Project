import { useRef } from "react";
import * as fabric from "fabric";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Separator } from "../ui/separator";
import { Upload, X } from "lucide-react";
import type { FabricCanvasHandle, ImageMaskShape } from "./FabricCanvas";

interface Props {
  selected: fabric.FabricObject | null;
  canvasRef: React.RefObject<FabricCanvasHandle | null>;
  onRefresh: () => void;
}

const MASK_SHAPES: { value: ImageMaskShape; label: string; tone?: string }[] = [
  { value: "none", label: "None" },
  { value: "circle", label: "Circle", tone: "from-sky-500 to-cyan-400" },
  { value: "square", label: "Square", tone: "from-indigo-500 to-blue-500" },
  { value: "star", label: "Star", tone: "from-amber-500 to-orange-400" },
  { value: "triangle", label: "Triangle", tone: "from-emerald-500 to-green-400" },
  { value: "rounded-rectangle", label: "Rounded", tone: "from-violet-500 to-fuchsia-500" },
  { value: "diamond", label: "Diamond", tone: "from-rose-500 to-pink-500" },
  { value: "hexagon", label: "Hexagon", tone: "from-cyan-500 to-blue-400" },
  { value: "ticket", label: "Ticket", tone: "from-orange-500 to-red-400" },
  { value: "flower", label: "Brush", tone: "from-lime-500 to-emerald-500" },
];

function ShapePreview({ shape }: { shape: ImageMaskShape }) {
  if (shape === "none") {
    return <div className="h-9 w-12 rounded-sm border border-dashed border-muted-foreground/40" />;
  }
  if (shape === "circle") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <circle cx="50" cy="35" r="28" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "square") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <rect x="22" y="7" width="56" height="56" rx="3" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "rounded" || shape === "rounded-rectangle") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <rect x="10" y="10" width="80" height="50" rx="16" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "triangle") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <polygon points="50,5 92,64 8,64" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "diamond") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <polygon points="50,5 90,35 50,65 10,35" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "hexagon") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <polygon points="24,7 76,7 94,35 76,63 24,63 6,35" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "star") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <polygon points="50,4 61,26 86,26 66,41 74,64 50,50 26,64 34,41 14,26 39,26" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "ticket") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <path d="M6 8h26a8 8 0 0 0 16 0h46v54H48a8 8 0 0 0-16 0H6z" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "flower") {
    return (
      <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
        <path d="M50 6L58 18L72 12L74 26L88 30L80 42L88 54L74 58L72 62L58 52L50 64L42 52L28 62L26 58L12 54L20 42L12 30L26 26L28 12L42 18Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 70" className="h-9 w-12" aria-hidden>
      <rect x="10" y="10" width="80" height="50" fill="currentColor" />
    </svg>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
  );
}

export function MaskPanel({ selected, canvasRef, onRefresh }: Props) {
  const isImage = selected?.type === "image";
  const pngMaskInputRef = useRef<HTMLInputElement>(null);

  if (!selected) {
    return (
      <div className="p-5 text-center text-xs text-muted-foreground leading-relaxed">
        Select an element to access masking controls.
      </div>
    );
  }

  if (!isImage) {
    return (
      <div className="p-5 text-center text-xs text-muted-foreground leading-relaxed">
        Masking is available only for image elements.
      </div>
    );
  }

  const image = selected as fabric.FabricImage & {
    maskShape?: ImageMaskShape;
    maskRadius?: number;
    _pngMaskSrc?: string;
    _originalSrc?: string;
  };
  const maskShape  = image.maskShape  ?? "none";
  const maskRadius = Number(image.maskRadius ?? 24);
  const hasPngMask = Boolean(image._pngMaskSrc);

  const handlePngMaskUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      canvasRef.current?.applyPNGMask(ev.target?.result as string);
      onRefresh();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4 p-3">

      {/* ── PNG Mask ──────────────────────────────────────────── */}
      <div>
        <SLabel>PNG Shape Mask</SLabel>
        <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
          Upload a PNG with a transparent background. The image will be clipped to the opaque areas of the PNG.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-8 text-xs gap-1.5"
            onClick={() => pngMaskInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" /> Upload PNG Mask
          </Button>
          {hasPngMask && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              title="Remove PNG mask"
              onClick={() => { canvasRef.current?.removePNGMask(); onRefresh(); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {hasPngMask && (
          <p className="text-[10px] text-primary mt-1.5">✓ PNG mask active — click ✕ to restore original</p>
        )}
        <input
          ref={pngMaskInputRef}
          type="file"
          accept="image/png,image/webp"
          className="hidden"
          onChange={handlePngMaskUpload}
        />
      </div>

      <Separator />

      {/* ── Geometric Mask Shapes ─────────────────────────────── */}
      <div>
        <SLabel>Mask Shape</SLabel>
        <div className="grid grid-cols-2 gap-2">
          {MASK_SHAPES.map((shape) => (
            <button
              key={shape.value}
              type="button"
              className={`group flex flex-col items-center justify-center gap-1 rounded-lg border p-2 transition-all ${
                maskShape === shape.value
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border hover:border-primary/40 hover:bg-accent"
              }`}
              onClick={() => {
                canvasRef.current?.applyImageMask(shape.value, maskRadius);
                onRefresh();
              }}
            >
              <div className={`flex h-10 w-full items-center justify-center rounded-md bg-gradient-to-br ${shape.tone ?? "from-slate-600 to-slate-500"} text-white`}>
                <ShapePreview shape={shape.value} />
              </div>
              <span className="text-[10px] font-medium text-foreground/90 leading-none">{shape.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Corner Radius</Label>
          <Input
            type="number"
            min={0}
            max={300}
            step={1}
            value={Math.round(maskRadius)}
            onChange={(e) => {
              const value = Math.max(0, Number(e.target.value) || 0);
              canvasRef.current?.setImageBorderRadius(value);
              onRefresh();
            }}
            className="h-7 w-20 text-xs"
          />
        </div>
        <Slider
          min={0}
          max={300}
          step={1}
          value={[Math.max(0, Math.min(300, maskRadius))]}
          onValueChange={([v]) => {
            canvasRef.current?.setImageBorderRadius(v);
            onRefresh();
          }}
        />
      </div>
    </div>
  );
}
