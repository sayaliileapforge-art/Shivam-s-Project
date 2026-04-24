/**
 * ContextToolbar - floats below the main toolbar when an element is selected.
 */
import { useState, useEffect, useRef, type ReactElement, type ReactNode, type RefObject } from "react";
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
import { applyAutoWrap, applyTextTransformValue, enableNoWrap } from "../../../lib/variableRendering";

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
  // ── Pre-compute Fabric values before hooks so they can be used as effect deps ──
  // These are re-evaluated on every render from the live Fabric object, giving
  // effects an accurate dependency to react to when the canvas changes.
  const canvasFontSize =
    selected instanceof fabric.IText || selected instanceof fabric.Textbox
      ? (selected.fontSize ?? 16)
      : 16;
  const canvasLineHeight =
    selected instanceof fabric.IText || selected instanceof fabric.Textbox
      ? (selected.lineHeight ?? 1.16)
      : 1.16;
  const canvasCharSpacing =
    selected instanceof fabric.IText || selected instanceof fabric.Textbox
      ? (selected.charSpacing ?? 0)
      : 0;

  // ── Hooks (must be before any early returns) ─────────────────────────────
  // Local editing state lets the user type freely without each keystroke
  // immediately clamping & re-applying the value.
  const [isEditingFontSize,    setIsEditingFontSize]    = useState(false);
  const [fontSizeInputVal,     setFontSizeInputVal]     = useState("16");
  const [isEditingLineHeight,  setIsEditingLineHeight]  = useState(false);
  const [lineHeightVal,        setLineHeightVal]        = useState("1.16");
  const [isEditingCharSpacing, setIsEditingCharSpacing] = useState(false);
  const [charSpacingVal,       setCharSpacingVal]       = useState("0");

  // Ref always holds the latest isEditing flags so effects can safely read
  // them without listing them as dependencies (avoids stale-closure warnings).
  const isEditingRef = useRef({ fontSize: false, lineHeight: false, charSpacing: false });
  isEditingRef.current = {
    fontSize:    isEditingFontSize,
    lineHeight:  isEditingLineHeight,
    charSpacing: isEditingCharSpacing,
  };

  // Reset editing state and re-sync all display values when selection changes.
  useEffect(() => {
    setIsEditingFontSize(false);
    setIsEditingLineHeight(false);
    setIsEditingCharSpacing(false);
    const isTextEl =
      selected instanceof fabric.IText || selected instanceof fabric.Textbox;
    const fs = isTextEl ? ((selected as fabric.IText).fontSize   ?? 16)   : 16;
    const lh = isTextEl ? ((selected as fabric.IText).lineHeight  ?? 1.16) : 1.16;
    const cs = isTextEl ? ((selected as fabric.IText).charSpacing ?? 0)   : 0;
    setFontSizeInputVal(String(fs));
    setLineHeightVal(String(+lh.toFixed(2)));
    setCharSpacingVal(String(cs));
  }, [selected]);

  // Sync display values when the canvas changes them on the SAME element
  // (e.g., auto-fit font resize on handle drag, undo/redo, Properties panel
  // slider changes).  The isEditingRef guard prevents interrupting a user who
  // is actively typing in the input.
  useEffect(() => {
    if (!isEditingRef.current.fontSize)    setFontSizeInputVal(String(canvasFontSize));
  }, [canvasFontSize]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isEditingRef.current.lineHeight)  setLineHeightVal(String(+canvasLineHeight.toFixed(2)));
  }, [canvasLineHeight]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isEditingRef.current.charSpacing) setCharSpacingVal(String(canvasCharSpacing));
  }, [canvasCharSpacing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) return null;

  const fc = canvasRef.current?.getCanvas();
  if (!fc) return null;

  // isText was already computed before hooks (as a canvas dep); reuse it here
  // with the narrowed type so TypeScript is satisfied after the null guard.
  const isText = selected instanceof fabric.IText || selected instanceof fabric.Textbox;
  const isRect = selected.type === "rect";
  const isImage = selected.type === "image";
  const textObj = selected as fabric.IText;
  const rectObj = selected as fabric.Rect;

  // Central update helper.
  // Calls initDimensions() for text objects so coordinates are correct before
  // the object:modified event fires. Does NOT call constrainSelectedToSafeArea
  // (which uses fitText=true and would override manual font-size changes);
  // position clamping is already handled by the object:modified → clampToMargin
  // listener registered inside FabricCanvas.
  const applyProps = (props: Record<string, unknown>) => {
    selected.set(props);
    if (selected instanceof fabric.IText) {
      (selected as any).initDimensions?.();
    }
    selected.setCoords();
    fc.fire("object:modified", { target: selected });
    fc.renderAll();
    onRefresh();
  };

  // Apply a font size clamped to [6, 200] with mode-aware container reflow so
  // text is never clipped after a manual font-size increase.
  const applyFontSize = (size: number) => {
    const clamped = Math.min(200, Math.max(6, Math.round(size) || 6));
    setIsEditingFontSize(false);
    setFontSizeInputVal(String(clamped));

    if (!isText) {
      applyProps({ fontSize: clamped });
      return;
    }

    // Apply the new font size first, then reflow based on the current text mode
    // so the container expands / wraps correctly instead of clipping the text.
    textObj.set({ fontSize: clamped, scaleX: 1, scaleY: 1 });
    const anyText = textObj as any;
    const textMode: string = String(anyText.__textMode ?? "none");

    if (textObj instanceof fabric.Textbox) {
      const boxW = Math.max(40, Number(anyText.__boxWidth) || Number(textObj.width) || 80);

      if (textMode === "auto") {
        // Auto Size: container width must grow so the larger font fits on one
        // line without clipping.
        //
        // Measurement strategy:
        //  1. Ensure enableNoWrap is active so initDimensions never word-wraps.
        //  2. Temporarily set a very wide container so Fabric has no width
        //     constraint while computing __charBounds (measurement pass).
        //  3. Read calcTextWidth() — with no wrapping this equals the full
        //     single-line text width at the new font size.
        //  4. Set obj.width = measured width.
        //  5. Call initDimensions() again (layout pass) to finalise the object
        //     at the correct new width — without this the bounding box and
        //     canvas rendering stay stale.
        enableNoWrap(textObj);                              // idempotent
        textObj.set({ splitByGrapheme: false, width: 9999 }); // measurement pass
        (textObj as any).initDimensions?.();
        const measured = (textObj as any).calcTextWidth?.() as number | undefined;
        const textW = Math.max(40, Number(measured) || Number(textObj.width) || 40);
        textObj.set({ width: textW });                      // layout pass
        (textObj as any).initDimensions?.();
        anyText.__boxWidth = textW;
        // Preserve user-set height if taller than single-line content.
        const contentH = Math.max(20, Number(textObj.height) || 20);
        const userH    = Math.max(0, Number(anyText.__boxHeight) || 0);
        if (userH > contentH) textObj.set({ height: userH });
        anyText.__boxHeight = Math.max(contentH, userH) || contentH;
      } else if (textMode === "auto_wrap") {
        // Auto+Wrap: reflow at fixed width; height grows to fit extra lines.
        applyAutoWrap(textObj, boxW);
        const contentH = Math.max(20, Number(textObj.height) || 20);
        const userH    = Math.max(0, Number(anyText.__boxHeight) || 0);
        const finalH   = Math.max(contentH, userH);
        textObj.set({ height: finalH });
        anyText.__boxHeight = finalH;
      } else {
        // "wrap" / "none" / default: fixed width, word-boundary reflow.
        // initDimensions grows height to accommodate more wrapped lines.
        textObj.set({ width: boxW, splitByGrapheme: false });
        (textObj as any).initDimensions?.();
        const contentH = Math.max(20, Number(textObj.height) || 20);
        const userH    = Math.max(0, Number(anyText.__boxHeight) || 0);
        const finalH   = Math.max(contentH, userH);
        textObj.set({ height: finalH });
        anyText.__boxHeight = finalH;
      }
    } else {
      // IText (auto-size single line): initDimensions expands width naturally.
      (textObj as any).initDimensions?.();
    }

    textObj.setCoords();
    fc.fire("object:modified", { target: textObj });
    fc.renderAll();
    onRefresh();
  };

  const applyText = (nextText: string) => {
    textObj.set({ text: nextText });
    (textObj as any).initDimensions?.();
    textObj.setCoords();
    fc.fire("object:modified", { target: textObj });
    fc.renderAll();
    onRefresh();
  };

  /**
   * Apply or toggle a text case transform on the selected text object.
   *
   * Behaviour:
   *  - First call: saves the original text as __originalText, then transforms.
   *  - Clicking the same button again: restores __originalText and clears the
   *    stored transform (toggle-off).
   *  - Switching between transforms (e.g. UPPER → Capitalize): always
   *    transforms __originalText so the result is always correct.
   *  - Works for both static text AND dynamic placeholders like {{full_name}}.
   */
  const applyTextTransform = (type: "uppercase" | "lowercase" | "capitalize") => {
    const currentTransform = (textObj as any).__textTransform as string | undefined;
    const isToggleOff = currentTransform === type;

    if (isToggleOff) {
      // Restore the original text and clear transform metadata.
      const original = (textObj as any).__originalText as string | undefined;
      const restored = original ?? textObj.text ?? "";
      textObj.set({ text: restored } as any);
      (textObj as any).__textTransform = "none";
      delete (textObj as any).__originalText;
    } else {
      // Preserve original text before the very first transform on this object.
      if (!(textObj as any).__originalText) {
        (textObj as any).__originalText = textObj.text ?? "";
      }
      // Always transform from the original so switching cases gives correct result.
      const base: string = (textObj as any).__originalText;
      const transformed = applyTextTransformValue(base, type);
      textObj.set({ text: transformed } as any);
      (textObj as any).__textTransform = type;
    }

    // ── Re-fit text inside its bounding box ────────────────────────────
    // After any case change the string length changes (uppercase is wider).
    // We re-run the same fitting logic that Fabric uses during interactive
    // resize so the text never overflows its container regardless of mode.
    const anyText = textObj as any;
    const textMode: string = String(anyText.__textMode ?? "none");

    if (textObj instanceof fabric.Textbox) {
      const boxW = Math.max(40, Number(anyText.__boxWidth) || Number(textObj.width) || 80);

      if (textMode === "auto") {
        // Auto Size: container adapts to text at the current font. Font is fixed.
        // Use the same measurement-pass approach as applyFontSize so the box
        // auto-expands correctly after a case change (UPPER is wider than lower).
        enableNoWrap(textObj);
        textObj.set({ splitByGrapheme: false, width: 9999, scaleX: 1 }); // measurement pass
        (textObj as any).initDimensions?.();
        const measured = (textObj as any).calcTextWidth?.() as number | undefined;
        const textW = Math.max(40, Number(measured) || Number(textObj.width) || 40);
        textObj.set({ width: textW });
        anyText.__boxWidth = textW;
        (textObj as any).initDimensions?.();                              // layout pass
        const contentH = Math.max(20, Number(textObj.height) || 20);
        const userH = Math.max(0, Number(anyText.__boxHeight) || 0);
        if (userH > contentH) textObj.set({ height: userH });
      } else if (textMode === "auto_wrap") {
        // Auto+Wrap: reflow at fixed width, height grows to fit all lines.
        applyAutoWrap(textObj, boxW);
        const contentH = Math.max(20, Number(textObj.height) || 20);
        const userH = Math.max(0, Number(anyText.__boxHeight) || 0);
        const finalH = userH > 0 ? Math.max(contentH, userH) : contentH;
        textObj.set({ height: finalH });
        anyText.__boxHeight = finalH;
      } else {
        // "wrap" / "none" / default: fixed width + word-boundary wrap.
        // initDimensions reflowes at the current width; height grows for long text.
        textObj.set({ width: boxW, splitByGrapheme: false, scaleX: 1 });
        (textObj as any).initDimensions?.();
        const contentH = Math.max(20, Number(textObj.height) || 20);
        const userH = Math.max(0, Number(anyText.__boxHeight) || 0);
        const finalH = Math.max(contentH, userH);
        textObj.set({ height: finalH });
        anyText.__boxHeight = finalH;
      }
    } else {
      // IText (Auto Size, single line): just reflow dimensions.
      (textObj as any).initDimensions?.();
    }

    textObj.setCoords();
    fc.fire("object:modified", { target: textObj });
    fc.renderAll();
    onRefresh();
  };

  const fontSize = isText ? (textObj.fontSize ?? 16) : 0;
  const fontFamily = isText ? (textObj.fontFamily ?? "Inter") : "Inter";
  const fillColor = (selected.fill as string) ?? "#000000";
  // While user is actively editing the input show their local text; otherwise
  // reflect the live canvas value so external changes (undo, auto-fit) are visible.
  const fontSizeDisplay = isEditingFontSize ? fontSizeInputVal : String(fontSize);

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
                onClick={() => applyFontSize(fontSize - 1)}
              >
                <Minus className="h-3 w-3" />
              </Button>
            </Tip>

            <Input
              type="number"
              min={6}
              max={200}
              value={fontSizeDisplay}
              onFocus={() => {
                // Seed with the live canvas value so blur-without-typing does
                // not accidentally commit a stale number.
                setFontSizeInputVal(String(fontSize));
                setIsEditingFontSize(true);
              }}
              onChange={(e) => {
                setIsEditingFontSize(true);
                setFontSizeInputVal(e.target.value);
              }}
              onBlur={() => {
                const parsed = parseInt(fontSizeInputVal, 10);
                applyFontSize(isNaN(parsed) ? fontSize : parsed);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const parsed = parseInt(fontSizeInputVal, 10);
                  applyFontSize(isNaN(parsed) ? fontSize : parsed);
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  setIsEditingFontSize(false);
                  setFontSizeInputVal(String(fontSize));
                }
              }}
              className="h-7 w-14 shrink-0 px-1 text-center text-xs"
            />

            <Tip label="Increase font size">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyFontSize(fontSize + 1)}
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
                  value={isEditingLineHeight ? lineHeightVal : String(+canvasLineHeight.toFixed(2))}
                  onFocus={() => {
                    setLineHeightVal(String(+canvasLineHeight.toFixed(2)));
                    setIsEditingLineHeight(true);
                  }}
                  onChange={(e) => {
                    setIsEditingLineHeight(true);
                    setLineHeightVal(e.target.value);
                  }}
                  onBlur={() => {
                    const parsed = parseFloat(lineHeightVal);
                    const clamped = Math.min(5, Math.max(0.5, isNaN(parsed) ? 1.16 : parsed));
                    setIsEditingLineHeight(false);
                    setLineHeightVal(String(+clamped.toFixed(2)));
                    applyProps({ lineHeight: clamped });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const parsed = parseFloat(lineHeightVal);
                      const clamped = Math.min(5, Math.max(0.5, isNaN(parsed) ? 1.16 : parsed));
                      setIsEditingLineHeight(false);
                      setLineHeightVal(String(+clamped.toFixed(2)));
                      applyProps({ lineHeight: clamped });
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      setIsEditingLineHeight(false);
                      setLineHeightVal(String(+canvasLineHeight.toFixed(2)));
                    }
                  }}
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
                  value={isEditingCharSpacing ? charSpacingVal : String(canvasCharSpacing)}
                  onFocus={() => {
                    setCharSpacingVal(String(canvasCharSpacing));
                    setIsEditingCharSpacing(true);
                  }}
                  onChange={(e) => {
                    setIsEditingCharSpacing(true);
                    setCharSpacingVal(e.target.value);
                  }}
                  onBlur={() => {
                    const parsed = parseInt(charSpacingVal, 10);
                    const clamped = Math.min(2000, Math.max(-500, isNaN(parsed) ? 0 : parsed));
                    setIsEditingCharSpacing(false);
                    setCharSpacingVal(String(clamped));
                    applyProps({ charSpacing: clamped });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const parsed = parseInt(charSpacingVal, 10);
                      const clamped = Math.min(2000, Math.max(-500, isNaN(parsed) ? 0 : parsed));
                      setIsEditingCharSpacing(false);
                      setCharSpacingVal(String(clamped));
                      applyProps({ charSpacing: clamped });
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      setIsEditingCharSpacing(false);
                      setCharSpacingVal(String(canvasCharSpacing));
                    }
                  }}
                  className="h-7 w-16 shrink-0 px-1 text-center text-xs"
                />
              </div>
            </Tip>

            <VSep />

            <Tip label="UPPERCASE">
              <Button
                variant={(textObj as any).__textTransform === "uppercase" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyTextTransform("uppercase")}
              >
                <CaseUpper className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <Tip label="lowercase">
              <Button
                variant={(textObj as any).__textTransform === "lowercase" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyTextTransform("lowercase")}
              >
                <CaseLower className="h-3.5 w-3.5" />
              </Button>
            </Tip>

            <Tip label="Capitalize">
              <Button
                variant={(textObj as any).__textTransform === "capitalize" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => applyTextTransform("capitalize")}
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
