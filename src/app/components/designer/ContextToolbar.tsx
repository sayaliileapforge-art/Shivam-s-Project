/**
 * ContextToolbar — floats below the main toolbar when an element is selected.
 * Shows context-sensitive controls matching the reference screenshot:
 *   fill color · font family · font size · bold · italic · underline ·
 *   text align · line height · letter spacing · text case ·
 *   corner radius (rect) · opacity · flip H/V · delete
 */
import * as fabric from "fabric";
import {
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  FlipHorizontal2, FlipVertical2,
  Trash2, Type, Minus, Plus, CaseSensitive, CaseUpper, CaseLower,
  MoveHorizontal, Rows3,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "../ui/tooltip";
import type { FabricCanvasHandle } from "./FabricCanvas";

const FONT_FAMILIES = [
  "Inter", "Poppins", "Roboto", "Montserrat", "Lato",
  "Open Sans", "Georgia", "Times New Roman", "Courier New", "Arial",
];

interface Props {
  selected: fabric.FabricObject | null;
  canvasRef: React.RefObject<FabricCanvasHandle | null>;
  onRefresh: () => void;
  onDelete: () => void;
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children as React.ReactElement}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function VSep() {
  return <Separator orientation="vertical" className="h-5 mx-0.5" />;
}

export function ContextToolbar({ selected, canvasRef, onRefresh, onDelete }: Props) {
  if (!selected) return null;

  const fc = canvasRef.current?.getCanvas();
  if (!fc) return null;

  const isText = selected instanceof fabric.IText || selected instanceof fabric.Textbox;
  const isRect = selected.type === "rect";
  const t = selected as fabric.IText;
  const r = selected as fabric.Rect;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (props: Record<string, any>) => {
    selected.set(props);
    selected.setCoords();
    fc.renderAll();
    onRefresh();
  };

  const fontSize  = isText ? (t.fontSize ?? 16) : 0;
  const fontFam   = isText ? (t.fontFamily ?? "Inter") : "";
  const fillColor = (selected.fill as string) ?? "#000000";
  const isImage   = selected.type === "image";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-card shrink-0 overflow-x-auto">

        {/* ── Fill colour ─────────────────────────────────────────── */}
        {!isImage && (
          <>
            <Tip label="Fill color">
              <label className="flex items-center gap-1 cursor-pointer">
                <span
                  className="h-6 w-6 rounded-full border-2 border-white shadow ring-1 ring-border"
                  style={{ background: typeof selected.fill === "string" ? selected.fill : "#6366f1" }}
                />
                <input
                  type="color"
                  className="sr-only"
                  value={fillColor}
                  onChange={(e) => set({ fill: e.target.value })}
                />
              </label>
            </Tip>
            <VSep />
          </>
        )}

        {/* ── Text-only controls ───────────────────────────────────── */}
        {isText && (
          <>
            {/* Font family */}
            <Select value={fontFam} onValueChange={(v) => set({ fontFamily: v })}>
              <SelectTrigger className="h-7 text-xs w-[110px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <VSep />

            {/* Font size */}
            <Tip label="Decrease font size">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => set({ fontSize: Math.max(6, fontSize - 1) })}>
                <Minus className="h-3 w-3" />
              </Button>
            </Tip>
            <Input
              type="number" min={6} max={300}
              value={fontSize}
              onChange={(e) => set({ fontSize: parseInt(e.target.value) || 6 })}
              className="h-7 w-12 text-xs text-center px-1 shrink-0"
            />
            <Tip label="Increase font size">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => set({ fontSize: Math.min(300, fontSize + 1) })}>
                <Plus className="h-3 w-3" />
              </Button>
            </Tip>

            <VSep />

            {/* Text colour */}
            <Tip label="Text color">
              <label className="flex items-center gap-1 cursor-pointer">
                <div className="relative flex items-end">
                  <Type className="h-4 w-4" />
                  <span
                    className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-full"
                    style={{ background: (t.fill as string) ?? "#000000" }}
                  />
                </div>
                <input
                  type="color"
                  className="sr-only"
                  value={(t.fill as string) ?? "#000000"}
                  onChange={(e) => set({ fill: e.target.value })}
                />
              </label>
            </Tip>

            <VSep />

            {/* Bold / Italic / Underline */}
            <Tip label="Bold">
              <Button
                variant={t.fontWeight === "bold" ? "secondary" : "ghost"}
                size="icon" className="h-7 w-7 shrink-0"
                onClick={() => set({ fontWeight: t.fontWeight === "bold" ? "normal" : "bold" })}>
                <Bold className="h-3.5 w-3.5" />
              </Button>
            </Tip>
            <Tip label="Italic">
              <Button
                variant={t.fontStyle === "italic" ? "secondary" : "ghost"}
                size="icon" className="h-7 w-7 shrink-0"
                onClick={() => set({ fontStyle: t.fontStyle === "italic" ? "normal" : "italic" })}>
                <Italic className="h-3.5 w-3.5" />
              </Button>
            </Tip>
            <Tip label="Underline">
              <Button
                variant={t.underline ? "secondary" : "ghost"}
                size="icon" className="h-7 w-7 shrink-0"
                onClick={() => set({ underline: !t.underline })}>
                <Underline className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <VSep />

            {/* Text alignment */}
            {(["left", "center", "right", "justify"] as const).map((align) => {
              const Icon =
                align === "left" ? AlignLeft :
                align === "center" ? AlignCenter :
                align === "right" ? AlignRight : AlignJustify;
              return (
                <Tip key={align} label={`Align ${align}`}>
                  <Button
                    variant={t.textAlign === align ? "secondary" : "ghost"}
                    size="icon" className="h-7 w-7 shrink-0"
                    onClick={() => set({ textAlign: align })}>
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              );
            })}

            <VSep />

            {/* Line height */}
            <Tip label="Line height">
              <div className="flex items-center gap-0.5">
                <Rows3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  type="number" min={0.5} max={5} step={0.1}
                  value={+(t.lineHeight ?? 1.16).toFixed(2)}
                  onChange={(e) => set({ lineHeight: parseFloat(e.target.value) || 1 })}
                  className="h-7 w-14 text-xs text-center px-1 shrink-0"
                />
              </div>
            </Tip>

            {/* Letter spacing */}
            <Tip label="Letter spacing (EM×1000)">
              <div className="flex items-center gap-0.5">
                <MoveHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  type="number" min={-500} max={2000} step={10}
                  value={t.charSpacing ?? 0}
                  onChange={(e) => set({ charSpacing: parseInt(e.target.value) || 0 })}
                  className="h-7 w-16 text-xs text-center px-1 shrink-0"
                />
              </div>
            </Tip>

            <VSep />

            {/* Text case */}
            <Tip label="UPPERCASE">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 font-bold text-[10px]"
                onClick={() => { t.set({ text: (t.text ?? "").toUpperCase() }); fc.renderAll(); onRefresh(); }}>
                <CaseUpper className="h-3.5 w-3.5" />
              </Button>
            </Tip>
            <Tip label="lowercase">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-[10px]"
                onClick={() => { t.set({ text: (t.text ?? "").toLowerCase() }); fc.renderAll(); onRefresh(); }}>
                <CaseLower className="h-3.5 w-3.5" />
              </Button>
            </Tip>
            <Tip label="Capitalize">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-[10px]"
                onClick={() => {
                  const cap = (t.text ?? "").replace(/\b\w/g, (c) => c.toUpperCase());
                  t.set({ text: cap }); fc.renderAll(); onRefresh();
                }}>
                <CaseSensitive className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <VSep />
          </>
        )}

        {/* ── Rect corner radius ───────────────────────────────────── */}
        {isRect && (
          <>
            <Tip label="Corner radius">
              <div className="flex items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground shrink-0">R</span>
                <Input
                  type="number" min={0} max={200} step={1}
                  value={r.rx ?? 0}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 0;
                    set({ rx: v, ry: v });
                  }}
                  className="h-7 w-14 text-xs text-center px-1 shrink-0"
                />
              </div>
            </Tip>
            <VSep />
          </>
        )}

        {/* ── Stroke colour (non-image, non-text shapes) ──────────── */}
        {!isText && !isImage && (
          <>
            <Tip label="Stroke color">
              <label className="flex items-center gap-1 cursor-pointer">
                <span
                  className="h-6 w-6 rounded border-2 border-white shadow ring-1 ring-border"
                  style={{ background: (selected.stroke as string) ?? "#000000" }}
                />
                <input
                  type="color"
                  className="sr-only"
                  value={(selected.stroke as string) ?? "#000000"}
                  onChange={(e) => set({ stroke: e.target.value })}
                />
              </label>
            </Tip>
            <Tip label="Stroke width">
              <Input
                type="number" min={0} max={40} step={0.5}
                value={(selected as fabric.Rect).strokeWidth ?? 0}
                onChange={(e) => set({ strokeWidth: parseFloat(e.target.value) || 0 })}
                className="h-7 w-14 text-xs text-center px-1 shrink-0"
              />
            </Tip>
            <VSep />
          </>
        )}

        {/* ── Opacity ─────────────────────────────────────────────── */}
        <Tip label="Opacity %">
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground shrink-0">α</span>
            <Input
              type="number" min={0} max={100} step={1}
              value={Math.round((selected.opacity ?? 1) * 100)}
              onChange={(e) => set({ opacity: (parseInt(e.target.value) || 0) / 100 })}
              className="h-7 w-14 text-xs text-center px-1 shrink-0"
            />
          </div>
        </Tip>

        <VSep />

        {/* ── Flip ────────────────────────────────────────────────── */}
        <Tip label="Flip horizontal">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
            onClick={() => set({ flipX: !selected.flipX })}>
            <FlipHorizontal2 className="h-3.5 w-3.5" />
          </Button>
        </Tip>
        <Tip label="Flip vertical">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
            onClick={() => set({ flipY: !selected.flipY })}>
            <FlipVertical2 className="h-3.5 w-3.5" />
          </Button>
        </Tip>

        <VSep />

        {/* ── Delete ──────────────────────────────────────────────── */}
        <Tip label="Delete (Del)">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </Tip>
      </div>
    </TooltipProvider>
  );
}
