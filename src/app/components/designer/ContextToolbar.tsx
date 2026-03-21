/**
 * ContextToolbar - floats below the main toolbar when an element is selected.
 */
import type { ReactElement, ReactNode, RefObject } from "react";
import * as fabric from "fabric";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  FlipHorizontal2,
  FlipVertical2,
  Italic,
  Minus,
  MoveHorizontal,
  Plus,
  Rows3,
  Trash2,
  Type,
  Underline,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import type { FabricCanvasHandle } from "./FabricCanvas";

const FONT_FAMILIES = [
  "Inter",
  "Poppins",
  "Roboto",
  "Montserrat",
  "Lato",
  "Open Sans",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Arial",
];

interface Props {
  selected: fabric.FabricObject | null;
  canvasRef: RefObject<FabricCanvasHandle | null>;
  onRefresh: () => void;
  onDelete: () => void;
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children as ReactElement}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function VSep() {
  return <Separator orientation="vertical" className="mx-0.5 h-5" />;
}

export function ContextToolbar({ selected, canvasRef, onRefresh, onDelete }: Props) {
  if (!selected) return null;

  const fc = canvasRef.current?.getCanvas();
  if (!fc) return null;

  const isText = selected instanceof fabric.IText || selected instanceof fabric.Textbox;
  const isRect = selected.type === "rect";
  const isImage = selected.type === "image";
  const textObj = selected as fabric.IText;
  const rectObj = selected as fabric.Rect;

  // Central update helper so every mutation path applies the same clamp+refresh flow.
  const applyProps = (props: Record<string, unknown>) => {
    selected.set(props);
    selected.setCoords();
    canvasRef.current?.constrainSelectedToSafeArea();
    fc.fire("object:modified", { target: selected });
    fc.renderAll();
    onRefresh();
  };

  const applyText = (nextText: string) => {
    textObj.set({ text: nextText });
    (textObj as any).initDimensions?.();
    textObj.setCoords();
    canvasRef.current?.constrainSelectedToSafeArea();
    fc.fire("object:modified", { target: textObj });
    fc.renderAll();
    onRefresh();
  };

  const fontSize = isText ? (textObj.fontSize ?? 16) : 0;
  const fontFamily = isText ? (textObj.fontFamily ?? "Inter") : "Inter";
  const fillColor = (selected.fill as string) ?? "#000000";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-3 py-1.5">
        {!isImage && (
          <>
            <Tip label="Fill color">
              <label className="flex cursor-pointer items-center gap-1">
                <span
                  className="h-6 w-6 rounded-full border-2 border-white ring-1 ring-border"
                  style={{ background: typeof selected.fill === "string" ? selected.fill : "#6366f1" }}
                />
                <input
                  type="color"
                  className="sr-only"
                  value={fillColor}
                  onChange={(e) => applyProps({ fill: e.target.value })}
                />
              </label>
            </Tip>
            <VSep />
          </>
        )}

        {isText && (
          <>
            <Select value={fontFamily} onValueChange={(v) => applyProps({ fontFamily: v })}>
              <SelectTrigger className="h-7 w-[120px] shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((family) => (
                  <SelectItem key={family} value={family} className="text-xs">
                    {family}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <VSep />

            <Tip label="Decrease font size">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyProps({ fontSize: Math.max(6, fontSize - 1) })}
              >
                <Minus className="h-3 w-3" />
              </Button>
            </Tip>

            <Input
              type="number"
              min={6}
              max={300}
              value={fontSize}
              onChange={(e) => applyProps({ fontSize: Math.max(6, parseInt(e.target.value, 10) || 6) })}
              className="h-7 w-14 shrink-0 px-1 text-center text-xs"
            />

            <Tip label="Increase font size">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyProps({ fontSize: Math.min(300, fontSize + 1) })}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </Tip>

            <VSep />

            <Tip label="Text color">
              <label className="flex cursor-pointer items-center gap-1">
                <div className="relative flex h-7 w-7 items-center justify-center rounded border">
                  <Type className="h-4 w-4" />
                  <span
                    className="absolute bottom-0 left-0 right-0 h-1 rounded-full"
                    style={{ background: (textObj.fill as string) ?? "#000000" }}
                  />
                </div>
                <input
                  type="color"
                  className="sr-only"
                  value={(textObj.fill as string) ?? "#000000"}
                  onChange={(e) => applyProps({ fill: e.target.value })}
                />
              </label>
            </Tip>

            <VSep />

            <Tip label="Bold">
              <Button
                variant={textObj.fontWeight === "bold" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyProps({ fontWeight: textObj.fontWeight === "bold" ? "normal" : "bold" })}
              >
                <Bold className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <Tip label="Italic">
              <Button
                variant={textObj.fontStyle === "italic" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() =>
                  applyProps({ fontStyle: textObj.fontStyle === "italic" ? "normal" : "italic" })
                }
              >
                <Italic className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <Tip label="Underline">
              <Button
                variant={textObj.underline ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyProps({ underline: !textObj.underline })}
              >
                <Underline className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <VSep />

            {(["left", "center", "right", "justify"] as const).map((align) => {
              const Icon =
                align === "left"
                  ? AlignLeft
                  : align === "center"
                    ? AlignCenter
                    : align === "right"
                      ? AlignRight
                      : AlignJustify;

              return (
                <Tip key={align} label={`Align ${align}`}>
                  <Button
                    variant={textObj.textAlign === align ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => applyProps({ textAlign: align })}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              );
            })}

            <VSep />

            <Tip label="Line height">
              <div className="flex items-center gap-0.5">
                <Rows3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  type="number"
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={+(textObj.lineHeight ?? 1.16).toFixed(2)}
                  onChange={(e) => applyProps({ lineHeight: parseFloat(e.target.value) || 1 })}
                  className="h-7 w-14 shrink-0 px-1 text-center text-xs"
                />
              </div>
            </Tip>

            <Tip label="Letter spacing (EM x 1000)">
              <div className="flex items-center gap-0.5">
                <MoveHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  type="number"
                  min={-500}
                  max={2000}
                  step={10}
                  value={textObj.charSpacing ?? 0}
                  onChange={(e) => applyProps({ charSpacing: parseInt(e.target.value, 10) || 0 })}
                  className="h-7 w-16 shrink-0 px-1 text-center text-xs"
                />
              </div>
            </Tip>

            <VSep />

            <Tip label="UPPERCASE">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyText((textObj.text ?? "").toUpperCase())}
              >
                <CaseUpper className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <Tip label="lowercase">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyText((textObj.text ?? "").toLowerCase())}
              >
                <CaseLower className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <Tip label="Capitalize">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyText((textObj.text ?? "").replace(/\b\w/g, (c) => c.toUpperCase()))}
              >
                <CaseSensitive className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <VSep />
          </>
        )}

        {isRect && (
          <>
            <Tip label="Corner radius">
              <div className="flex items-center gap-0.5">
                <span className="shrink-0 text-[10px] text-muted-foreground">R</span>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  value={rectObj.rx ?? 0}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    applyProps({ rx: v, ry: v });
                  }}
                  className="h-7 w-14 shrink-0 px-1 text-center text-xs"
                />
              </div>
            </Tip>
            <VSep />
          </>
        )}

        {!isText && !isImage && (
          <>
            <Tip label="Stroke color">
              <label className="flex cursor-pointer items-center gap-1">
                <span
                  className="h-6 w-6 rounded border-2 border-white ring-1 ring-border"
                  style={{ background: (selected.stroke as string) ?? "#000000" }}
                />
                <input
                  type="color"
                  className="sr-only"
                  value={(selected.stroke as string) ?? "#000000"}
                  onChange={(e) => applyProps({ stroke: e.target.value })}
                />
              </label>
            </Tip>

            <Tip label="Stroke width">
              <Input
                type="number"
                min={0}
                max={40}
                step={0.5}
                value={(selected as fabric.Rect).strokeWidth ?? 0}
                onChange={(e) => applyProps({ strokeWidth: parseFloat(e.target.value) || 0 })}
                className="h-7 w-14 shrink-0 px-1 text-center text-xs"
              />
            </Tip>

            <VSep />
          </>
        )}

        <Tip label="Opacity %">
          <div className="flex items-center gap-0.5">
            <span className="shrink-0 text-[10px] text-muted-foreground">a</span>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={Math.round((selected.opacity ?? 1) * 100)}
              onChange={(e) => applyProps({ opacity: (parseInt(e.target.value, 10) || 0) / 100 })}
              className="h-7 w-14 shrink-0 px-1 text-center text-xs"
            />
          </div>
        </Tip>

        <VSep />

        <Tip label="Flip horizontal">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => applyProps({ flipX: !selected.flipX })}
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" />
          </Button>
        </Tip>

        <Tip label="Flip vertical">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => applyProps({ flipY: !selected.flipY })}
          >
            <FlipVertical2 className="h-3.5 w-3.5" />
          </Button>
        </Tip>

        <VSep />

        <Tip label="Delete (Del)">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </Tip>
      </div>
    </TooltipProvider>
  );
}
