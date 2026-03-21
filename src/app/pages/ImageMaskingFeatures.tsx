import { useMemo, useState } from "react";
import { Sparkles, WandSparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import {
  DEFAULT_MASK_STYLE,
  MaskStyleConfig,
  MaskedImage,
} from "../components/ui/ImageMasking";

const PRESETS: Array<{ id: string; label: string; config: Partial<MaskStyleConfig> }> = [
  {
    id: "minimal",
    label: "Minimal Border",
    config: {
      borderWidth: 1,
      borderColor: "#cbd5e1",
      useGradientBorder: false,
      shadowEnabled: false,
      glowEnabled: false,
      opacity: 1,
      shape: "rounded",
      roundedRadius: 18,
    },
  },
  {
    id: "soft",
    label: "Soft Shadow",
    config: {
      borderWidth: 2,
      borderColor: "#dbeafe",
      shadowEnabled: true,
      shadowX: 0,
      shadowY: 12,
      shadowBlur: 30,
      shadowSpread: 2,
      shadowColor: "#0f172a",
      shadowOpacity: 0.22,
      glowEnabled: false,
    },
  },
  {
    id: "neon",
    label: "Neon Glow",
    config: {
      useGradientBorder: true,
      gradientFrom: "#06b6d4",
      gradientTo: "#ec4899",
      borderWidth: 4,
      shadowEnabled: true,
      shadowColor: "#312e81",
      shadowOpacity: 0.4,
      glowEnabled: true,
      glowColor: "#22d3ee",
      glowIntensity: 0.8,
      glowSize: 24,
      shape: "custom",
    },
  },
];

const SAMPLE_IMAGE =
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80";

export function ImageMaskingFeatures() {
  const [imageSrc, setImageSrc] = useState(SAMPLE_IMAGE);
  const [config, setConfig] = useState<MaskStyleConfig>(DEFAULT_MASK_STYLE);

  const previewSize = useMemo(() => {
    if (config.shape === "circle") {
      return { width: 320, height: 320 };
    }
    return { width: 420, height: 300 };
  }, [config.shape]);

  const update = <K extends keyof MaskStyleConfig>(key: K, value: MaskStyleConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setConfig((prev) => ({ ...prev, ...preset.config }));
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border bg-gradient-to-r from-slate-50 via-cyan-50 to-blue-50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Image Masking Studio</h1>
            <p className="mt-1 text-sm text-slate-600">
              Reusable masked image component with dynamic border, shadow, opacity, glow, and shape controls.
            </p>
          </div>
          <div className="flex gap-2">
            {PRESETS.map((preset) => (
              <Button key={preset.id} variant="outline" className="gap-2" onClick={() => applyPreset(preset.id)}>
                <Sparkles className="h-4 w-4" />
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[460px_1fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <WandSparkles className="h-4 w-4" />
              Styling Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input value={imageSrc} onChange={(e) => setImageSrc(e.target.value)} placeholder="Paste image URL" />
            </div>

            <div className="space-y-3">
              <Label>Mask Shape</Label>
              <Select value={config.shape} onValueChange={(value) => update("shape", value as MaskStyleConfig["shape"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shape" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="circle">Circle</SelectItem>
                  <SelectItem value="rounded">Rounded Rectangle</SelectItem>
                  <SelectItem value="custom">Custom Shape</SelectItem>
                </SelectContent>
              </Select>
              {config.shape === "rounded" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Corner Radius</span>
                    <span>{config.roundedRadius}px</span>
                  </div>
                  <Slider min={0} max={120} step={1} value={[config.roundedRadius]} onValueChange={([v]) => update("roundedRadius", v)} />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Border</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Gradient</span>
                  <Switch checked={config.useGradientBorder} onCheckedChange={(checked) => update("useGradientBorder", checked)} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Thickness</span>
                  <span>{config.borderWidth}px</span>
                </div>
                <Slider min={1} max={10} step={1} value={[config.borderWidth]} onValueChange={([v]) => update("borderWidth", v)} />
              </div>

              {config.useGradientBorder ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gradient From</Label>
                    <Input type="color" value={config.gradientFrom} onChange={(e) => update("gradientFrom", e.target.value)} className="h-9 p-1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gradient To</Label>
                    <Input type="color" value={config.gradientTo} onChange={(e) => update("gradientTo", e.target.value)} className="h-9 p-1" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Gradient Angle</span>
                      <span>{config.gradientAngle}deg</span>
                    </div>
                    <Slider min={0} max={360} step={1} value={[config.gradientAngle]} onValueChange={([v]) => update("gradientAngle", v)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Border Color</Label>
                  <Input type="color" value={config.borderColor} onChange={(e) => update("borderColor", e.target.value)} className="h-9 p-1" />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Shadow</Label>
                <Switch checked={config.shadowEnabled} onCheckedChange={(checked) => update("shadowEnabled", checked)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Offset X</span>
                    <span>{config.shadowX}px</span>
                  </div>
                  <Slider min={-40} max={40} step={1} value={[config.shadowX]} onValueChange={([v]) => update("shadowX", v)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Offset Y</span>
                    <span>{config.shadowY}px</span>
                  </div>
                  <Slider min={-40} max={40} step={1} value={[config.shadowY]} onValueChange={([v]) => update("shadowY", v)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Blur</span>
                    <span>{config.shadowBlur}px</span>
                  </div>
                  <Slider min={0} max={80} step={1} value={[config.shadowBlur]} onValueChange={([v]) => update("shadowBlur", v)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Spread</span>
                    <span>{config.shadowSpread}px</span>
                  </div>
                  <Slider min={-20} max={20} step={1} value={[config.shadowSpread]} onValueChange={([v]) => update("shadowSpread", v)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Shadow Color</Label>
                  <Input type="color" value={config.shadowColor} onChange={(e) => update("shadowColor", e.target.value)} className="h-9 p-1" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Opacity</span>
                    <span>{config.shadowOpacity.toFixed(2)}</span>
                  </div>
                  <Slider min={0} max={1} step={0.01} value={[config.shadowOpacity]} onValueChange={([v]) => update("shadowOpacity", v)} />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>Glow Effect</Label>
                <Switch checked={config.glowEnabled} onCheckedChange={(checked) => update("glowEnabled", checked)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Glow Color</Label>
                  <Input type="color" value={config.glowColor} onChange={(e) => update("glowColor", e.target.value)} className="h-9 p-1" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Glow Size</span>
                    <span>{config.glowSize}px</span>
                  </div>
                  <Slider min={4} max={48} step={1} value={[config.glowSize]} onValueChange={([v]) => update("glowSize", v)} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Glow Intensity</span>
                  <span>{config.glowIntensity.toFixed(2)}</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[config.glowIntensity]} onValueChange={([v]) => update("glowIntensity", v)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Label className="text-xs">Image Opacity</Label>
                <span>{config.opacity.toFixed(2)}</span>
              </div>
              <Slider min={0} max={1} step={0.01} value={[config.opacity]} onValueChange={([v]) => update("opacity", v)} />
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[560px] overflow-hidden border-dashed bg-[radial-gradient(circle_at_top,_#dbeafe,_#f8fafc_40%,_#f8fafc)] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Live Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-[460px] items-center justify-center p-6">
            <MaskedImage
              src={imageSrc}
              alt="Live masked preview"
              width={previewSize.width}
              height={previewSize.height}
              config={config}
              className="max-w-full"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
