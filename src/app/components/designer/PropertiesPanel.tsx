import { useState, useRef } from "react";
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
  WrapText, RefreshCw, Upload,
} from "lucide-react";
import { pxToMm, MM_TO_PX } from "../../../lib/fabricUtils";
import type { FabricCanvasHandle } from "./FabricCanvas";
import type { CurvedTextOpts } from "./CurvedTextObject";
import { CurvedText } from "./CurvedTextObject";

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

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
  );
}

export function PropertiesPanel({ selected, canvasRef, onRefresh, displayScale, customFonts = [], onAddCustomFont }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef  = useRef<HTMLInputElement>(null);
  const [lockRatio, setLockRatio] = useState(false);

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
    selected.setCoords();
    fc?.renderAll();
    onRefresh();
  };

  const setHeight = (mm: number) => {
    if (!selected || mm <= 0) return;
    const newHpx = toPx(mm);
    const ratio  = selected.getScaledWidth() / (selected.getScaledHeight() || 1);
    selected.set({ scaleY: newHpx / (selected.height ?? 1) });
    if (lockRatio) selected.set({ scaleX: (newHpx * ratio) / (selected.width ?? 1) });
    selected.setCoords();
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

  const isCurvedText = (selected as any)?.type === "CurvedText";
  const isText  = !isCurvedText && (selected instanceof fabric.IText || selected instanceof fabric.Textbox);
  const isTextbox = selected instanceof fabric.Textbox;
  const fc = canvasRef.current?.getCanvas();
  const allFonts = [...FONT_FAMILIES, ...customFonts.map(f => f.name)];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (props: Record<string, any>) => {
    if (!fc || !selected) return;
    selected.set(props);
    selected.setCoords();
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

      {isCurvedText && selected ? (
        /* ──────────── Curved Text properties ──────────── */
        <>
          <div>
            <SLabel>Arc Text</SLabel>
            <Input
              value={(selected as CurvedText).text ?? ""}
              onChange={(e) => { canvasRef.current?.updateCurvedText({ text: e.target.value }); onRefresh(); }}
              className="h-8 text-sm mb-2" placeholder="Curved text content"
            />
            <Select
              value={(selected as CurvedText).fontFamily ?? "Inter"}
              onValueChange={(v) => { canvasRef.current?.updateCurvedText({ fontFamily: v }); onRefresh(); }}
            >
              <SelectTrigger className="h-8 text-xs mb-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allFonts.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground w-16 shrink-0">Font Size</Label>
              <Slider min={8} max={80} step={1}
                value={[(selected as CurvedText).fontSize ?? 24]}
                onValueChange={([v]) => { canvasRef.current?.updateCurvedText({ fontSize: v }); onRefresh(); }}
                className="flex-1" />
              <span className="text-xs text-muted-foreground w-8 text-right">{(selected as CurvedText).fontSize ?? 24}px</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground w-16 shrink-0">Radius</Label>
              <Slider min={20} max={300} step={1}
                value={[(selected as CurvedText).radius ?? 80]}
                onValueChange={([v]) => { canvasRef.current?.updateCurvedText({ radius: v }); onRefresh(); }}
                className="flex-1" />
              <span className="text-xs text-muted-foreground w-8 text-right">{(selected as CurvedText).radius ?? 80}px</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground w-16 shrink-0">Angle</Label>
              <Slider min={-180} max={180} step={1}
                value={[(selected as CurvedText).startAngle ?? -90]}
                onValueChange={([v]) => { canvasRef.current?.updateCurvedText({ startAngle: v }); onRefresh(); }}
                className="flex-1" />
              <span className="text-xs text-muted-foreground w-8 text-right">{(selected as CurvedText).startAngle ?? -90}°</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs text-muted-foreground w-16 shrink-0">Spacing</Label>
              <Slider min={0} max={40} step={1}
                value={[(selected as CurvedText).letterSpacing ?? 5]}
                onValueChange={([v]) => { canvasRef.current?.updateCurvedText({ letterSpacing: v }); onRefresh(); }}
                className="flex-1" />
              <span className="text-xs text-muted-foreground w-6 text-right">{(selected as CurvedText).letterSpacing ?? 5}</span>
            </div>
            <div className="flex gap-1.5 mb-2">
              <Button
                variant={(selected as CurvedText).direction === "cw" ? "secondary" : "outline"}
                className="flex-1 h-8 text-xs"
                onClick={() => { canvasRef.current?.updateCurvedText({ direction: "cw" }); onRefresh(); }}
              >⟳ Clockwise</Button>
              <Button
                variant={(selected as CurvedText).direction === "ccw" ? "secondary" : "outline"}
                className="flex-1 h-8 text-xs"
                onClick={() => { canvasRef.current?.updateCurvedText({ direction: "ccw" }); onRefresh(); }}
              >⟲ Counter</Button>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex gap-2 mt-0.5">
                <input type="color"
                  value={typeof (selected as CurvedText).fill === "string" ? (selected as CurvedText).fill as string : "#000000"}
                  onChange={(e) => { canvasRef.current?.updateCurvedText({ fill: e.target.value }); onRefresh(); }}
                  className="h-8 w-10 rounded border cursor-pointer" />
                <Input
                  value={typeof (selected as CurvedText).fill === "string" ? (selected as CurvedText).fill as string : "#000000"}
                  onChange={(e) => { canvasRef.current?.updateCurvedText({ fill: e.target.value }); onRefresh(); }}
                  className="h-8 flex-1 text-xs font-mono" />
              </div>
            </div>
          </div>
          <Separator />
          {/* Position / rotation common to all objects */}
          <div>
            <SLabel>Opacity</SLabel>
            <div className="flex items-center gap-2">
              <Slider min={0} max={1} step={0.01} value={[selected.opacity ?? 1]}
                onValueChange={([v]) => set({ opacity: v })} className="flex-1" />
              <span className="text-xs text-muted-foreground w-8 text-right">{Math.round((selected.opacity ?? 1) * 100)}%</span>
            </div>
          </div>
          <div>
            <SLabel>Rotation</SLabel>
            <div className="flex items-center gap-2">
              <Slider min={-180} max={180} step={1} value={[selected.angle ?? 0]}
                onValueChange={([v]) => set({ angle: v })} className="flex-1" />
              <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(selected.angle ?? 0)}°</span>
            </div>
          </div>
        </>
      ) : selected ? (
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
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {(selected as fabric.IText).fontSize ?? 16}px
                  </span>
                </div>

                {/* Auto-fit + Word Wrap buttons */}
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <Button variant="outline" className="h-8 text-xs gap-1" title="Shrink font to fill canvas safe area"
                    onClick={() => { canvasRef.current?.autoFitText(); onRefresh(); }}>
                    <Maximize2 className="h-3 w-3" /> Auto Size
                  </Button>
                  <Button variant={isTextbox ? "secondary" : "outline"} className="h-8 text-xs gap-1" title={isTextbox ? "Word wrap is ON — click to disable" : "Word wrap is OFF — click to enable"}
                    onClick={() => {
                      if (isTextbox) canvasRef.current?.disableWordWrap();
                      else canvasRef.current?.enableWordWrap();
                      onRefresh();
                    }}>
                    <WrapText className="h-3 w-3" /> Word Wrap
                  </Button>
                  <Button variant="outline" className="h-8 text-xs gap-1 col-span-2" title="Auto-shrink font + word wrap so text fits inside the textbox"
                    onClick={() => { canvasRef.current?.autoFitTextToBox(); onRefresh(); }}>
                    <RefreshCw className="h-3 w-3" /> Auto Fit to Box
                  </Button>
                </div>

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
                      value={((selected as fabric.IText).fill as string) ?? "#000000"}
                      onChange={(e) => set({ fill: e.target.value })}
                      className="h-8 w-10 rounded border cursor-pointer" />
                    <Input
                      value={((selected as fabric.IText).fill as string) ?? "#000000"}
                      onChange={(e) => set({ fill: e.target.value })}
                      className="h-8 flex-1 text-xs font-mono" />
                  </div>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* ── Fill / Stroke for shapes ─────────────────────────── */}
          {!isText && !isCurvedText && selected.type !== "image" && (
            <>
              <div>
                <SLabel>Fill</SLabel>
                <div className="flex gap-2">
                  <input type="color"
                    value={((selected as fabric.Rect).fill as string) ?? "#6366f1"}
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
                    value={((selected as fabric.Rect).stroke as string) ?? "#000000"}
                    onChange={(e) => set({ stroke: e.target.value })}
                    className="h-8 w-10 rounded border cursor-pointer" />
                  <div className="flex flex-col gap-1 flex-1">
                    <Input value={((selected as fabric.Rect).stroke as string) ?? "#000000"}
                      onChange={(e) => set({ stroke: e.target.value })}
                      className="h-8 text-xs font-mono" />
                    <Input type="number" min={0} max={20} step={0.5}
                      value={(selected as fabric.Rect).strokeWidth ?? 1}
                      onChange={(e) => set({ strokeWidth: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs" placeholder="Stroke width" />
                  </div>
                </div>
              </div>
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
              <span className="text-xs text-muted-foreground w-8 text-right">
                {Math.round((selected.opacity ?? 1) * 100)}%
              </span>
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
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.round(selected.angle ?? 0)}°
              </span>
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
