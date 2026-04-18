import * as fabric from "fabric";
import QRCode from "qrcode";

export type VariableMap = Record<string, unknown>;

export interface VariableRenderInput {
  companyVariables?: VariableMap;
  userVariables?: VariableMap;
  fallbackImageUrl?: string;
  textPlaceholder?: string;
  emptyAsBlank?: boolean;
}

export interface MaskBorderOptions {
  cornerRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  showBorder?: boolean;
}

// Minimum font size for Auto Size mode.  Set low (1 px) so the binary search
// can always find a font size where text fits on one line within the container.
const DEFAULT_MIN_FONT = 1;

// ── Shared offscreen canvas for fast font measurement (no DOM reflow) ─────────
let _measureCanvas: HTMLCanvasElement | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  return _measureCanvas.getContext("2d");
}

/**
 * Patch a Fabric Textbox so its text NEVER word-wraps (one visual line per
 * logical line, regardless of container width — CSS `white-space: nowrap`).
 *
 * We override `_splitTextIntoLines` at the INSTANCE level.  This is the very
 * top of Fabric's wrap chain:
 *   initDimensions → _splitText → _splitTextIntoLines → _wrapText → _wrapLine
 * By replacing it we bypass _wrapText / _wrapLine / wordSplit / dynamicMinWidth
 * entirely and mirror the non-wrapping `fabric.Text._splitTextIntoLines` logic.
 *
 * Fabric also calls `this._splitTextIntoLines(value)` directly during live
 * typing (before the `text:changed` event) to diff grapheme arrays.  Since we
 * patch the INSTANCE property (found before the prototype), both call-sites use
 * our version.
 *
 * Safe to call multiple times — idempotent.
 */
export function enableNoWrap(tb: fabric.Textbox): void {
  if ((tb as any).__noWrapPatched) return;
  (tb as any).__noWrapPatched = true;

  // Mirrors fabric/src/shapes/Text/Text.ts _splitTextIntoLines exactly.
  // Returns one grapheme-array per \n-separated logical line (no word-split).
  (tb as any)._splitTextIntoLines = function(this: fabric.Textbox, text: string) {
    const lines: string[] = text.split((this as any)._reNewline);
    const newLines: string[][] = lines.map((line) => this.graphemeSplit(line));
    const newLine = ["\n"];
    let graphemeText: string[] = [];
    for (let i = 0; i < newLines.length; i++) {
      graphemeText = graphemeText.concat(newLines[i], newLine);
    }
    graphemeText.pop();
    return {
      _unwrappedLines: newLines,
      lines,
      graphemeText,
      graphemeLines: newLines, // one visual line per logical line — no wrapping
    };
  };
}

/**
 * Remove the no-wrap patch. Call when switching away from Auto Size mode.
 */
export function disableNoWrap(tb: fabric.Textbox): void {
  if (!(tb as any).__noWrapPatched) return;
  delete (tb as any)._splitTextIntoLines;
  delete (tb as any).__noWrapPatched;
}

/**
 * Patch a Fabric Textbox so that:
 *   1. Text wraps at word boundaries (spaces) — `splitByGrapheme: false`.
 *   2. If a single word is wider than the container, it is sub-split at the
 *      character level so it never overflows.
 *
 * This is exactly CSS `overflow-wrap: break-word` / `word-wrap: break-word`:
 * try spaces first, fall back to character break only when a word won't fit.
 *
 * We override `wordSplit` at the INSTANCE level.  Fabric calls this inside
 * `getGraphemeDataForRender` → `_wrapText` → `_wrapLine` to split a logical
 * line into "words".  By returning pre-split sub-chunks for oversized words we
 * teach Fabric's existing layout engine to break them without touching the
 * normal word-wrap path.
 *
 * Safe to call multiple times — idempotent.
 */
export function patchWordBoundaryWrap(tb: fabric.Textbox): void {
  if ((tb as any).__wordBoundaryPatched) return;
  (tb as any).__wordBoundaryPatched = true;

  (tb as any).wordSplit = function(this: fabric.Textbox, value: string): string[] {
    // Split at Fabric's standard word-joiner characters (space, tab, CR).
    const joiner: RegExp = (this as any)._wordJoiners ?? /[ \t\r]/;
    const words: string[] = value.split(joiner);
    const containerWidth = Math.max(1, Number(this.width) || 200);

    const ctx = getMeasureCtx();
    if (!ctx) return words;

    const fontSize   = Number(this.fontSize)   || 16;
    const fontFamily = (this.fontFamily as string) || "Inter";
    const fontWeight = (this.fontWeight as string) || "normal";
    const fontStyle  = (this.fontStyle  as string) || "normal";
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

    const result: string[] = [];
    for (const word of words) {
      if (ctx.measureText(word).width <= containerWidth) {
        // Word fits — keep it whole so it wraps at the space boundary.
        result.push(word);
      } else {
        // Word is wider than the container — sub-split character by character
        // so Fabric's _wrapLine can break it without overflow.
        const graphemes: string[] = this.graphemeSplit(word);
        let chunk = "";
        for (const g of graphemes) {
          const test = chunk + g;
          if (ctx.measureText(test).width > containerWidth && chunk !== "") {
            result.push(chunk);
            chunk = g;
          } else {
            chunk = test;
          }
        }
        if (chunk) result.push(chunk);
      }
    }
    return result;
  };
}

/**
 * Remove the word-boundary-wrap override. Call when switching to Auto Size
 * or Auto+Wrap mode (those modes manage wrapping differently).
 */
export function unpatchWordBoundaryWrap(tb: fabric.Textbox): void {
  if (!(tb as any).__wordBoundaryPatched) return;
  delete (tb as any).wordSplit;
  delete (tb as any).__wordBoundaryPatched;
}

/**
 * Auto-fit font size: shrink (or grow) the font so the text occupies exactly
 * one line within `boxWidth`.
 *
 * Algorithm:
 *  1. Apply no-wrap patch so Fabric NEVER word-wraps during any layout pass.
 *  2. Binary search via `canvas.measureText` for a fast font-size estimate.
 *  3. Set that size, call `initDimensions()`, then step down 1 px at a time
 *     while Fabric's own `calcTextWidth()` reports the text is wider than the
 *     box (corrects kerning / ligature differences from canvas.measureText).
 *
 * Container width is NEVER changed.
 */
export function applyAutoFitFont(
  textObject: fabric.IText | fabric.Textbox,
  boxWidth: number,
  minFontSize = DEFAULT_MIN_FONT,
  maxFontSize = 100,
  /**
   * When true: ONLY shrink — never grow the font above its current size.
   * Use this during live typing so deleting a character doesn't cause the
   * font to jump back up and fill the container.
   * When false (default): full binary search can both shrink and grow.
   */
  shrinkOnly = false,
): void {
  const width = Math.max(1, boxWidth);
  const text = textObject.text ?? "";
  if (!text.trim()) return;

  // ── 1. Apply no-wrap patch and lock width BEFORE any layout pass ─────────
  if (textObject instanceof fabric.Textbox) {
    textObject.set({ width, splitByGrapheme: false });
    enableNoWrap(textObject);
  }

  // ── Shrink-only path ──────────────────────────────────────────────────────
  // Used during live typing: keep the current font size unless the text
  // overflows the container, then step down 1 px at a time until it fits.
  // This prevents the font from growing back when characters are deleted.
  if (shrinkOnly) {
    let size = Math.max(minFontSize, Math.floor(Number(textObject.fontSize) || maxFontSize));
    textObject.set({ fontSize: size });
    (textObject as any).initDimensions?.();
    if (textObject instanceof fabric.Textbox) {
      while (
        size > minFontSize &&
        ((textObject as any).calcTextWidth?.() ?? 0) > width
      ) {
        size -= 1;
        textObject.set({ fontSize: size });
        (textObject as any).initDimensions?.();
      }
    }
    textObject.setCoords();
    return;
  }

  const ctx = getMeasureCtx();
  if (!ctx) return;

  const fontFamily = (textObject.fontFamily as string) ?? "Inter";
  const fontWeight = (textObject.fontWeight as string) ?? "normal";
  const fontStyle  = (textObject.fontStyle  as string) ?? "normal";

  // ── 2. Binary search (fast estimate via canvas.measureText) ──────────────
  let lo = minFontSize;
  let hi = maxFontSize;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = `${fontStyle} ${fontWeight} ${mid}px ${fontFamily}`;
    if (ctx.measureText(text).width <= width) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  let size = Math.max(minFontSize, Math.min(maxFontSize, Math.floor(lo)));
  textObject.set({ fontSize: size });
  (textObject as any).initDimensions?.();

  // ── 3. Step-down correction using Fabric's exact glyph measurement ────────
  // canvas.measureText may slightly differ from Fabric's kerned advance-widths.
  // Decrement 1 px at a time until Fabric itself reports the line fits.
  if (textObject instanceof fabric.Textbox) {
    while (
      size > minFontSize &&
      ((textObject as any).calcTextWidth?.() ?? 0) > width
    ) {
      size -= 1;
      textObject.set({ fontSize: size });
      (textObject as any).initDimensions?.();
    }
  }

  textObject.setCoords();
}

/**
 * Auto+Wrap behavior:
 * 1. Try single-line auto-fit (shrink font so text fits on one line).
 * 2. If the fitted font falls below `minSingleLine` (default 12 px) the text
 *    is too long to keep on one line at a legible size → enable word-wrap and
 * Auto+Wrap behavior:
 * Enables word-boundary wrapping and finds the LARGEST font size where all
 * wrapped lines fit within both the box width and the stored __boxHeight.
 *
 * Algorithm:
 *   1. Enable word-boundary wrap (splitByGrapheme:false, remove no-wrap patch).
 *   2. Binary search between minFontSize and maxFontSize:
 *        set fontSize = mid → initDimensions() → compare obj.height vs boxHeight
 *   3. Apply the winning font size and call initDimensions() one final time.
 *
 * The caller must set `(textObject as any).__boxHeight` to the desired
 * container height before calling this function.
 * If __boxHeight is absent the search is unconstrained (uses a very large cap)
 * which makes Auto Wrap behave like "fit to width, wrap if needed".
 */
export function applyAutoWrap(
  textObject: fabric.IText | fabric.Textbox,
  boxWidth: number,
  maxFontSize = 200,
  minFontSize = DEFAULT_MIN_FONT,
): void {
  const width = Math.max(1, boxWidth);
  const text = textObject.text ?? "";
  if (!text.trim()) return;

  // Container height constraint — must be set by caller before this call.
  // Falls back to a very large cap so text wraps but is not height-constrained.
  const boxHeight = Math.max(20, (textObject as any).__boxHeight ?? 9999);

  if (textObject instanceof fabric.Textbox) {
    // 1a. Remove single-line (no-wrap) patch — we want wrapping now.
    disableNoWrap(textObject);
    // 1b. Activate word-boundary-wrap + long-word-break patch.
    //     This is the CSS `word-wrap: break-word` / `overflow-wrap: anywhere`
    //     equivalent for Fabric: words wrap at spaces first; if a single word
    //     is still wider than the container it is sub-split at character level.
    patchWordBoundaryWrap(textObject);
    // 1c. Lock width to container width; disable character-level split (we
    //     use our own patch above for that, which gives better results).
    textObject.set({ width, splitByGrapheme: false });
  }

  // 2. Binary search: find the LARGEST font size where the wrapped text height
  //    is ≤ boxHeight.  After every fontSize change we call initDimensions()
  //    so Fabric re-runs its full word-wrap layout and updates `obj.height`.
  let lo = minFontSize;
  let hi = maxFontSize;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    textObject.set({ fontSize: mid });
    (textObject as any).initDimensions?.();
    const wrappedH = (textObject as any).height ?? 0;
    if (wrappedH <= boxHeight) {
      lo = mid; // fits vertically — try larger
    } else {
      hi = mid; // overflows vertically — try smaller
    }
  }

  // 3. Apply the winning size.
  textObject.set({ fontSize: lo });
  (textObject as any).initDimensions?.();

  // 4. Safety step-down: decrement 1 px at a time while ANY of these are true:
  //    • wrapped height still exceeds boxHeight  (rounding edge cases)
  //    • any line still wider than boxWidth      (oversized single chars)
  //    This mirrors the step-down correction used in applyAutoFitFont.
  let size = lo;
  while (size > minFontSize) {
    const h = (textObject as any).height ?? 0;
    const w = (textObject instanceof fabric.Textbox)
      ? ((textObject as any).calcTextWidth?.() ?? 0)
      : 0;
    if (h <= boxHeight && w <= width) break;
    size -= 1;
    textObject.set({ fontSize: size });
    (textObject as any).initDimensions?.();
  }

  textObject.setCoords();
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function flattenVariableMap(input: VariableRenderInput): Record<string, string> {
  const merged: Record<string, string> = {};

  const sources: VariableMap[] = [
    input.companyVariables ?? {},
    input.userVariables ?? {},
  ];

  sources.forEach((source) => {
    Object.entries(source).forEach(([rawKey, rawValue]) => {
      const key = rawKey.trim().toLowerCase();
      if (!key) return;
      merged[key] = asString(rawValue);
    });
  });

  return merged;
}

function resolveVariableValue(key: string, values: Record<string, string>): string {
  if (!key) return "";
  return values[key.trim().toLowerCase()] ?? "";
}

function resolveObjectBox(obj: fabric.FabricObject, fallbackH = 28): { width: number; height: number } {
  const anyObj = obj as any;
  const width = Math.max(
    1,
    Number(anyObj.boxWidth)
    || Number(anyObj.__boxWidth)
    || Number(anyObj.width)
    || obj.getScaledWidth()
    || 1
  );
  const height = Math.max(
    1,
    Number(anyObj.boxHeight)
    || Number(anyObj.__boxHeight)
    || Number(anyObj.height)
    || obj.getScaledHeight()
    || fallbackH
  );
  return { width, height };
}

export function applyTextFit(
  textObject: fabric.IText | fabric.Textbox,
  boxWidth: number,
  boxHeight: number,
  minFontSize = DEFAULT_MIN_FONT
): void {
  const width = Math.max(1, boxWidth);
  const height = Math.max(1, boxHeight);

  const content = asString(textObject.text ?? "");
  const hasHardBreaks = content.includes("\n");
  const shouldWrap = hasHardBreaks || content.length > 30 || content.split(" ").length > 3;

  if (textObject instanceof fabric.Textbox || shouldWrap) {
    if (textObject instanceof fabric.Textbox) {
      textObject.set({ width, scaleX: 1, scaleY: 1 });
    } else {
      // For iText we keep the visual width bounded and rely on auto-size.
      textObject.set({ scaleX: 1, scaleY: 1 });
    }

    let lo = minFontSize;
    let hi = Math.max(minFontSize + 1, Number(textObject.fontSize || 24));
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      textObject.set({ fontSize: mid });
      if (textObject instanceof fabric.Textbox) {
        textObject.set({ width });
      }
      (textObject as any).initDimensions?.();
      textObject.setCoords();

      const measuredW = textObject instanceof fabric.Textbox ? (textObject.width || width) : textObject.getScaledWidth();
      const measuredH = textObject.getScaledHeight();
      if (measuredW <= width && measuredH <= height) lo = mid;
      else hi = mid;
    }

    textObject.set({ fontSize: lo });
    if (textObject instanceof fabric.Textbox) {
      textObject.set({ width });
    }
    (textObject as any).initDimensions?.();
    textObject.setCoords();
    return;
  }

  // Single-line fallback: reduce font size until width and height fit.
  let fontSize = Math.max(minFontSize, Number(textObject.fontSize || 24));
  textObject.set({ scaleX: 1, scaleY: 1 });
  (textObject as any).initDimensions?.();
  textObject.setCoords();

  while (
    fontSize > minFontSize
    && (textObject.getScaledWidth() > width || textObject.getScaledHeight() > height)
  ) {
    fontSize -= 1;
    textObject.set({ fontSize });
    (textObject as any).initDimensions?.();
    textObject.setCoords();
  }
}

export function applyImageFit(
  imageObject: fabric.FabricImage,
  boxWidth: number,
  boxHeight: number
): void {
  const width = Math.max(1, boxWidth);
  const height = Math.max(1, boxHeight);
  const srcW = Math.max(1, Number(imageObject.width || 1));
  const srcH = Math.max(1, Number(imageObject.height || 1));

  const ratio = Math.min(width / srcW, height / srcH);
  imageObject.set({
    scaleX: ratio,
    scaleY: ratio,
    originX: "left",
    originY: "top",
  });

  const fittedW = srcW * ratio;
  const fittedH = srcH * ratio;
  const left = Number(imageObject.left || 0) + (width - fittedW) / 2;
  const top = Number(imageObject.top || 0) + (height - fittedH) / 2;
  imageObject.set({ left, top });
  imageObject.setCoords();
}

export function applyMaskAndBorder(
  object: fabric.FabricObject,
  options: MaskBorderOptions = {}
): void {
  const anyObj = object as any;
  const radius = Math.max(0, Number(options.cornerRadius || 0));
  const borderWidth = Math.max(0, Number(options.borderWidth || 0));
  const borderColor = options.borderColor || "#2563eb";
  const showBorder = Boolean(options.showBorder);

  const box = resolveObjectBox(object);
  object.set({
    clipPath: new fabric.Rect({
      width: box.width,
      height: box.height,
      rx: radius,
      ry: radius,
      originX: "left",
      originY: "top",
      left: 0,
      top: 0,
      absolutePositioned: false,
    }),
  } as any);

  anyObj.__maskOptions = {
    cornerRadius: radius,
    borderWidth,
    borderColor,
    showBorder,
  };

  if (showBorder) {
    const strokeObject = object as any;
    if (strokeObject.set) {
      strokeObject.set({
        stroke: borderColor,
        strokeWidth: borderWidth,
      });
    }
  }
  object.setCoords();
}

function replaceTemplatePlaceholders(text: string, values: Record<string, string>, fallback: string): string {
  return text.replace(/\{([^}]+)\}/g, (_full, rawKey: string) => {
    const v = resolveVariableValue(rawKey, values);
    return v || fallback;
  });
}

function resolveObjectVariableKey(obj: fabric.FabricObject): string {
  const anyObj = obj as any;
  return String(anyObj.variableKey || anyObj.__fieldKey || "").trim();
}

async function loadFabricImage(url: string): Promise<fabric.FabricImage> {
  return new Promise((resolve, reject) => {
    fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" })
      .then((img) => resolve(img))
      .catch(reject);
  });
}

async function toBarcodeDataUrl(value: string): Promise<string> {
  const c = document.createElement("canvas");
  c.width = 300;
  c.height = 96;
  const ctx = c.getContext("2d");
  if (!ctx) return "";

  const val = value || "N/A";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#111111";

  let x = 8;
  val.split("").forEach((ch, idx) => {
    const code = ch.charCodeAt(0) + idx;
    const bars = [1, 0, 1, 1, 0, 1];
    bars.forEach((on, i) => {
      const width = on ? ((code + i) % 3) + 1 : 1;
      if (on) {
        ctx.fillRect(x, 8, width, 62);
      }
      x += width + 1;
    });
  });

  ctx.font = "11px monospace";
  ctx.fillText(val.slice(0, 38), 8, 86);
  return c.toDataURL("image/png");
}

function getImageCandidate(value: string, key: string, fallbackImageUrl: string): string {
  if (value.startsWith("data:image")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (key === "qr" || key === "qrcode") return value;
  if (key === "barcode") return value;
  return fallbackImageUrl;
}

function normalizeRenderData(input: VariableRenderInput): Required<VariableRenderInput> {
  return {
    companyVariables: input.companyVariables ?? {},
    userVariables: input.userVariables ?? {},
    fallbackImageUrl: input.fallbackImageUrl || "/placeholder.png",
    textPlaceholder: input.textPlaceholder || "",
    emptyAsBlank: input.emptyAsBlank ?? true,
  };
}

/**
 * Compute the current academic session year string.
 * - January–March  → "YYYY-1-YY"  (previous session still ongoing)
 * - April–December → "YYYY-YY+1"  (new session started)
 *
 * Example: April 2026 → "2026-27", February 2026 → "2025-26"
 */
export function computeSessionYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed; 0=Jan … 11=Dec
  if (month < 3) {
    // Jan / Feb / Mar — session started in the previous calendar year
    return `${year - 1}-${String(year).slice(-2)}`;
  }
  // Apr … Dec — session started this calendar year
  return `${year}-${String(year + 1).slice(-2)}`;
}

/**
 * Pre-process a VariableRenderInput before rendering:
 * 1. Auto-inject `session_year` if neither `session_year` nor `sessionYear`
 *    is present in the userVariables.
 * 2. Apply `admission_number` → `roll_number` fallback: if `admission_number`
 *    is absent or empty, copy the value of `roll_number` (or `roll_no`) into it.
 *
 * Safe to call multiple times — only fills gaps, never overwrites existing values.
 */
export function preprocessVariables(input: VariableRenderInput): VariableRenderInput {
  const userVars: Record<string, unknown> = { ...(input.userVariables ?? {}) };

  // 1. Auto session_year
  const hasSessionYear = Object.keys(userVars).some(
    (k) => k.toLowerCase() === "session_year" || k.toLowerCase() === "sessionyear"
  );
  if (!hasSessionYear) {
    userVars["session_year"] = computeSessionYear();
  }

  // 2. admission_number fallback
  const admKey = Object.keys(userVars).find((k) => k.toLowerCase() === "admission_number");
  const admVal = admKey ? String(userVars[admKey] ?? "").trim() : "";
  if (!admVal) {
    const rollKey = Object.keys(userVars).find(
      (k) => k.toLowerCase() === "roll_number" || k.toLowerCase() === "roll_no"
    );
    const rollVal = rollKey ? String(userVars[rollKey] ?? "").trim() : "";
    if (rollVal) {
      userVars["admission_number"] = rollVal;
    }
  }

  return { ...input, userVariables: userVars };
}

export async function renderTemplateWithData(
  canvas: fabric.Canvas,
  template: Record<string, any> | null,
  data: VariableRenderInput
): Promise<string> {
  if (!canvas) return "";

  const safeData = normalizeRenderData(preprocessVariables(data));
  const values = flattenVariableMap(safeData);

  if (template && Object.keys(template).length > 0) {
    await canvas.loadFromJSON(template as any);
  }

  const objects = [...canvas.getObjects()];

  for (const obj of objects) {
    const anyObj = obj as any;
    const variableKey = resolveObjectVariableKey(obj);
    const fieldKind = String(anyObj.__fieldKind || "").toLowerCase();
    const box = resolveObjectBox(obj);

    if (obj instanceof fabric.IText || obj instanceof fabric.Textbox) {
      const original = asString(obj.text || "");
      let nextText = original;

      if (variableKey) {
        nextText = resolveVariableValue(variableKey, values);
      } else if (/\{[^}]+\}/.test(original)) {
        nextText = replaceTemplatePlaceholders(original, values, safeData.textPlaceholder);
      }

      if (!nextText && !safeData.emptyAsBlank) {
        nextText = safeData.textPlaceholder;
      }

      obj.set({ text: nextText });
      applyTextFit(obj, box.width, box.height);
      if (anyObj.__maskOptions) {
        applyMaskAndBorder(obj, anyObj.__maskOptions as MaskBorderOptions);
      }
      continue;
    }

    const isImageTarget =
      obj instanceof fabric.FabricImage
      || fieldKind === "image"
      || fieldKind === "barcode"
      || fieldKind === "qr";

    if (!isImageTarget || !variableKey) {
      if (anyObj.__maskOptions) {
        applyMaskAndBorder(obj, anyObj.__maskOptions as MaskBorderOptions);
      }
      continue;
    }

    const raw = resolveVariableValue(variableKey, values);
    let imageSource = getImageCandidate(raw, variableKey, safeData.fallbackImageUrl);

    if ((variableKey === "qr" || variableKey === "qrcode") && raw) {
      imageSource = await QRCode.toDataURL(raw, { margin: 1, width: 256 });
    }
    if ((variableKey === "barcode" || fieldKind === "barcode") && raw) {
      imageSource = await toBarcodeDataUrl(raw);
    }

    let loaded: fabric.FabricImage | null = null;
    try {
      loaded = await loadFabricImage(imageSource || safeData.fallbackImageUrl);
    } catch {
      try {
        loaded = await loadFabricImage(safeData.fallbackImageUrl);
      } catch {
        loaded = null;
      }
    }
    if (!loaded) continue;

    loaded.set({
      left: Number(obj.left || 0),
      top: Number(obj.top || 0),
      angle: Number(obj.angle || 0),
      opacity: Number(obj.opacity || 1),
      originX: obj.originX,
      originY: obj.originY,
      selectable: obj.selectable,
      evented: obj.evented,
    } as any);

    (loaded as any).__uid = anyObj.__uid;
    (loaded as any).__layerName = anyObj.__layerName;
    (loaded as any).__fieldKey = anyObj.__fieldKey || variableKey;
    (loaded as any).__fieldKind = anyObj.__fieldKind || fieldKind || "image";
    (loaded as any).__isDynamicField = true;
    (loaded as any).variableKey = variableKey;
    (loaded as any).__boxWidth = box.width;
    (loaded as any).__boxHeight = box.height;
    (loaded as any).__maskOptions = anyObj.__maskOptions;

    applyImageFit(loaded, box.width, box.height);
    applyMaskAndBorder(loaded, anyObj.__maskOptions as MaskBorderOptions | undefined);

    canvas.remove(obj);
    canvas.add(loaded);
  }

  canvas.renderAll();
  return canvas.toDataURL({ multiplier: 1, format: "png", quality: 1 });
}
