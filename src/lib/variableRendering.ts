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

const DEFAULT_MIN_FONT = 8;

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

export async function renderTemplateWithData(
  canvas: fabric.Canvas,
  template: Record<string, any> | null,
  data: VariableRenderInput
): Promise<string> {
  if (!canvas) return "";

  const safeData = normalizeRenderData(data);
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
  return canvas.toDataURL({ format: "png", quality: 1 });
}
