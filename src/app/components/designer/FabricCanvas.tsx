import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import * as fabric from "fabric";
import QRCode from "qrcode";
import { mmToPx, type TemplateConfig } from "../../../lib/fabricUtils";
import {
  detectAlignment,
  detectEqualSpacing,
  rectFromFabricObject,
} from "../../../lib/alignmentUtils";
import { AlignmentGuideManager } from "./AlignmentGuides";
import {
  applyAutoFitFont,
  applyAutoWrap,
  disableNoWrap,
  enableNoWrap,
  patchWordBoundaryWrap,
  unpatchWordBoundaryWrap,
  applyImageFit,
  applyMaskAndBorder,
  applyTextFit,
  renderTemplateWithData as renderTemplateWithDataUtil,
  type MaskBorderOptions,
  type VariableRenderInput,
} from "../../../lib/variableRendering";

// ─── Public handle ────────────────────────────────────────────────────────────

export interface FabricCanvasHandle {
  addText: () => void;
  addRect: () => void;
  addCircle: () => void;
  addLine: () => void;
  addTriangle: () => void;
  addPolygon: (sides?: number) => void;
  addStar: (points?: number) => void;
  addHexagon: () => void;
  addRoundedRect: () => void;
  addShapeFromGallery: (shapeId: string) => void;
  addImage: (dataUrl: string) => void;
  addQRCode: (text: string) => void;
  addBarcode: (text: string) => void;
  addDynamicField: (fieldKey: string, fieldType?: string, placement?: { x: number; y: number }) => void;
  renderTemplateWithData: (template: Record<string, any> | null, data: VariableRenderInput) => Promise<string>;
  applyMaskAndBorderToSelected: (options?: MaskBorderOptions) => void;
  /** Add a scalable SVG from an SVG string. */
  addSVG: (svgString: string) => void;
  /** Apply a PNG image as a transparency mask onto the selected FabricImage. */
  applyPNGMask: (maskDataUrl: string) => void;
  /** Remove the PNG mask and restore the original image. */
  removePNGMask: () => void;
  /** Convert selected IText → Textbox (enables word-wrap). */
  enableWordWrap: (fixedWidth?: number) => void;
  /** Convert selected Textbox → IText (disables word-wrap). */
  disableWordWrap: () => void;
  /** Auto-shrink font size so text fits the Textbox height (word-wrap + auto-size). */
  autoFitTextToBox: () => void;
  /**
   * Add a new Textbox in Word Wrap mode at the safe-area origin.
   * Width is fixed, height grows with content, font size never auto-scales.
   */
  addWordWrapText: (text?: string, fixedWidth?: number) => void;
  /** Set text display mode: 'none'/'auto' (single-line auto-fit), 'wrap' (Textbox fixed-width), 'auto_wrap' (Textbox+autofit). */
  setTextMode: (mode: "none" | "auto" | "wrap" | "auto_wrap") => void;
  deleteSelected: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  getCanvas: () => fabric.Canvas | null;
  toJSON: () => object;
  loadFromJSON: (json: object) => void;
  toPNG: () => string;
  toJPG: () => string;
  setBackgroundColor: (colorOrGradient: string) => void;
  setBackgroundImage: (dataUrl: string, fitMode?: "cover" | "contain") => void;
  setBackgroundSVG: (svgString: string, fitMode?: "cover" | "contain") => void;
  setBackgroundFitMode: (fitMode: "cover" | "contain") => void;
  moveBackground: (offsetX: number, offsetY: number) => void;
  resetBackgroundPosition: () => void;
  clearBackground: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  alignToPage: (alignment: 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right') => void;
  getDisplayScale: () => number;
  applyImageMask: (shape: ImageMaskShape, radius?: number) => void;
  setImageBorderRadius: (radius: number) => void;
  autoFitText: () => void;
  // Layer management methods
  getLayers: () => Array<{ id: string; name: string; locked: boolean }>;
  setLayerLocked: (id: string, locked: boolean) => void;
  deleteLayer: (id: string) => void;
  // History state query & management
  canUndo: () => boolean;
  canRedo: () => boolean;
  resetHistory: () => void;
  constrainSelectedToSafeArea: () => void;
  getElementMetadata: () => Array<{
    id: string;
    type: string;
    fieldKey: string | null;
    fieldKind: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  }>;
  /**
   * Apply (or clear) a designer-time image for an image variable placeholder.
   * - imageDataUrl truthy → replaces the dashed placeholder Group with a live
   *   FabricImage so the canvas shows a real preview.  The original placeholder
   *   JSON is cached internally so it can be restored on clear.
   * - imageDataUrl null/empty → restores the original dashed placeholder Group.
   */
  applyVariableImage: (fieldKey: string, imageDataUrl: string | null) => Promise<void>;
}

export type ImageMaskShape =
  | "none"
  | "circle"
  | "square"
  | "rounded"
  | "rounded-rectangle"
  | "triangle"
  | "star"
  | "ticket"
  | "flower"
  | "diamond"
  | "hexagon"
  | "pentagon"
  | "cross"
  | "oval";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  config: TemplateConfig;
  showMargins: boolean;
  guideMode?: "outer" | "safe" | "both";
  onSelectionChange: (obj: fabric.FabricObject | null) => void;
  /** Scale factor to shrink the canvas to fit the viewport (0 < displayScale <= 1). Default: 1 */
  displayScale: number;
  /** Called after loadFromJSON so the parent can sync currentBg */
  onBgChange?: (bg: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FabricCanvas = forwardRef<FabricCanvasHandle, Props>(
  ({ config, showMargins, onSelectionChange, displayScale, onBgChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const marginGroupRef = useRef<fabric.FabricObject | null>(null);
    // Keep Fabric's internal coordinate system unscaled so zoom never mutates
    // object positions/sizes in model space.
    const displayScaleRef = useRef(1);
    displayScaleRef.current = 1;
    const configRef = useRef(config);
    configRef.current = config;
    const onSelectionChangeRef = useRef(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;
    const onBgChangeRef = useRef(onBgChange);
    onBgChangeRef.current = onBgChange;
    // Stores the raw CSS color/gradient string for serialisation
    const bgStringRef = useRef<string>("#ffffff");
    // Incremented each time setBackgroundColor is called; used to cancel stale async renders
    const bgTokenRef = useRef(0);
    // Track SVG background for zoom rescaling
    const bgSVGRef = useRef<fabric.Group | fabric.FabricObject | null>(null);
    // Track background fit mode: "cover" (fill canvas) or "contain" (fit with aspect ratio)
    const bgFitModeRef = useRef<"cover" | "contain">("contain");
    // Track background position offset for contain mode
    const bgOffsetRef = useRef({ x: 0, y: 0 });
    // Undo/redo history stacks (serialized JSON snapshots)
    const HISTORY_LIMIT = 30;
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    const ignoreSaveRef = useRef(false);
    const drawMarginsRef = useRef<() => void>(() => {});
    // Track layer lock states: Map of object id → locked boolean
    const layerLockedRef = useRef<Map<string, boolean>>(new Map());
    // Layer counter for generating unique IDs
    const layerCounterRef = useRef(0);
    // Last-used text style — captured on every object:modified for text objects.
    // Applied when a new text or variable field is added so users don't have to
    // re-style every element they create.
    const lastUsedTextStyleRef = useRef<{
      fontFamily?: string;
      fontSize?: number;
      fill?: string;
      fontWeight?: string;
      fontStyle?: string;
      stroke?: string;
      strokeWidth?: number;
      paintFirst?: string;
      shadow?: fabric.Shadow | null;
      textAlign?: string;
      underline?: boolean;
      _isSet?: boolean;
    }>({});
    // Cache original placeholder JSON for image-variable live preview so we can
    // restore the dashed placeholder when the user clears an uploaded image.
    const variableImageOriginalsRef = useRef<Map<string, object>>(new Map());

    const canvasPxW = Math.round(mmToPx(config.canvas.width));
    const canvasPxH = Math.round(mmToPx(config.canvas.height));
    const viewportCanvasPxW = Math.max(1, Math.round(canvasPxW * displayScale));
    const viewportCanvasPxH = Math.max(1, Math.round(canvasPxH * displayScale));

    const getSafeAreaRectPx = useCallback((cfg: TemplateConfig, scale: number) => {
      const canvasWidth = mmToPx(Math.max(0, Number(cfg.canvas.width) || 0));
      const canvasHeight = mmToPx(Math.max(0, Number(cfg.canvas.height) || 0));

      let leftMargin = mmToPx(Math.max(0, Number(cfg.margin.left) || 0));
      let rightMargin = mmToPx(Math.max(0, Number(cfg.margin.right) || 0));
      let topMargin = mmToPx(Math.max(0, Number(cfg.margin.top) || 0));
      let bottomMargin = mmToPx(Math.max(0, Number(cfg.margin.bottom) || 0));

      const horizontalMargins = leftMargin + rightMargin;
      if (horizontalMargins >= canvasWidth && horizontalMargins > 0) {
        const shrink = Math.max(0, (canvasWidth - 1) / horizontalMargins);
        leftMargin *= shrink;
        rightMargin *= shrink;
      }

      const verticalMargins = topMargin + bottomMargin;
      if (verticalMargins >= canvasHeight && verticalMargins > 0) {
        const shrink = Math.max(0, (canvasHeight - 1) / verticalMargins);
        topMargin *= shrink;
        bottomMargin *= shrink;
      }

      const innerX = leftMargin;
      const innerY = topMargin;
      const innerWidth = Math.max(1, canvasWidth - (leftMargin + rightMargin));
      const innerHeight = Math.max(1, canvasHeight - (topMargin + bottomMargin));

      return {
        x: innerX * scale,
        y: innerY * scale,
        width: innerWidth * scale,
        height: innerHeight * scale,
        right: (innerX + innerWidth) * scale,
        bottom: (innerY + innerHeight) * scale,
        debug: {
          canvasWidth,
          canvasHeight,
          leftMargin,
          rightMargin,
          topMargin,
          bottomMargin,
          innerX,
          innerY,
          innerWidth,
          innerHeight,
        },
      };
    }, []);

    const SERIALIZABLE_PROPS = [
      "excludeFromExport",
      "isBgImage",
      "maskShape",
      "maskRadius",
      "__uid",
      "__layerName",
      "__fieldKey",
      "__fieldKind",
      "__isDynamicField",
      "variableKey",
      "__boxWidth",
      "__boxHeight",
      "__maskOptions",
      "_originalSrc",
      "__textMode",
    ] as const;

    const createHistorySnapshot = useCallback((fc: fabric.Canvas): string => {
      const json = (fc as any).toJSON(["selectable", "evented"]) as Record<string, unknown>;
      const objects = Array.isArray(json.objects) ? json.objects : [];
      const liveObjects = fc.getObjects();
      json.objects = objects.filter((_, index) => !(liveObjects[index] as any)?.isGuide);

      const payload = {
        canvas: json,
        backgroundColor: fc.backgroundColor ?? null,
        bgString: bgStringRef.current,
      };

      return JSON.stringify(payload);
    }, []);

    const pushUndoSnapshot = useCallback((clearRedo = true) => {
      const fc = fabricRef.current;
      if (!fc || ignoreSaveRef.current) return;

      const snapshot = createHistorySnapshot(fc);
      const lastSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
      if (lastSnapshot === snapshot) return;

      undoStackRef.current.push(snapshot);
      if (undoStackRef.current.length > HISTORY_LIMIT) {
        undoStackRef.current.shift();
      }

      if (clearRedo) {
        redoStackRef.current = [];
      }
    }, [createHistorySnapshot]);

    const restoreHistorySnapshot = useCallback((snapshot: string) => {
      const fc = fabricRef.current;
      if (!fc) return;

      let parsed: any;
      try {
        parsed = JSON.parse(snapshot);
      } catch {
        return;
      }

      const stateCanvas = parsed?.canvas ?? parsed;
      const restoredBackgroundColor = parsed?.backgroundColor;
      const restoredBgString = parsed?.bgString;

      ignoreSaveRef.current = true;
      fc.loadFromJSON(stateCanvas).then(() => {
        // Remove guide artifacts that may exist in legacy snapshots.
        fc.getObjects()
          .filter((obj) => (obj as any).isGuide)
          .forEach((obj) => fc.remove(obj));

        if (restoredBackgroundColor !== undefined) {
          fc.backgroundColor = restoredBackgroundColor;
        }

        if (typeof restoredBgString === "string") {
          bgStringRef.current = restoredBgString;
          onBgChangeRef.current?.(restoredBgString);
        }

        fc.getObjects().forEach((obj) => {
          obj.set({ hasControls: false });
        });

        drawMarginsRef.current();
        fc.discardActiveObject();
        onSelectionChangeRef.current(null);
        fc.renderAll();
        ignoreSaveRef.current = false;
      });
    }, []);

    const performUndo = useCallback(() => {
      if (ignoreSaveRef.current) return;
      if (undoStackRef.current.length <= 1) return;

      const currentSnapshot = undoStackRef.current.pop();
      if (currentSnapshot) {
        redoStackRef.current.push(currentSnapshot);
        if (redoStackRef.current.length > HISTORY_LIMIT) {
          redoStackRef.current.shift();
        }
      }

      const previousSnapshot = undoStackRef.current[undoStackRef.current.length - 1];
      if (previousSnapshot) {
        restoreHistorySnapshot(previousSnapshot);
      }
    }, [restoreHistorySnapshot]);

    const performRedo = useCallback(() => {
      if (ignoreSaveRef.current) return;
      if (redoStackRef.current.length === 0) return;

      const nextSnapshot = redoStackRef.current.pop();
      if (!nextSnapshot) return;

      undoStackRef.current.push(nextSnapshot);
      if (undoStackRef.current.length > HISTORY_LIMIT) {
        undoStackRef.current.shift();
      }

      restoreHistorySnapshot(nextSnapshot);
    }, [restoreHistorySnapshot]);

    const normalizeFieldKey = (key: string): string => key.trim().replace(/[{}\s]+/g, "_").toLowerCase();
    // Mirror the IMAGE_KEY_PATTERNS from csvBinding.ts so any field inferred as
    // "image" there is also treated as an image placeholder here.
    const IMAGE_FIELD_PATTERNS = [
      /photo/i, /image/i, /img/i, /picture/i, /pic/i, /avatar/i, /logo/i,
      /signature/i, /seal/i,
    ];
    const isImageFieldKey = (key: string): boolean =>
      IMAGE_FIELD_PATTERNS.some((re) => re.test(key));
    const isBarcodeFieldKey = (key: string): boolean =>
      ["barcode", "bar_code", "qr", "qrcode", "qr_code"].includes(key);

    const extractElementMetadata = useCallback((fc: fabric.Canvas) => {
      const objects = fc.getObjects().filter((obj) => !(obj as any).excludeFromExport && !(obj as any).isBgImage);
      return objects.map((obj, index) => ({
        id: String((obj as any).__uid || `layer-${index + 1}`),
        type: String((obj as any).__fieldKind || obj.type || "object"),
        fieldKey: ((obj as any).__fieldKey as string | undefined) ?? null,
        fieldKind: ((obj as any).__fieldKind as string | undefined) ?? null,
        x: Math.round((obj.left ?? 0) * 100) / 100,
        y: Math.round((obj.top ?? 0) * 100) / 100,
        width: Math.round(obj.getScaledWidth() * 100) / 100,
        height: Math.round(obj.getScaledHeight() * 100) / 100,
        rotation: Math.round((obj.angle ?? 0) * 100) / 100,
      }));
    }, []);

    const placeBackgroundObject = useCallback((
      obj: fabric.FabricObject,
      canvasW: number,
      canvasH: number,
      mode: "cover" | "contain",
      offsetX = 0,
      offsetY = 0
    ) => {
      const srcW = obj.width ?? 1;
      const srcH = obj.height ?? 1;
      if (srcW <= 0 || srcH <= 0 || canvasW <= 0 || canvasH <= 0) return;

      const scale = mode === "cover"
        ? Math.max(canvasW / srcW, canvasH / srcH)
        : Math.min(canvasW / srcW, canvasH / srcH);

      obj.set({
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
        left: canvasW / 2 + offsetX,
        top: canvasH / 2 + offsetY,
      });
      obj.setCoords();
    }, []);

    const getCanvasBackgroundObject = useCallback((fc: fabric.Canvas): fabric.FabricObject | null => {
      const bg = (fc as any).backgroundImage as fabric.FabricObject | undefined;
      return bg ?? null;
    }, []);

    const setCanvasBackgroundObject = useCallback((fc: fabric.Canvas, obj: fabric.FabricObject | null) => {
      // Directly assign backgroundImage — avoids the deprecated setBackgroundImage(url, cb)
      // which can reset position/scale in Fabric v6.
      (fc as any).backgroundImage = obj ?? undefined;
      if (obj) {
        obj.set({ selectable: false, evented: false } as any);
      }
      fc.requestRenderAll();
    }, []);

    const removeLegacyBackgroundArtifacts = useCallback((fc: fabric.Canvas) => {
      const canvasW = Math.max(1, fc.getWidth());
      const canvasH = Math.max(1, fc.getHeight());

      const candidates = fc
        .getObjects()
        .filter((obj) => {
          const anyObj = obj as any;
          if (anyObj.isBgImage || anyObj.excludeFromExport) return false;
          if (anyObj.__uid || anyObj.__layerName || anyObj.__isDynamicField) return false;
          if (obj.selectable !== false || obj.evented !== false) return false;
          if (obj.type !== "image" && obj.type !== "group") return false;

          const areaRatio = (obj.getScaledWidth() * obj.getScaledHeight()) / (canvasW * canvasH);
          const nearTopLeft = (obj.left ?? 0) <= canvasW * 0.12 && (obj.top ?? 0) <= canvasH * 0.12;
          return areaRatio >= 0.08 || nearTopLeft;
        });

      candidates.forEach((obj) => fc.remove(obj));
    }, []);

    const addDynamicFieldObject = useCallback((
      fc: fabric.Canvas,
      rawFieldKey: string,
      placement?: { x: number; y: number },
      /** Explicit field type from drag-data; overrides key-pattern inference. */
      fieldTypeOverride?: string,
    ) => {
      const fieldKey = normalizeFieldKey(rawFieldKey || "field");
      if (!fieldKey) return;
      const uid = `layer-${++layerCounterRef.current}`;
      const { margin } = configRef.current;
      const ds = displayScaleRef.current;
      const left = placement?.x ?? mmToPx(margin.left) * ds;
      const top = placement?.y ?? mmToPx(margin.top) * ds;
      const isImageField = fieldTypeOverride === "image" || (!fieldTypeOverride && isImageFieldKey(fieldKey));
      const isBarcodeField = fieldTypeOverride === "barcode" || (!fieldTypeOverride && isBarcodeFieldKey(fieldKey));
      const label = `{{${fieldKey}}}`;

      if (isImageField || isBarcodeField) {
        const width = isBarcodeField ? 160 : 110;
        const height = isBarcodeField ? 56 : 120;
        const frame = new fabric.Rect({
          left: 0,
          top: 0,
          width,
          height,
          fill: isBarcodeField ? "rgba(16,185,129,0.08)" : "rgba(56,189,248,0.08)",
          stroke: isBarcodeField ? "#059669" : "#0284c7",
          strokeDashArray: [5, 3],
          rx: 8,
          ry: 8,
          selectable: false,
          evented: false,
        });
        const caption = new fabric.Text(label, {
          left: width / 2,
          top: height / 2,
          originX: "center",
          originY: "center",
          fontSize: 12,
          fill: isBarcodeField ? "#047857" : "#0369a1",
          fontStyle: "italic",
          selectable: false,
          evented: false,
        });
        const placeholder = new fabric.Group([frame, caption], {
          left,
          top,
          hasControls: false,
        });
        (placeholder as any).__uid = uid;
        (placeholder as any).__layerName = `Field: ${fieldKey}`;
        (placeholder as any).__fieldKey = fieldKey;
        (placeholder as any).__fieldKind = isBarcodeField ? "barcode" : "image";
        (placeholder as any).__isDynamicField = true;
        (placeholder as any).variableKey = fieldKey;
        (placeholder as any).__boxWidth = width;
        (placeholder as any).__boxHeight = height;
        fc.add(placeholder);
        fc.setActiveObject(placeholder);
        fc.renderAll();
        return;
      }

      const textBoxWidth = 180;
      const textBoxHeight = 44;
      const textField = new fabric.Textbox(label, {
        left,
        top,
        width: textBoxWidth,
        fontFamily: "Inter, sans-serif",
        fontSize: 14,
        fill: "#7c3aed",
        fontStyle: "italic",
        hasControls: false,
        backgroundColor: "transparent",
        backgroundPadding: 0,
      });
      (textField as any).__uid = uid;
      (textField as any).__layerName = `Field: ${fieldKey}`;
      (textField as any).__fieldKey = fieldKey;
      (textField as any).__fieldKind = "text";
      (textField as any).__isDynamicField = true;
      (textField as any).variableKey = fieldKey;
      (textField as any).__boxWidth = textBoxWidth;
      (textField as any).__boxHeight = textBoxHeight;
      // Inherit the last-used text style so consecutive variable additions
      // keep the same font, color, outline and shadow without requiring the
      // user to reapply styles on every new field.
      const lusV = lastUsedTextStyleRef.current;
      if (lusV._isSet) {
        textField.set({
          fontFamily:  lusV.fontFamily  ?? textField.fontFamily,
          fontSize:    lusV.fontSize    ?? textField.fontSize,
          fill:        lusV.fill        ?? textField.fill,
          fontWeight:  lusV.fontWeight  ?? textField.fontWeight,
          fontStyle:   lusV.fontStyle   ?? textField.fontStyle,
          stroke:      lusV.stroke      ?? "",
          strokeWidth: lusV.strokeWidth ?? 0,
          paintFirst:  lusV.paintFirst  ?? "fill",
          shadow:      lusV.shadow      ?? null,
          textAlign:   lusV.textAlign   ?? textField.textAlign,
          underline:   lusV.underline   ?? false,
        } as any);
      }
      fc.add(textField);
      fc.setActiveObject(textField);
      fc.renderAll();
    }, []);

    const getImageMaskClipPadding = useCallback((image: fabric.FabricImage): number => {
      const borderWidth = Math.max(0, Number((image as any).fxBorderWidth ?? image.strokeWidth ?? 0));
      if (!borderWidth) return 0;
      // Fabric centers stroke on path edges; half can be clipped by clipPath unless mask is padded.
      return borderWidth / 2;
    }, []);

    const createImageMaskClipPath = useCallback(
      (
        image: fabric.FabricImage,
        shape: ImageMaskShape,
        radius: number,
        padding = 0
      ): fabric.FabricObject | undefined => {
        const baseW = image.width ?? 0;
        const baseH = image.height ?? 0;
        if (!baseW || !baseH || shape === "none") return undefined;

        const safePad = Math.max(0, Number(padding || 0));
        const w = baseW + safePad * 2;
        const h = baseH + safePad * 2;

        if (shape === "circle") {
          return new fabric.Circle({
            radius: Math.min(w, h) / 2,
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        if (shape === "square") {
          const side = Math.min(w, h);
          return new fabric.Rect({
            width: side,
            height: side,
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        if (shape === "rounded" || shape === "rounded-rectangle") {
          const maxRadius = Math.min(baseW, baseH) / 2 + safePad;
          const safeRadius = Math.max(0, Math.min(radius, maxRadius));
          return new fabric.Rect({
            width: w,
            height: h,
            rx: safeRadius,
            ry: safeRadius,
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        if (shape === "diamond") {
          return new fabric.Polygon(
            [
              { x: w / 2, y: 0 },
              { x: w, y: h / 2 },
              { x: w / 2, y: h },
              { x: 0, y: h / 2 },
            ],
            {
              originX: "center",
              originY: "center",
              left: 0,
              top: 0,
            }
          );
        }

        if (shape === "hexagon") {
          return new fabric.Polygon(
            [
              { x: w * 0.25, y: 0 },
              { x: w * 0.75, y: 0 },
              { x: w, y: h * 0.5 },
              { x: w * 0.75, y: h },
              { x: w * 0.25, y: h },
              { x: 0, y: h * 0.5 },
            ],
            {
              originX: "center",
              originY: "center",
              left: 0,
              top: 0,
            }
          );
        }

        if (shape === "triangle") {
          return new fabric.Polygon(
            [
              { x: w / 2, y: 0 },
              { x: w, y: h },
              { x: 0, y: h },
            ],
            {
              originX: "center",
              originY: "center",
              left: 0,
              top: 0,
            }
          );
        }

        if (shape === "pentagon") {
          const cx = w / 2;
          const cy = h / 2;
          const r = Math.min(w, h) / 2;
          const pts = Array.from({ length: 5 }, (_, i) => {
            const a = -Math.PI / 2 + (2 * Math.PI * i) / 5;
            return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
          });
          return new fabric.Polygon(pts, {
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        if (shape === "star") {
          const cx = w / 2;
          const cy = h / 2;
          const outerR = Math.min(w, h) / 2;
          const innerR = outerR * 0.4;
          const pts = Array.from({ length: 10 }, (_, i) => {
            const a = -Math.PI / 2 + (Math.PI * i) / 5;
            const r = i % 2 === 0 ? outerR : innerR;
            return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
          });
          return new fabric.Polygon(pts, {
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        if (shape === "ticket") {
          const notchR = Math.min(w, h) * 0.14;
          const notchX = w * 0.3;
          const path = [
            `M 0 0`,
            `H ${notchX - notchR}`,
            `A ${notchR} ${notchR} 0 0 0 ${notchX + notchR} 0`,
            `H ${w - notchX - notchR}`,
            `A ${notchR} ${notchR} 0 0 0 ${w - notchX + notchR} 0`,
            `H ${w}`,
            `V ${h}`,
            `H ${w - notchX + notchR}`,
            `A ${notchR} ${notchR} 0 0 0 ${w - notchX - notchR} ${h}`,
            `H ${notchX + notchR}`,
            `A ${notchR} ${notchR} 0 0 0 ${notchX - notchR} ${h}`,
            `H 0 Z`,
          ].join(" ");
          return new fabric.Path(path, {
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        if (shape === "flower") {
          const cx = w / 2;
          const cy = h / 2;
          const outerR = Math.min(w, h) / 2;
          const innerR = outerR * 0.72;
          const petals = 12;
          const pts = Array.from({ length: petals * 2 }, (_, i) => {
            const a = -Math.PI / 2 + (Math.PI * i) / petals;
            const r = i % 2 === 0 ? outerR : innerR;
            return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
          });
          return new fabric.Polygon(pts, {
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        if (shape === "cross") {
          const t = Math.min(w, h) * 0.33;
          const hw = w / 2;
          const hh = h / 2;
          return new fabric.Polygon(
            [
              { x: hw - t / 2, y: 0 },
              { x: hw + t / 2, y: 0 },
              { x: hw + t / 2, y: hh - t / 2 },
              { x: w, y: hh - t / 2 },
              { x: w, y: hh + t / 2 },
              { x: hw + t / 2, y: hh + t / 2 },
              { x: hw + t / 2, y: h },
              { x: hw - t / 2, y: h },
              { x: hw - t / 2, y: hh + t / 2 },
              { x: 0, y: hh + t / 2 },
              { x: 0, y: hh - t / 2 },
              { x: hw - t / 2, y: hh - t / 2 },
            ],
            {
              originX: "center",
              originY: "center",
              left: 0,
              top: 0,
            }
          );
        }

        if (shape === "oval") {
          return new fabric.Ellipse({
            rx: w / 2,
            ry: h * 0.35,
            originX: "center",
            originY: "center",
            left: 0,
            top: 0,
          });
        }

        return undefined;
      },
      []
    );

    const constrainObjectToSafeArea = useCallback((obj: fabric.FabricObject, fitText = false) => {
      const anyObj = obj as any;
      if (!obj || anyObj.excludeFromExport || anyObj.isBgImage || anyObj.isGuide) return;

      const cfg = configRef.current;
      const ds = displayScaleRef.current;
      const fc = fabricRef.current;
      const safeRect = getSafeAreaRectPx(cfg, ds);
      const safeLeft = safeRect.x;
      const safeTop = safeRect.y;
      const safeRight = safeRect.right;
      const safeBottom = safeRect.bottom;
      const safeWidth = safeRect.width;
      const safeHeight = safeRect.height;

      const getBounds = () => {
        // Always flush the cached corner coordinates before reading them.
        // During object:moving, Fabric updates obj.left/top but defers
        // setCoords() until after the event — so aCoords are stale without this.
        obj.setCoords();
        const coords = obj.getCoords();
        if (coords && coords.length > 0) {
          const xs = coords.map((p) => p.x);
          const ys = coords.map((p) => p.y);
          const left = Math.min(...xs);
          const right = Math.max(...xs);
          const top = Math.min(...ys);
          const bottom = Math.max(...ys);
          return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
          };
        }

        const left = obj.left ?? 0;
        const top = obj.top ?? 0;
        const width = obj.getScaledWidth();
        const height = obj.getScaledHeight();
        return {
          left,
          top,
          right: left + width,
          bottom: top + height,
          width,
          height,
        };
      };

      // fitText: auto-shrink font so element fits the safe area.
      // For Textbox, skip height-driven shrinkage — its height grows with content
      // and clamping via font size would prevent word-wrap from spanning multiple lines.
      // Only shrink when width exceeds safe area (horizontal overflow).
      if (fitText && (obj instanceof fabric.IText || obj instanceof fabric.Textbox)) {
        const isTextbox = obj instanceof fabric.Textbox;
        let fontSize = Number(obj.fontSize ?? 16);
        const minFontSize = 6;

        obj.set({ scaleX: 1, scaleY: 1 });
        obj.setCoords();

        let bounds = getBounds();
        while (
          (bounds.width > safeWidth || (!isTextbox && bounds.height > safeHeight))
          && fontSize > minFontSize
        ) {
          fontSize -= 1;
          obj.set({ fontSize });
          obj.setCoords();
          bounds = getBounds();
        }
      }

      let bounds = getBounds();
      // For Textbox, allow the height to exceed the safe area (content-driven height).
      // Only check width overflow — and reduce obj.width rather than applying
      // scaleX, because a Textbox with scaleX < 1 renders scaled/distorted text.
      const overflowW = bounds.width > safeWidth;
      const overflowH = !(obj instanceof fabric.Textbox) && bounds.height > safeHeight;
      if (overflowW || overflowH) {
        if (obj instanceof fabric.Textbox && overflowW) {
          // Clamp Textbox container width — leave scale at 1, let text reflow.
          const clampedW = Math.max(40, safeWidth);
          obj.set({ width: clampedW });
          (obj as any).__boxWidth = clampedW;
          (obj as any).initDimensions?.();
          obj.setCoords();
          bounds = getBounds();
        } else {
          // Non-Textbox objects: scale down proportionally.
          const scaleRatio = Math.min(
            overflowW ? safeWidth  / Math.max(bounds.width,  1) : 1,
            overflowH ? safeHeight / Math.max(bounds.height, 1) : 1,
            1
          );
          if (Number.isFinite(scaleRatio) && scaleRatio > 0 && scaleRatio < 1) {
            obj.set({
              scaleX: (obj.scaleX ?? 1) * scaleRatio,
              scaleY: (obj.scaleY ?? 1) * scaleRatio,
            });
            obj.setCoords();
            bounds = getBounds();
          }
        }
      }

      let dx = 0;
      let dy = 0;

      if (bounds.left < safeLeft) dx = safeLeft - bounds.left;
      else if (bounds.right > safeRight) dx = safeRight - bounds.right;

      if (bounds.top < safeTop) dy = safeTop - bounds.top;
      else if (bounds.bottom > safeBottom) dy = safeBottom - bounds.bottom;

      if (dx !== 0 || dy !== 0) {
        obj.set({
          left: (obj.left ?? 0) + dx,
          top: (obj.top ?? 0) + dy,
        });
        obj.setCoords();
      }
    }, []);

    // ── Apply correct handle controls for a Textbox based on its __textMode ─
    // "wrap"      → fixed width, height auto → only side handles, lock Y scale
    // "auto"      → IText, not a Textbox, so this only runs from auto_wrap path
    // "auto_wrap" → font shrinks + wraps → side handles + bottom handle, lock Y scale
    const applyTextboxControls = useCallback((tb: fabric.Textbox) => {
      const mode = ((tb as any).__textMode as string | undefined) ?? "wrap";
      // wrap:      height grows with content — lock vertical drag
      // auto_wrap: user sets the max height box — allow vertical resize
      // none:      user hasn't chosen a mode — treat like wrap for controls,
      //            but preserve existing splitByGrapheme (don't force it)
      const isAutoWrap = mode === "auto_wrap";
      tb.set({
        // Ensure origin is always top-left so left/top map directly to the
        // top-left corner of the textbox.  Mismatched origins cause the object
        // to jump when we restore prevLeft/prevTop in onObjectScaling.
        originX: "left",
        originY: "top",
        // Explicitly own hasControls/selectable here so this function is self-contained.
        hasControls: true,
        selectable: true,
        evented: true,
        lockScalingFlip: true,
        noScaleCache: true,
        centeredScaling: false,
        // X-axis scaling must be explicitly unlocked so the ml/mr/tl/tr/bl/br
        // handles are not treated as locked by Fabric's control renderer.
        lockScalingX: false,
        lockScalingY: false,
        lockSkewingX: true,
        lockSkewingY: true,
        // All modes use word-boundary wrapping (splitByGrapheme: false).
        // splitByGrapheme:true causes character-level wrapping — never wanted.
        // "auto" uses enableNoWrap patch to suppress wrapping entirely.
        splitByGrapheme: false,
      });
      tb.setControlsVisibility({
        tl: true,   // top-left corner
        tr: true,   // top-right corner
        bl: true,   // bottom-left corner
        br: true,   // bottom-right corner
        mb: true,   // bottom-center — height-only drag
        mt: false,  // no top/side handles
        ml: false,
        mr: false,
        mtr: true,  // rotation
      });

      // ── Cursor overrides ──────────────────────────────────────────────────
      const controls = (tb as any).controls as
        | Record<string, { cursorStyle?: string; cursorStyleHandler?: unknown }>
        | undefined;
      if (controls) {
        const nwse = () => "nwse-resize";
        const nesw = () => "nesw-resize";
        const ns   = () => "ns-resize";
        if (controls.tl) { controls.tl.cursorStyle = "nwse-resize"; controls.tl.cursorStyleHandler = nwse; }
        if (controls.br) { controls.br.cursorStyle = "nwse-resize"; controls.br.cursorStyleHandler = nwse; }
        if (controls.tr) { controls.tr.cursorStyle = "nesw-resize"; controls.tr.cursorStyleHandler = nesw; }
        if (controls.bl) { controls.bl.cursorStyle = "nesw-resize"; controls.bl.cursorStyleHandler = nesw; }
        if (controls.mb) { controls.mb.cursorStyle = "ns-resize";   controls.mb.cursorStyleHandler = ns;   }
      }

      // Flush coordinate cache so Fabric paints controls at current position.
      tb.setCoords();
    }, []);

    // ── Configure controls for an IText that is in AUTO_SIZE mode ─────────
    // Corner handles trigger conversion to Word Wrap Textbox on first drag.
    const applyITextAutoControls = useCallback((it: fabric.IText) => {
      it.set({
        hasControls: true,
        selectable: true,
        evented: true,
        lockScalingX: false,
        lockScalingY: false,
        lockSkewingX: true,
        lockSkewingY: true,
      });
      it.setControlsVisibility({
        tl: true, tr: true, bl: true, br: true,
        mt: false, mb: false, ml: false, mr: false,
        mtr: true,
      });
      const controls = (it as any).controls as
        | Record<string, { cursorStyle?: string; cursorStyleHandler?: unknown }>
        | undefined;
      if (controls) {
        const nwse = () => "nwse-resize";
        const nesw = () => "nesw-resize";
        if (controls.tl) { controls.tl.cursorStyle = "nwse-resize"; controls.tl.cursorStyleHandler = nwse; }
        if (controls.br) { controls.br.cursorStyle = "nwse-resize"; controls.br.cursorStyleHandler = nwse; }
        if (controls.tr) { controls.tr.cursorStyle = "nesw-resize"; controls.tr.cursorStyleHandler = nesw; }
        if (controls.bl) { controls.bl.cursorStyle = "nesw-resize"; controls.bl.cursorStyleHandler = nesw; }
      }
      it.setCoords();
    }, []);

    // ── Apply 4-corner controls for non-text container objects ─────────────
    // Shows only diagonal corner handles (tl, tr, bl, br). No side handles.
    const applyContainerControls = useCallback((obj: fabric.FabricObject) => {
      obj.set({
        hasControls: true,
        lockScalingFlip: true,
        centeredScaling: false,
      });
      obj.setControlsVisibility({
        tl:  true,  // top-left corner
        tr:  true,  // top-right corner
        bl:  true,  // bottom-left corner
        br:  true,  // bottom-right corner
        mt:  false, // no side handles
        mb:  false,
        ml:  false,
        mr:  false,
        mtr: true,  // rotation
      });
      const controls = (obj as any).controls as
        | Record<string, { cursorStyle?: string; cursorStyleHandler?: unknown }>
        | undefined;
      if (controls) {
        const nwse = () => "nwse-resize";
        const nesw = () => "nesw-resize";
        if (controls.tl) { controls.tl.cursorStyle = "nwse-resize"; controls.tl.cursorStyleHandler = nwse; }
        if (controls.br) { controls.br.cursorStyle = "nwse-resize"; controls.br.cursorStyleHandler = nwse; }
        if (controls.tr) { controls.tr.cursorStyle = "nesw-resize"; controls.tr.cursorStyleHandler = nesw; }
        if (controls.bl) { controls.bl.cursorStyle = "nesw-resize"; controls.bl.cursorStyleHandler = nesw; }
      }
      obj.setCoords();
    }, []);

    // ── Init canvas once ────────────────────────────────────────────────────
    useEffect(() => {
      if (!containerRef.current) return;

      // Create the canvas imperatively so React never owns the <canvas> node.
      // React only manages the wrapper <div>; Fabric manages everything inside.
      // This prevents the 'removeChild' NotFoundError on unmount.
      const canvasEl = document.createElement("canvas");
      containerRef.current.appendChild(canvasEl);

      const fc = new fabric.Canvas(canvasEl, {
        width: viewportCanvasPxW,
        height: viewportCanvasPxH,
        backgroundColor: "#ffffff",
        selection: true,
        selectionColor: "rgba(0,0,0,0)",
        selectionBorderColor: "rgba(0,0,0,0)",
        selectionLineWidth: 0,
        preserveObjectStacking: true,
        enableRetinaScaling: true,
      });

      // Use Fabric viewport zoom (vector rerender) instead of CSS bitmap scaling.
      fc.setViewportTransform([displayScale, 0, 0, displayScale, 0, 0]);

      // Enable/configure controls for every newly-selected object.
      fc.on("selection:created", (e) => {
        if (e.selected) {
          e.selected.forEach((obj) => {
            const anyObj = obj as any;
            const isLocked = anyObj.isGuide || anyObj.isBgImage || anyObj.excludeFromExport;
            obj.set({
              hasControls: !isLocked,
              hasBorders: true,
              borderColor: "#999",
            });

            if (!isLocked && obj instanceof fabric.Textbox) {
              applyTextboxControls(obj);
            } else if (!isLocked && obj instanceof fabric.IText) {
              // IText is AUTO_SIZE mode: show ml/mr as "click to switch to Word Wrap"
              applyITextAutoControls(obj);
            } else if (!isLocked) {
              // All other elements (shapes, images, groups …): 4 directional handles only
              applyContainerControls(obj);
            }
          });
        }
        onSelectionChangeRef.current(e.selected?.[0] ?? null);
        // Flush control visibility changes to the upper canvas immediately.
        fc.requestRenderAll();
      });
      fc.on("selection:updated", (e) => {
        if (e.selected) {
          e.selected.forEach((obj) => {
            const anyObj = obj as any;
            const isLocked = anyObj.isGuide || anyObj.isBgImage || anyObj.excludeFromExport;
            obj.set({
              hasControls: !isLocked,
              hasBorders: true,
              borderColor: "#999",
            });

            if (!isLocked && obj instanceof fabric.Textbox) {
              applyTextboxControls(obj);
            } else if (!isLocked && obj instanceof fabric.IText) {
              applyITextAutoControls(obj);
            } else if (!isLocked) {
              applyContainerControls(obj);
            }
          });
        }
        onSelectionChangeRef.current(e.selected?.[0] ?? null);
        // Flush control visibility changes to the upper canvas immediately.
        fc.requestRenderAll();
      });
      fc.on("selection:cleared", () => onSelectionChangeRef.current(null));
      
      // Disable controls on newly added objects
      fc.on("object:added", (e) => {
        if (e.target) {
          const anyObj = e.target as any;
          const isLocked = anyObj.isGuide || anyObj.isBgImage || anyObj.excludeFromExport;
          e.target.set({ hasControls: !isLocked });

          if (!isLocked && e.target instanceof fabric.Textbox) {
            applyTextboxControls(e.target);
            // Re-apply the no-wrap patch for auto-size boxes.
            // The instance-level _splitTextIntoLines override is not serialised
            // to JSON, so it must be re-stamped every time a Textbox is added to
            // the canvas (covers loadFromJSON, undo/redo, and copy-paste).
            if ((e.target as any).__textMode === "auto") {
              enableNoWrap(e.target);
            }
          } else if (!isLocked && e.target instanceof fabric.IText) {
            applyITextAutoControls(e.target);
          } else if (!isLocked) {
            applyContainerControls(e.target);
          }

          // For Textbox, skip fitText — auto-shrinking font on add undoes wrapping.
          constrainObjectToSafeArea(e.target, !(e.target instanceof fabric.Textbox));
        }
      });

      // Save history snapshot after each modification.
      const saveSnapshot = (e?: { target?: fabric.FabricObject }) => {
        if (e?.target && (e.target as any).isGuide) return;
        pushUndoSnapshot(true);
      };
      fc.on("object:added", saveSnapshot);
      fc.on("object:modified", saveSnapshot);
      fc.on("object:removed", saveSnapshot);
      fc.on("text:changed", saveSnapshot);

      // ── Clamp objects inside the margin safe-area ──────────────────────
      const clampToMargin = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj) return;
        constrainObjectToSafeArea(obj, false);
      };

      const onObjectScaling = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj) return;

        if (obj instanceof fabric.Textbox) {
          const anyObj = obj as any;

          // Auto Size mode: user is dragging a resize handle.
          // Keep the mode as "auto" — do NOT switch to wrap.
          // The reflow branch below handles font-fitting at the new width.
          if (anyObj.__textMode === "auto") {
            // Update stored box width so future drags use the correct baseline.
            anyObj.__boxWidth = Math.max(40, Number(obj.width) || 80);
          }

          // `transform.original` = exact state at drag start (set by Fabric).
          // `corner` = which handle is being dragged: tl | tr | bl | br.
          // We compute new width/height/left/top ourselves so anchor behaviour
          // is deterministic regardless of originX/originY or scaleX/scaleY.
          const t = (e as any).transform as {
            corner?: string;
            original?: { left?: number; top?: number; width?: number; height?: number; scaleX?: number; scaleY?: number };
          } | undefined;
          const corner = t?.corner ?? "";

          // Initialise drag-start snapshot once per gesture.
          if (anyObj.__scalingOrigW == null) {
            anyObj.__scalingOrigW = Math.max(40, Number(t?.original?.width  ?? obj.width  ?? anyObj.__boxWidth  ?? 80));
            anyObj.__scalingOrigH = Math.max(20, Number(t?.original?.height ?? obj.height ?? anyObj.__boxHeight ?? 20));
            anyObj.__scalingOrigL = Number(t?.original?.left ?? obj.left ?? 0);
            anyObj.__scalingOrigT = Number(t?.original?.top  ?? obj.top  ?? 0);
          }

          const origW = anyObj.__scalingOrigW as number;
          const origH = anyObj.__scalingOrigH as number;
          const origL = anyObj.__scalingOrigL as number;
          const origT = anyObj.__scalingOrigT as number;

          // Current scaled dimensions after Fabric applied the drag delta.
          const sx = Math.max(0.01, Number(obj.scaleX ?? 1));
          const sy = Math.max(0.01, Number(obj.scaleY ?? 1));
          const draggedW = Math.max(40, origW * sx);
          const draggedH = Math.max(20, origH * sy);

          // ── Lock height for wrap/none/auto corner drags ──────────────────
          // In wrap, none, and auto modes, corners only control width.
          // Height is handled by its own dedicated mechanism:
          //  - wrap/none: mb handle or __boxHeight
          //  - auto: applyAutoFitFont recalculates single-line height
          // Force newH = origH so that tl/tr anchor math never shifts newTop.
          const isWrapLike = (
            anyObj.__textMode === "wrap" ||
            anyObj.__textMode === "none" ||
            anyObj.__textMode === "auto" ||
            !anyObj.__textMode
          );
          // For mb drag or auto_wrap, height is allowed to change freely.
          const lockHeight = isWrapLike && corner !== "mb";

          // ── Anchor logic per corner ────────────────────────────────────────
          // mb: top-left-right-all fixed → only bottom edge moves (height only)
          // tl: bottom-right fixed → left & top both change
          // tr: bottom-left fixed → left FIXED, top changes
          // bl: top-right fixed   → left changes, top FIXED
          // br: top-left fixed    → left & top both FIXED
          let newLeft = origL;
          let newTop  = origT;
          let newW    = draggedW;
          // When height is locked (wrap/none corner drag), clamp newH to origH
          // so the anchor math never moves the top edge vertically.
          let newH    = lockHeight ? origH : draggedH;

          if (corner === "mb") {
            // Bottom-center handle: ONLY height changes.
            // Width, X, and Y are all frozen.
            newW    = origW;   // WIDTH FIXED
            newLeft = origL;   // X FIXED
            newTop  = origT;   // Y FIXED — top edge never moves
            newH    = Math.max(20, draggedH);
          } else if (corner === "tl") {
            // top-left handle: right & bottom edges stay put
            newLeft = origL + (origW - newW);
            newTop  = origT + (origH - newH);
          } else if (corner === "tr") {
            // top-right handle: left & bottom edges stay put
            newLeft = origL;                     // LEFT FIXED
            newTop  = origT + (origH - newH);
          } else if (corner === "bl") {
            // bottom-left handle: right & top edges stay put
            newLeft = origL + (origW - newW);
            newTop  = origT;                     // TOP FIXED
          } else {
            // br (default): top-left corner fixed — both positions stay
            newLeft = origL;                     // LEFT FIXED
            newTop  = origT;                     // TOP FIXED
          }

          // ── Bake into object (scale always reset to 1) ────────────────────
          // For the mb (bottom) handle, height is set explicitly.
          // For all corner handles, height is left to Fabric/initDimensions.
          obj.set({
            originX: "left",
            originY: "top",
            left:   newLeft,
            top:    newTop,
            width:  newW,
            scaleX: 1,
            scaleY: 1,
            dirty:  true,
          });

          // ── Text reflow ────────────────────────────────────────────────────
          const isAutoWrap = anyObj.__textMode === "auto_wrap";

          if (corner === "mb") {
            // Bottom-center drag: height-only. Width and font are untouched.
            // Reflow text at the current (fixed) width, then enforce the
            // user-dragged height so space below text is preserved.
            obj.set({ splitByGrapheme: false });
            if (!anyObj.__wordBoundaryPatched) patchWordBoundaryWrap(obj as fabric.Textbox);
            (obj as any).initDimensions?.();
            // Content height after reflow — never let box clip text.
            const contentH = Math.max(20, Number(obj.height) || 20);
            const finalH   = Math.max(contentH, newH);
            obj.set({ height: finalH });
            anyObj.__boxHeight = finalH;
          } else if (anyObj.__textMode === "auto") {
            // Auto Size: fit font to new width (shrink only — NEVER grow font).
            obj.set({ splitByGrapheme: false });
            applyAutoFitFont(obj, newW, 1, 100, /* shrinkOnly */ true);
            // applyAutoFitFont calls initDimensions() which resets obj.height to
            // the single-line content height. If the user previously dragged the
            // mb handle to give the box a taller height, restore it so width
            // changes do not undo the user's explicit height resize.
            const autoUserH    = Math.max(0, Number(anyObj.__boxHeight) || 0);
            if (autoUserH > 0) {
              const autoContentH = Math.max(20, Number(obj.height) || 20);
              const autoFinalH   = Math.max(autoContentH, autoUserH);
              if (autoFinalH !== Number(obj.height)) obj.set({ height: autoFinalH });
            }
          } else if (isAutoWrap) {
            // Auto+Wrap: width can change freely; height is user-controlled.
            // applyAutoWrap reflowes text at the new width (calls initDimensions
            // which resets obj.height to content height). Restore the
            // user-set height so the container never shrinks automatically.
            applyAutoWrap(obj, newW);
            const awUserH   = Math.max(0, Number(anyObj.__boxHeight) || 0);
            const awContentH = Math.max(20, Number(obj.height) || 20);
            const awFinalH  = awUserH > 0 ? Math.max(awContentH, awUserH) : awContentH;
            obj.set({ height: awFinalH });
            anyObj.__boxHeight = awFinalH;
          } else {
            // "none" / "wrap": fixed font, word-boundary reflow only.
            // Width changed; height is INDEPENDENT — restore the user-set value
            // because initDimensions() will reset obj.height to content height.
            obj.set({ splitByGrapheme: false });
            if (!(obj as any).__wordBoundaryPatched) patchWordBoundaryWrap(obj as fabric.Textbox);
            (obj as any).initDimensions?.();
            // Content height after reflow at the new width.
            const contentH  = Math.max(20, Number(obj.height) || 20);
            // User-set height from previous mb drag (0 = never explicitly set).
            const userH     = Math.max(0, Number(anyObj.__boxHeight) || 0);
            // Final height: at least as tall as content; honour user value if larger.
            const restoredH = Math.max(contentH, userH);
            obj.set({ height: restoredH });
            anyObj.__boxHeight = restoredH;
          }

          obj.setCoords();
          constrainObjectToSafeArea(obj, false);
          return;
        }

        if (obj instanceof fabric.IText) {
          // AUTO_SIZE → WORD_WRAP on first resize drag.
          // The user grabbed ml or mr on the IText.  Convert to a Textbox in
          // "wrap" mode right now so the rest of this drag (and all future
          // drags) go through the Textbox path with proper width baking.
          const anyIt = obj as any;
          const fc = fabricRef.current;
          if (!fc) { constrainObjectToSafeArea(obj, false); return; }

          // Measure current visual width as the initial box width.
          const naturalW = Math.max(80, Number(anyIt.__boxWidth) || Math.round(obj.getScaledWidth()) || 80);

          const tb = new fabric.Textbox(obj.text ?? "", {
            left:        obj.left,
            top:         obj.top,
            width:       naturalW,
            fontSize:    obj.fontSize,
            fontFamily:  obj.fontFamily,
            fontWeight:  obj.fontWeight as string,
            fontStyle:   obj.fontStyle as any,
            fill:        obj.fill,
            textAlign:   obj.textAlign as any,
            angle:       obj.angle,
            opacity:     obj.opacity,
            underline:   obj.underline,
            splitByGrapheme: false,
            scaleX: 1,
            scaleY: 1,
            lockScalingFlip: true,
            noScaleCache: true,
            selectable: true,
            evented: true,
            backgroundColor: anyIt.backgroundColor ?? "transparent",
            backgroundPadding: anyIt.backgroundPadding ?? 0,
          });
          (tb as any).__uid         = anyIt.__uid;
          (tb as any).__layerName   = anyIt.__layerName;
          (tb as any).__fieldKey    = anyIt.__fieldKey;
          (tb as any).__fieldKind   = anyIt.__fieldKind;
          (tb as any).__isDynamicField = anyIt.__isDynamicField;
          (tb as any).variableKey   = anyIt.variableKey;
          (tb as any).__boxWidth    = naturalW;
          (tb as any).__boxHeight   = anyIt.__boxHeight;
          // Preserve "auto" mode if the IText was already in auto; otherwise
          // the first resize drag converts to Word Wrap (Canva-style behaviour).
          const origItMode = anyIt.__textMode as string | undefined;
          (tb as any).__textMode    = (origItMode === "auto") ? "auto" : "wrap";
          // For auto mode: no wrapping, font will be fitted below.
          if ((tb as any).__textMode === "auto") {
            tb.set({ splitByGrapheme: false });
          } else {
            // wrap mode: word-boundary wrap + long-word break fallback.
            patchWordBoundaryWrap(tb);
          }
          (tb as any).initDimensions?.();

          ignoreSaveRef.current = true;
          fc.remove(obj);
          fc.add(tb);
          fc.setActiveObject(tb);
          ignoreSaveRef.current = false;

          // Apply the correct handle set on the new Textbox immediately.
          applyTextboxControls(tb);
          // For auto mode, immediately fit the font to the box width.
          if ((tb as any).__textMode === "auto") {
            applyAutoFitFont(tb, naturalW);
          }
          fc.requestRenderAll();

          // Notify the parent so the Properties Panel reflects the mode.
          onSelectionChangeRef.current(tb);
          fc.fire("object:modified", { target: tb });
        } else {
          // ── Non-text containers (Rect, Circle, Group, FabricImage, etc.) ──
          // Use the same delta-based anchor approach as Textbox: read
          // transform.original for the drag-start snapshot, compute new
          // width/height and left/top from the corner being dragged, then
          // bake scaleX/scaleY back to 1 so compound drift never accumulates.
          const anyObj = obj as any;
          if (anyObj.__isLocked) { constrainObjectToSafeArea(obj, false); return; }

          const t2 = (e as any).transform as {
            corner?: string;
            original?: { left?: number; top?: number; width?: number; height?: number; scaleX?: number; scaleY?: number };
          } | undefined;
          const corner2 = t2?.corner ?? "";

          if (anyObj.__scalingOrigW == null) {
            anyObj.__scalingOrigW = Math.max(10, Number(t2?.original?.width  ?? obj.width  ?? 80));
            anyObj.__scalingOrigH = Math.max(10, Number(t2?.original?.height ?? obj.height ?? 80));
            anyObj.__scalingOrigL = Number(t2?.original?.left ?? obj.left ?? 0);
            anyObj.__scalingOrigT = Number(t2?.original?.top  ?? obj.top  ?? 0);
          }

          const origW2 = anyObj.__scalingOrigW as number;
          const origH2 = anyObj.__scalingOrigH as number;
          const origL2 = anyObj.__scalingOrigL as number;
          const origT2 = anyObj.__scalingOrigT as number;

          const sx2 = Math.max(0.001, Number(obj.scaleX ?? 1));
          const sy2 = Math.max(0.001, Number(obj.scaleY ?? 1));

          let newW2 = Math.max(10, origW2 * sx2);
          let newH2 = Math.max(10, origH2 * sy2);
          let newL2 = origL2;
          let newT2 = origT2;

          if (corner2 === "tl") {
            newL2 = origL2 + (origW2 - newW2);
            newT2 = origT2 + (origH2 - newH2);
          } else if (corner2 === "tr") {
            newL2 = origL2;                       // LEFT FIXED
            newT2 = origT2 + (origH2 - newH2);
          } else if (corner2 === "bl") {
            newL2 = origL2 + (origW2 - newW2);
            newT2 = origT2;                       // TOP FIXED
          } else {
            // br (default): top-left stays fixed
            newL2 = origL2;                       // LEFT FIXED
            newT2 = origT2;                       // TOP FIXED
          }

          if (obj instanceof fabric.Circle) {
            const newRadius = Math.max(5, Math.min(newW2, newH2) / 2);
            obj.set({ left: newL2, top: newT2, radius: newRadius, scaleX: 1, scaleY: 1 } as any);
          } else if (obj instanceof fabric.FabricImage) {
            // FabricImage: scale IS the size — bake back to a single scale
            const intrinsicW = Math.max(1, Number((obj as any)._originalElement?.naturalWidth ?? obj.width ?? 1));
            const intrinsicH = Math.max(1, Number((obj as any)._originalElement?.naturalHeight ?? obj.height ?? 1));
            obj.set({ left: newL2, top: newT2, scaleX: newW2 / intrinsicW, scaleY: newH2 / intrinsicH });
          } else {
            obj.set({ left: newL2, top: newT2, width: newW2, height: newH2, scaleX: 1, scaleY: 1 });
          }
          obj.setCoords();
        }

        constrainObjectToSafeArea(obj, false);
      };
      // ── Auto-fit font size in real-time while typing ────────────────────
      const onTextChanged = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj || !(obj instanceof fabric.Textbox)) return;
        const anyObj = obj as any;
        const mode = anyObj.__textMode as string | undefined;

        if (mode === "auto") {
          // Auto Size: during live typing use shrink-only mode so deleting a
          // character does NOT cause the font to grow back and fill the box.
          // Font will only decrease if the text overflows the container width.
          const boxW = Math.max(40, Number(anyObj.__boxWidth) || Number(obj.width) || 80);
          obj.set({ splitByGrapheme: false });
          applyAutoFitFont(obj, boxW, 1, 100, /* shrinkOnly */ true);
          // Restore user-set height (mb drag) which initDimensions() may have reset.
          const tcUserH = Math.max(0, Number(anyObj.__boxHeight) || 0);
          if (tcUserH > 0) {
            const tcContentH = Math.max(20, Number(obj.height) || 20);
            const tcFinalH   = Math.max(tcContentH, tcUserH);
            if (tcFinalH !== Number(obj.height)) obj.set({ height: tcFinalH });
          }
          return;
        }

        // Normal ("none"/null) and Word Wrap ("wrap"): font is fixed.
        // Fabric internally calls initDimensions() on every keystroke, which
        // resets obj.height to the wrapped content height — ignoring any taller
        // container the user deliberately created with the mb handle.
        // Restore the user-set height so the container stays fixed.
        if (mode === "none" || mode == null || mode === "wrap") {
          const userH = Math.max(0, Number(anyObj.__boxHeight) || 0);
          if (userH > 0) {
            const contentH  = Math.max(20, Number(obj.height) || 20);
            const restoredH = Math.max(contentH, userH);
            if (restoredH !== Number(obj.height)) obj.set({ height: restoredH });
          }
          return;
        }

        if (mode === "auto_wrap") {
          // Auto+Wrap: reflow text at new width. Height is user-controlled —
          // restore it after initDimensions() resets it to content height.
          const boxW = Math.max(40, Number(anyObj.__boxWidth) || Number(obj.width) || 80);
          applyAutoWrap(obj, boxW);
          const awUserH    = Math.max(0, Number(anyObj.__boxHeight) || 0);
          if (awUserH > 0) {
            const awContentH = Math.max(20, Number(obj.height) || 20);
            const awRestored = Math.max(awContentH, awUserH);
            if (awRestored !== Number(obj.height)) obj.set({ height: awRestored });
          }
        }
        // renderAll is called by the canvas after text:changed automatically
      };

      // ── Alignment snapping & guide lines ────────────────────────────────
      const alignGuides = new AlignmentGuideManager();

      /**
       * Called on every object:moving tick.
       * 1. Collects bounding rects for all non-guide, non-background objects.
       * 2. Runs alignment + equal-spacing detection.
       * 3. Snaps the dragged object into alignment (if within threshold).
       * 4. Renders the matching guide lines.
       */
      const onObjectMovingAlignment = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj || (obj as any).isGuide) return;

        // getBoundingRect() returns coordinates in VIEWPORT space
        // (canvas-element pixels, after the displayScale viewport transform).
        // obj.left / obj.top are in MODEL space.
        // Relationship: viewport = model × displayScale.
        // All alignment detection works in viewport space; we must convert
        // the snap delta back to model space before writing obj.left / obj.top.
        const ds = displayScaleRef.current || 1;

        // Bounding rect of the dragged object in viewport space.
        // setCoords() is called inside rectFromFabricObject to flush the
        // current transform into the coord cache before reading getBoundingRect().
        const currentRect = rectFromFabricObject(obj);

        // Bounding rects of all other interactive objects (exclude guides/bg).
        const objectRects = fc
          .getObjects()
          .filter((o) => {
            const ao = o as any;
            return (
              o !== obj &&
              !ao.isGuide &&
              !ao.isBgImage &&
              !ao.excludeFromExport
            );
          })
          .map((o) => rectFromFabricObject(o));

        // Add the canvas itself as a virtual target so objects snap to the
        // canvas center and all four canvas edges.
        //
        // IMPORTANT: all object rects come from getBoundingRect() which returns
        // MODEL-SPACE coordinates (before the viewport transform).  We must use
        // the same model-space canvas dimensions here, NOT fc.getWidth() (which
        // is viewport-space = model × displayScale).
        const vpt = (fc as any).viewportTransform as number[] | undefined;
        const vptX = vpt ? vpt[0] : 1;
        const vptY = vpt ? vpt[3] : 1;
        const canvasRect = {
          left:   0,
          top:    0,
          width:  fc.getWidth()  / vptX,   // model canvas width
          height: fc.getHeight() / vptY,   // model canvas height
        };
        const otherRects = [canvasRect, ...objectRects];

        // Run detection (all coordinates are viewport-space throughout)
        const alignResult   = detectAlignment(currentRect, otherRects);
        const spacingGuides = detectEqualSpacing(currentRect, objectRects);

        // Apply snap:
        //   delta_viewport = snapTarget - currentBoundingRect edge
        //   delta_model    = delta_viewport / displayScale
        //   obj.left      += delta_model
        if (alignResult.snapLeft !== null || alignResult.snapTop !== null) {
          if (alignResult.snapLeft !== null) {
            obj.left = (obj.left ?? 0) + (alignResult.snapLeft - currentRect.left) / ds;
          }
          if (alignResult.snapTop !== null) {
            obj.top = (obj.top ?? 0) + (alignResult.snapTop - currentRect.top) / ds;
          }
          obj.setCoords();
        }

        // Render guides (replaces previous guides without extra repaints)
        alignGuides.showGuides(fc, alignResult.lines, spacingGuides);
      };

      /** Clear all guide lines when dragging ends. */
      const clearAlignmentGuides = () => alignGuides.clearGuides(fc);

      // ── Selection vs Edit mode ────────────────────────────────────────────
      // Single click  → select → bounding box + resize handles visible.
      // Double click  → enter editing → hide resize handles to avoid overlap.
      // Exit editing  → restore handles.
      const onTextEditingEntered = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj) return;
        // Hide all controls while the user types; the text cursor takes over.
        obj.set({ hasControls: false, hasBorders: false });
        fc.requestRenderAll();
      };

      const onTextEditingExited = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj) return;
        // Restore controls and border after editing ends.
        obj.set({ hasControls: true, hasBorders: true, borderColor: "#999" });
        if (obj instanceof fabric.Textbox) {
          const anyTb = obj as any;
          const exitMode = anyTb.__textMode as string | undefined;
          // Re-fit font when leaving edit mode in modes that auto-scale.
          if (exitMode === "auto") {
            const boxW = Math.max(40, Number(anyTb.__boxWidth) || Number(obj.width) || 80);
            obj.set({ splitByGrapheme: false });
            applyAutoFitFont(obj, boxW);
            // Restore user-set height (mb drag) that initDimensions() may have reset.
            const exUserH = Math.max(0, Number(anyTb.__boxHeight) || 0);
            if (exUserH > 0) {
              const exContentH = Math.max(20, Number(obj.height) || 20);
              const exFinalH   = Math.max(exContentH, exUserH);
              if (exFinalH !== Number(obj.height)) obj.set({ height: exFinalH });
            }
          } else if (exitMode === "auto_wrap") {
            // Auto+Wrap: reflow text at stored width. Height is user-controlled —
            // restore it after applyAutoWrap resets it via initDimensions().
            const boxW = Math.max(40, Number(anyTb.__boxWidth) || Number(obj.width) || 80);
            applyAutoWrap(obj, boxW);
            const awUserH    = Math.max(0, Number(anyTb.__boxHeight) || 0);
            if (awUserH > 0) {
              const awContentH = Math.max(20, Number(obj.height) || 20);
              const awRestored = Math.max(awContentH, awUserH);
              if (awRestored !== Number(obj.height)) obj.set({ height: awRestored });
            }
          } else {
            // wrap / none: font and width are fixed.
            // Fabric may have reset obj.height to content height during editing.
            // Restore the user-set height so the container does not shrink.
            const userH = Math.max(0, Number(anyTb.__boxHeight) || 0);
            if (userH > 0) {
              const contentH  = Math.max(20, Number(obj.height) || 20);
              const restoredH = Math.max(contentH, userH);
              if (restoredH !== Number(obj.height)) obj.set({ height: restoredH });
            }
          }
          // Apply mode-correct resize handles
          applyTextboxControls(obj);
        } else if (obj instanceof fabric.IText) {
          // Legacy IText (old saved canvases): hide all scale handles.
          obj.set({ lockScalingX: true, lockScalingY: true, lockSkewingX: true, lockSkewingY: true });
          obj.setControlsVisibility({ tl: false, tr: false, bl: false, br: false, mt: false, mb: false, ml: false, mr: false, mtr: true });
        }
        fc.requestRenderAll();
      };

      fc.on("object:moving",  clampToMargin);
      fc.on("object:moving",  onObjectMovingAlignment);
      fc.on("object:scaling", onObjectScaling);
      fc.on("object:rotating", clampToMargin);
      // ── Reflow text during ml/mr drag (changeWidth action) ───────────────
      // Fabric's changeWidth action sets obj.width directly and fires
      // "object:resizing" — it does NOT fire "object:scaling".  Textbox.set()
      // only calls initDimensions() when properties in textLayoutProperties
      // change, and "width" is not in that list.  Without an explicit
      // initDimensions() call the text layout stays stale during the drag.
      fc.on("object:resizing", (e) => {
        const obj = e.target;
        if (!obj || !(obj instanceof fabric.Textbox)) return;
        const anyObj = obj as any;
        const resizeMode = anyObj.__textMode as string | undefined;
        // Ensure word-boundary wrap patch is active.
        if (!anyObj.__wordBoundaryPatched) patchWordBoundaryWrap(obj as fabric.Textbox);
        // Track live width so mode-specific reflow uses the current value.
        anyObj.__boxWidth = obj.width;
        // Reflow text at the new width (applyAutoWrap calls initDimensions).
        applyAutoWrap(obj, obj.width);
        // wrap / none / auto_wrap: height is user-controlled. initDimensions()
        // (called inside applyAutoWrap) resets obj.height to content height —
        // restore it.
        if (resizeMode === "wrap" || resizeMode === "none" || resizeMode === "auto_wrap" || !resizeMode) {
          const userH = Math.max(0, Number(anyObj.__boxHeight) || 0);
          if (userH > 0) {
            const contentH  = Math.max(20, Number(obj.height) || 20);
            const restoredH = Math.max(contentH, userH);
            if (restoredH !== Number(obj.height)) obj.set({ height: restoredH });
          }
        }
        obj.setCoords();
      });
      fc.on("object:modified", clampToMargin);
      fc.on("object:modified", clearAlignmentGuides);
      // After any resize gesture completes, sync the stored box dimensions to the
      // object's actual final dimensions.  This keeps __boxWidth/__boxHeight
      // accurate as the baseline for the NEXT drag, including after ml/mr side
      // handle resizes (which change obj.width directly via Fabric's changeWidth
      // action and never pass through onObjectScaling).
      fc.on("object:modified", (e) => {
        const obj = e.target;
        if (!obj) return;
        const anyObj = obj as any;
        if (obj instanceof fabric.Textbox) {
          anyObj.__boxWidth  = obj.width;
          anyObj.__boxHeight = obj.height;
        }
        // Capture visual style of any text object so the NEXT added text/variable
        // inherits it automatically (style persistence across additions).
        if (obj instanceof fabric.IText || obj instanceof fabric.Textbox) {
          const t = obj as fabric.IText;
          lastUsedTextStyleRef.current = {
            fontFamily:  (t.fontFamily  as string)  ?? "Inter, sans-serif",
            fontSize:    Number(t.fontSize  || 16),
            fill:        (t.fill        as string)  ?? "#1f2937",
            fontWeight:  (t.fontWeight  as string)  ?? "normal",
            fontStyle:   (t.fontStyle   as string)  ?? "normal",
            stroke:      (t.stroke      as string)  ?? "",
            strokeWidth: Number(t.strokeWidth ?? 0),
            paintFirst:  (t as any).paintFirst       ?? "fill",
            shadow:      t.shadow ?? null,
            textAlign:   (t.textAlign   as string)  ?? "left",
            underline:   Boolean(t.underline),
            _isSet:      true,
          };
        }
        // Clear drag-start sentinels so the next gesture captures them fresh.
        delete anyObj.__scalingOrigW;
        delete anyObj.__scalingOrigH;
        delete anyObj.__scalingOrigL;
        delete anyObj.__scalingOrigT;
      });
      fc.on("mouse:up",        clearAlignmentGuides);
      fc.on("text:changed", clampToMargin);
      fc.on("text:changed", onTextChanged);
      fc.on("text:editing:entered", onTextEditingEntered);
      fc.on("text:editing:exited",  onTextEditingExited);

      // Save initial blank canvas snapshot for history
      const initialSnapshot = createHistorySnapshot(fc);
      undoStackRef.current = [initialSnapshot];
      redoStackRef.current = [];

      fabricRef.current = fc;

      return () => {
        // React only owns the wrapper <div ref={containerRef}>, not the canvas.
        // Fabric disposes its own DOM nodes; React removes the wrapper div cleanly.
        try { fc.dispose(); } catch { /* ignore disposal errors */ }
        fabricRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createHistorySnapshot, performRedo, performUndo, pushUndoSnapshot]);

    // ── Resize when config dims change ──────────────────────────────────────
    useEffect(() => {
      const fc = fabricRef.current;
      if (!fc) return;
      fc.setDimensions({ width: viewportCanvasPxW, height: viewportCanvasPxH });
      fc.setViewportTransform([displayScale, 0, 0, displayScale, 0, 0]);
      
      // Rescale current background media (image/SVG) to match new canvas size
      const bgObject = getCanvasBackgroundObject(fc);
      if (bgObject) {
        placeBackgroundObject(
          bgObject,
          canvasPxW,
          canvasPxH,
          bgFitModeRef.current,
          bgOffsetRef.current.x,
          bgOffsetRef.current.y
        );
      }
      
      // Rescale SVG background using cover or contain scaling
      if (bgSVGRef.current) {
        placeBackgroundObject(
          bgSVGRef.current,
          canvasPxW,
          canvasPxH,
          bgFitModeRef.current,
          bgOffsetRef.current.x,
          bgOffsetRef.current.y
        );
      }
      
      fc.renderAll();
    }, [canvasPxW, canvasPxH, viewportCanvasPxW, viewportCanvasPxH, displayScale, getCanvasBackgroundObject, placeBackgroundObject]);

    // ── Margin guides ───────────────────────────────────────────────────────
    const drawMargins = useCallback(() => {
      const fc = fabricRef.current;
      if (!fc) return;

      // Remove previous tracked guide object.
      if (marginGroupRef.current) {
        fc.remove(marginGroupRef.current);
        marginGroupRef.current = null;
      }

      // Remove stale guide artifacts from older render strategies.
      fc.getObjects()
        .filter((obj) => {
          const anyObj = obj as any;
          if (anyObj.isGuide) return true;

          const stroke = String(anyObj.stroke ?? "");
          const hasGuideStroke =
            stroke.includes("59,130,246") || // old blue guide lines
            stroke.includes("37,99,235") ||  // current blue guide lines
            stroke.includes("107,114,128");  // old gray safe-area stroke
          const hasDash = Array.isArray(anyObj.strokeDashArray) && anyObj.strokeDashArray.length > 0;
          const nonInteractive = obj.selectable === false && obj.evented === false;
          const legacyGuideType = obj.type === "line" || obj.type === "rect" || obj.type === "group";

          return nonInteractive && hasDash && hasGuideStroke && legacyGuideType;
        })
        .forEach((obj) => fc.remove(obj));

      if (!showMargins) {
        fc.renderAll();
        return;
      }

      const safeRectPx = getSafeAreaRectPx(config, 1);

      const safeAreaDebug = {
        canvasWidth: safeRectPx.debug.canvasWidth,
        canvasHeight: safeRectPx.debug.canvasHeight,
        leftMargin: safeRectPx.debug.leftMargin,
        rightMargin: safeRectPx.debug.rightMargin,
        topMargin: safeRectPx.debug.topMargin,
        bottomMargin: safeRectPx.debug.bottomMargin,
        innerX: safeRectPx.debug.innerX,
        innerY: safeRectPx.debug.innerY,
        innerWidth: safeRectPx.debug.innerWidth,
        innerHeight: safeRectPx.debug.innerHeight,
        scale: 1,
        marginMm: {
          left: Number(config.margin.left) || 0,
          right: Number(config.margin.right) || 0,
          top: Number(config.margin.top) || 0,
          bottom: Number(config.margin.bottom) || 0,
        },
      };
      console.log("[SafeAreaDebug]", safeAreaDebug);
      console.log("[SafeAreaDebugJSON]", JSON.stringify(safeAreaDebug));

      const safeRect = new fabric.Rect({
        left: safeRectPx.x,
        top: safeRectPx.y,
        width: safeRectPx.width,
        height: safeRectPx.height,
        fill: "rgba(0,0,0,0)",
        stroke: "rgba(37,99,235,0.95)",
        strokeWidth: 1,
        strokeDashArray: [6, 6],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });
      (safeRect as any).isGuide = true;

      fc.add(safeRect);
      fc.bringObjectToFront(safeRect);
      marginGroupRef.current = safeRect;
      fc.renderAll();
    }, [config, showMargins, displayScale]);

    useEffect(() => {
      drawMarginsRef.current = drawMargins;
      drawMargins();
    }, [drawMargins]);

    // ── Drag-Drop Support for Gallery Items ────────────────────────────────
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
        container.style.opacity = "0.8";
        container.style.outline = "2px dashed #3b82f6";
        container.style.outlineOffset = "-2px";
      };

      const handleDragLeave = (e: DragEvent) => {
        if (e.target === container) {
          container.style.opacity = "1";
          container.style.outline = "none";
        }
      };

      const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        container.style.opacity = "1";
        container.style.outline = "none";

        const fc = fabricRef.current;
        if (!fc) return;

        try {
          const data = e.dataTransfer!.getData("application/json");
          const item = JSON.parse(data);

          const rect = fc.upperCanvasEl.getBoundingClientRect();
          const vpt = fc.viewportTransform ?? [1, 0, 0, 1, 0, 0];
          const scaleX = Math.max(0.0001, Number(vpt[0] || 1));
          const scaleY = Math.max(0.0001, Number(vpt[3] || 1));
          const x = (e.clientX - rect.left - Number(vpt[4] || 0)) / scaleX;
          const y = (e.clientY - rect.top - Number(vpt[5] || 0)) / scaleY;

          if (item.type === "dynamic-field" && item.fieldKey) {
            addDynamicFieldObject(fc, String(item.fieldKey), { x, y }, item.fieldType as string | undefined);
            fc.renderAll();
            return;
          }

          if (item.id && (item.type === "shape" || item.type === "icon")) {

            const uid = `layer-${++layerCounterRef.current}`;

            // Add shape at drop location
            if (item.type === "shape") {
              const methodMap: Record<string, () => void> = {
                "shape-rectangle": () => {
                  const r = new fabric.Rect({
                    left: x,
                    top: y,
                    width: 120,
                    height: 80,
                    fill: "rgba(99,102,241,0.15)",
                    stroke: "#6366f1",
                    strokeWidth: 1.5,
                    rx: 4,
                    ry: 4,
                    hasControls: false,
                  });
                  (r as any).__uid = uid;
                  (r as any).__layerName = "Rectangle";
                  fc.add(r);
                  fc.setActiveObject(r);
                },
                "shape-circle": () => {
                  const c = new fabric.Circle({
                    left: x,
                    top: y,
                    radius: 50,
                    fill: "rgba(34,197,94,0.15)",
                    stroke: "#22c55e",
                    strokeWidth: 1.5,
                    hasControls: false,
                  });
                  (c as any).__uid = uid;
                  (c as any).__layerName = "Circle";
                  fc.add(c);
                  fc.setActiveObject(c);
                },
                "shape-triangle": () => {
                  const t = new fabric.Triangle({
                    left: x,
                    top: y,
                    width: 100,
                    height: 100,
                    fill: "rgba(168,85,247,0.15)",
                    stroke: "#a855f7",
                    strokeWidth: 1.5,
                    hasControls: false,
                  });
                  (t as any).__uid = uid;
                  (t as any).__layerName = "Triangle";
                  fc.add(t);
                  fc.setActiveObject(t);
                },
                "shape-line": () => {
                  const l = new fabric.Line([x, y, x + 80, y], {
                    stroke: "#6b7280",
                    strokeWidth: 2,
                    hasControls: false,
                  });
                  (l as any).__uid = uid;
                  (l as any).__layerName = "Line";
                  fc.add(l);
                  fc.setActiveObject(l);
                },
              };
              const method = methodMap[item.id];
              if (method) method();
            } else if (item.type === "icon" && item.preview) {
              // Add icon as SVG
              (fabric as any).loadSVGFromString(item.preview).then((result: any) => {
                const objs = (result.objects ?? []).filter(Boolean);
                if (!objs.length) return;
                const element =
                  objs.length === 1
                    ? objs[0]
                    : new fabric.Group(objs, { left: 0, top: 0, ...result.options });
                (element as any).__uid = uid;
                (element as any).__layerName = item.label || "Icon";
                element.set({
                  left: x,
                  top: y,
                  hasControls: false,
                });
                element.setCoords();
                fc.add(element);
                fc.setActiveObject(element);
                fc.renderAll();
              });
            }
            fc.renderAll();
          }
        } catch {
          // Invalid data, ignore
        }
      };

      container.addEventListener("dragover", handleDragOver);
      container.addEventListener("dragleave", handleDragLeave);
      container.addEventListener("drop", handleDrop);

      return () => {
        container.removeEventListener("dragover", handleDragOver);
        container.removeEventListener("dragleave", handleDragLeave);
        container.removeEventListener("drop", handleDrop);
      };
    }, [addDynamicFieldObject]);

    // ── Imperative API ──────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      addText() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;

        // Default label text
        const label = "Double-click to edit";
        const fontSize = 16;
        const fontFamily = "Inter, sans-serif";

        // Measure the natural text width via an offscreen canvas so the Textbox
        // starts on a single line. The box is sized exactly to the text so no
        // wrapping occurs until the user manually narrows it (the auto-size guard
        // in onObjectScaling will prevent narrowing below this width in none mode).
        const measureCanvas = document.createElement("canvas");
        const mctx = measureCanvas.getContext("2d");
        let measured = 100;
        if (mctx) {
          mctx.font = `${fontSize}px ${fontFamily}`;
          measured = Math.ceil(mctx.measureText(label).width);
        }

        // Always place the textbox at the safe-area origin (margin boundary).
        // Using safeArea.x / safeArea.y directly is more explicit than deriving
        // from margin * ds and avoids any rounding divergence.
        const safeArea = getSafeAreaRectPx(configRef.current, ds);
        const padding = 12;
        // Cap at safe area width so the right edge never escapes the margin.
        const boxW = Math.max(80, Math.min(
          Math.floor(safeArea.width),          // hard ceiling = safe area width
          measured + padding,                  // preferred = text + padding
        ));

        const t = new fabric.Textbox(label, {
          left: safeArea.x,  // ← explicit safe-area origin, not margin * ds
          top:  safeArea.y,
          width: boxW,
          fontFamily,
          fontSize,
          fill: "#1f2937",
          textAlign: "left",
          // Default = Auto Size: no wrapping, font shrinks to fit.
          splitByGrapheme: false,
          backgroundColor: "transparent",
          backgroundPadding: 0,
          scaleX: 1,
          scaleY: 1,
          lockScalingX: false,
          lockScalingFlip: true,
          noScaleCache: true,
          selectable: true,
          evented: true,
        });
        (t as any).__uid = uid;
        (t as any).__layerName = "Text";
        // Default = "auto" (Auto Size): single line, font shrinks to fit width,
        // no wrapping. "Auto Size" button is highlighted in the Properties Panel.
        (t as any).__textMode = "auto";
        (t as any).__boxWidth  = boxW;
        // Inherit the last-used text style so users don't have to re-style every
        // new text element.  Only applied if the user has previously styled
        // something (lastUsedTextStyleRef._isSet is true).
        const lusT = lastUsedTextStyleRef.current;
        if (lusT._isSet) {
          t.set({
            fontFamily:  lusT.fontFamily  ?? t.fontFamily,
            fontSize:    lusT.fontSize    ?? t.fontSize,
            fill:        lusT.fill        ?? t.fill,
            fontWeight:  lusT.fontWeight  ?? t.fontWeight,
            fontStyle:   lusT.fontStyle   ?? t.fontStyle,
            stroke:      lusT.stroke      ?? "",
            strokeWidth: lusT.strokeWidth ?? 0,
            paintFirst:  lusT.paintFirst  ?? "fill",
            shadow:      lusT.shadow      ?? null,
            textAlign:   lusT.textAlign   ?? t.textAlign,
            underline:   lusT.underline   ?? false,
          } as any);
        }
        // Apply no-wrap patch + auto-fit font before first render.
        enableNoWrap(t);
        applyAutoFitFont(t, boxW);
        t.setCoords();
        fc.add(t);
        fc.setActiveObject(t);
        fc.renderAll();
      },

      // ── Add a Textbox in Word Wrap mode ──────────────────────────────────
      addWordWrapText(text?: string, fixedWidth?: number) {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top) * ds;
        const uid = `layer-${++layerCounterRef.current}`;

        // Default width = safe area width or explicit param
        const safeArea = getSafeAreaRectPx(configRef.current, ds);
        const wrapWidth = Math.max(80, fixedWidth ?? Math.round(safeArea.width * 0.7));

        const tb = new fabric.Textbox(text ?? "Type your text here", {
          left: sl,
          top: st,
          width: wrapWidth,
          fontSize: 24,
          fontFamily: "Inter, sans-serif",
          fill: "#1f2937",
          textAlign: "left",
          // splitByGrapheme: false → word-boundary wrapping (splits at spaces).
          // true would cause character-level wrapping — never wanted in wrap mode.
          splitByGrapheme: false,
          scaleX: 1,
          scaleY: 1,
          hasControls: false,
          backgroundColor: "transparent",
          backgroundPadding: 0,
        });
        (tb as any).__uid = uid;
        (tb as any).__layerName = "Word Wrap Text";
        (tb as any).__textMode = "wrap";
        (tb as any).__boxWidth = wrapWidth;
        // Patch word-boundary wrap: breaks at spaces, falls back to
        // character-split only for words wider than the container.
        patchWordBoundaryWrap(tb);
        // Force Fabric to compute initial wrapped lines before first render
        (tb as any).initDimensions?.();
        tb.setCoords();
        fc.add(tb);
        fc.setActiveObject(tb);
        fc.renderAll();
      },

      addRect() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        const r = new fabric.Rect({
          left: sl,
          top: st,
          width: 120,
          height: 80,
          fill: "rgba(99,102,241,0.15)",
          stroke: "#6366f1",
          strokeWidth: 1.5,
          rx: 4,
          ry: 4,
          hasControls: false,
        });
        (r as any).__uid = uid;
        (r as any).__layerName = "Rectangle";
        fc.add(r);
        fc.setActiveObject(r);
        fc.renderAll();
      },

      addCircle() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        const c = new fabric.Circle({
          left: sl,
          top: st,
          radius: 50,
          fill: "rgba(34,197,94,0.15)",
          stroke: "#22c55e",
          strokeWidth: 1.5,
          hasControls: false,
        });
        (c as any).__uid = uid;
        (c as any).__layerName = "Circle";
        fc.add(c);
        fc.setActiveObject(c);
        fc.renderAll();
      },

      addLine() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        const l = new fabric.Line([sl, st + 20, sl + 80, st + 20], {
          stroke: "#6b7280",
          strokeWidth: 2,
          hasControls: false,
        });
        (l as any).__uid = uid;
        (l as any).__layerName = "Line";
        fc.add(l);
        fc.setActiveObject(l);
        fc.renderAll();
      },

      addTriangle() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        const t = new fabric.Triangle({
          left: sl,
          top: st,
          width: 100,
          height: 100,
          fill: "rgba(168,85,247,0.15)",
          stroke: "#a855f7",
          strokeWidth: 1.5,
          hasControls: false,
        });
        (t as any).__uid = uid;
        (t as any).__layerName = "Triangle";
        fc.add(t);
        fc.setActiveObject(t);
        fc.renderAll();
      },

      addPolygon(sides: number = 5) {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        
        // Create polygon points (regular n-sided polygon)
        const points: Array<{ x: number; y: number }> = [];
        const radius = 50;
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
          points.push({
            x: radius + radius * Math.cos(angle),
            y: radius + radius * Math.sin(angle),
          });
        }

        const p = new fabric.Polygon(points, {
          left: sl,
          top: st,
          fill: "rgba(59,130,246,0.15)",
          stroke: "#3b82f6",
          strokeWidth: 1.5,
          hasControls: false,
        });
        (p as any).__uid = uid;
        (p as any).__layerName = `Polygon (${sides}-sided)`;
        fc.add(p);
        fc.setActiveObject(p);
        fc.renderAll();
      },

      addStar(points: number = 5) {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        
        // Create star points
        const starPoints: Array<{ x: number; y: number }> = [];
        const outerRadius = 60;
        const innerRadius = 25;
        for (let i = 0; i < points * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
          starPoints.push({
            x: outerRadius + radius * Math.cos(angle),
            y: outerRadius + radius * Math.sin(angle),
          });
        }

        const s = new fabric.Polygon(starPoints, {
          left: sl,
          top: st,
          fill: "rgba(251,146,60,0.15)",
          stroke: "#fb923c",
          strokeWidth: 1.5,
          hasControls: false,
        });
        (s as any).__uid = uid;
        (s as any).__layerName = "Star";
        fc.add(s);
        fc.setActiveObject(s);
        fc.renderAll();
      },

      addHexagon() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        
        // 6-sided polygon (hexagon)
        const hexPoints: Array<{ x: number; y: number }> = [];
        const radius = 50;
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          hexPoints.push({
            x: radius + radius * Math.cos(angle),
            y: radius + radius * Math.sin(angle),
          });
        }

        const h = new fabric.Polygon(hexPoints, {
          left: sl,
          top: st,
          fill: "rgba(236,72,153,0.15)",
          stroke: "#ec4899",
          strokeWidth: 1.5,
          hasControls: false,
        });
        (h as any).__uid = uid;
        (h as any).__layerName = "Hexagon";
        fc.add(h);
        fc.setActiveObject(h);
        fc.renderAll();
      },

      addRoundedRect() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const uid = `layer-${++layerCounterRef.current}`;
        const rr = new fabric.Rect({
          left: sl,
          top: st,
          width: 140,
          height: 90,
          fill: "rgba(14,165,233,0.15)",
          stroke: "#0ea5e9",
          strokeWidth: 1.5,
          rx: 20,
          ry: 20,
          hasControls: false,
        });
        (rr as any).__uid = uid;
        (rr as any).__layerName = "Rounded Rectangle";
        fc.add(rr);
        fc.setActiveObject(rr);
        fc.renderAll();
      },

      addShapeFromGallery(shapeId: string) {
        // Route to appropriate shape method based on gallery item ID
        const methodMap: Record<string, () => void> = {
          "shape-rectangle": () => this.addRect(),
          "shape-circle": () => this.addCircle(),
          "shape-triangle": () => this.addTriangle(),
          "shape-line": () => this.addLine(),
          "shape-polygon": () => this.addPolygon(),
          "shape-star": () => this.addStar(),
          "shape-hexagon": () => this.addHexagon(),
          "shape-rounded-rect": () => this.addRoundedRect(),
        };

        const method = methodMap[shapeId];
        if (method) {
          method();
        }
      },

      addQRCode(text: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        const uid = `layer-${++layerCounterRef.current}`;
        QRCode.toDataURL(text || "https://example.com", { margin: 1, width: 200 })
          .then((url) => {
            fabric.FabricImage.fromURL(url).then((img) => {
              const size = Math.min(fc.getWidth(), fc.getHeight()) * 0.25;
              img.scaleToWidth(size);
              img.scaleToHeight(size);
              const { margin: qrMargin } = configRef.current;
              const qrDs = displayScaleRef.current;
              (img as any).__uid = uid;
              (img as any).__layerName = "QR Code";
              img.set({ left: mmToPx(qrMargin.left) * qrDs, top: mmToPx(qrMargin.top) * qrDs, hasControls: false });
              fc.add(img);
              fc.setActiveObject(img);
              fc.renderAll();
            });
          })
          .catch(() => {});
      },

      addBarcode(text: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        const uid = `layer-${++layerCounterRef.current}`;
        const val = text || "1234567890";
        
        // Generate barcode on canvas
        const c = document.createElement("canvas");
        c.width = 200;
        c.height = 60;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, 200, 60);
        ctx.fillStyle = "#000";
        
        // Simple visual barcode: alternate bar widths based on char codes
        let x = 4;
        const chars = val.split("");
        const slotW = Math.floor(192 / Math.max(chars.length * 3, 1));
        chars.forEach((ch) => {
          const code = ch.charCodeAt(0);
          [1, 0, 1].forEach((on) => {
            const w = slotW * (on ? ((code & 1) ? 2 : 1) : 1);
            if (on) ctx.fillRect(x, 4, w, 44);
            x += w + 1;
          });
        });
        
        // Label
        ctx.font = "9px monospace";
        ctx.fillText(val.slice(0, 28), 4, 58);
        const dataUrl = c.toDataURL("image/png");
        
        fabric.FabricImage.fromURL(dataUrl).then((img) => {
          const size = Math.min(fc.getWidth(), fc.getHeight()) * 0.2;
          img.scaleToWidth(size);
          const { margin: bMargin } = configRef.current;
          const bDs = displayScaleRef.current;
          (img as any).__uid = uid;
          (img as any).__layerName = "Barcode";
          img.set({ left: mmToPx(bMargin.left) * bDs, top: mmToPx(bMargin.top) * bDs, hasControls: false });
          fc.add(img);
          fc.setActiveObject(img);
          fc.renderAll();
        }).catch(() => {});
      },

      addDynamicField(fieldKey: string, fieldType?: string, placement?: { x: number; y: number }) {
        const fc = fabricRef.current;
        if (!fc) return;
        addDynamicFieldObject(fc, fieldKey, placement, fieldType);
      },

      addImage(dataUrl: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        const uid = `layer-${++layerCounterRef.current}`;
        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" }).then(
          (img) => {
            // Scale down if larger than canvas
            const maxW = fc.getWidth() * 0.6;
            const maxH = fc.getHeight() * 0.6;
            if (img.width! > maxW || img.height! > maxH) {
              const scl = Math.min(maxW / img.width!, maxH / img.height!);
              img.scaleX = scl;
              img.scaleY = scl;
            }
            const { margin: imgMargin } = configRef.current;
            const imgDs = displayScaleRef.current;
            (img as any).__uid = uid;
            (img as any).__layerName = "Image";
            img.set({ left: mmToPx(imgMargin.left) * imgDs, top: mmToPx(imgMargin.top) * imgDs, maskShape: "none", maskRadius: 24, _originalSrc: dataUrl, hasControls: true, hasBorders: true } as any);
            fc.add(img);
            fc.setActiveObject(img);
            fc.renderAll();
          }
        );
      },

      deleteSelected() {
        const fc = fabricRef.current;
        if (!fc) return;
        const objs = fc.getActiveObjects();
        if (objs.length === 0) return;
        objs.forEach((o) => fc.remove(o));
        fc.discardActiveObject();
        fc.renderAll();
      },

      duplicate() {
        const fc = fabricRef.current;
        if (!fc) return;
        const active = fc.getActiveObject();
        if (!active) return;
        active.clone().then((cloned: fabric.FabricObject) => {
          cloned.set({ left: (cloned.left ?? 0) + 16, top: (cloned.top ?? 0) + 16 });
          fc.add(cloned);
          fc.setActiveObject(cloned);
          fc.renderAll();
        });
      },

      undo() {
        performUndo();
      },

      redo() {
        performRedo();
      },

      getCanvas() {
        return fabricRef.current;
      },

      loadFromJSON(json: object) {
        const fc = fabricRef.current;
        if (!fc) return;
        ignoreSaveRef.current = true;
        fc.loadFromJSON(JSON.stringify(json)).then(() => {
          // Remove stale helper overlays persisted by legacy versions.
          fc.getObjects()
            .filter((obj) => {
              const anyObj = obj as any;
              if (anyObj.isGuide || anyObj.excludeFromExport) return true;
              const isLegacyGuideLine =
                obj.type === "line" &&
                obj.selectable === false &&
                obj.evented === false &&
                Array.isArray((obj as any).strokeDashArray) &&
                ((obj as any).stroke ?? "").includes("59,130,246");
              return isLegacyGuideLine;
            })
            .forEach((obj) => fc.remove(obj));

          // Disable controls on all loaded objects
          fc.getObjects().forEach((obj) => {
            obj.set({ hasControls: false });
          });

          // If template has no explicit background, drop any stale background-image objects
          // and keep a clean white base canvas.
          const storedBg = (json as any)._bgString as string | undefined;
          if (!storedBg || storedBg === "none") {
            setCanvasBackgroundObject(fc, null);
            fc.getObjects()
              .filter((o) => (o as any).isBgImage)
              .forEach((o) => fc.remove(o));
            removeLegacyBackgroundArtifacts(fc);
            fc.backgroundColor = "#ffffff";
            bgStringRef.current = "#ffffff";
            fc.discardActiveObject();
            onSelectionChangeRef.current(null);
          }

          fc.renderAll();
          drawMargins();
          // Restore bgString and notify parent
          if (storedBg !== undefined) {
            bgStringRef.current = storedBg;
            onBgChangeRef.current?.(storedBg);
          } else {
            onBgChangeRef.current?.("none");
          }

          ignoreSaveRef.current = false;
          undoStackRef.current = [createHistorySnapshot(fc)];
          redoStackRef.current = [];
        });
      },

      toJSON() {
        const fc = fabricRef.current;
        if (!fc) return {};
        const json = fc.toObject([...SERIALIZABLE_PROPS]) as Record<string, unknown>;
        json.objects = (json.objects as fabric.FabricObject[]).filter(
          (o: { excludeFromExport?: boolean; isGuide?: boolean }) => !o.excludeFromExport && !o.isGuide
        );
        json._elements = extractElementMetadata(fc);
        json._bgString = bgStringRef.current;
        return json;
      },

      toPNG() {
        const fc = fabricRef.current;
        if (!fc) return "";
        const prevClipPath = (fc as any).clipPath;
        const prevBg = fc.backgroundColor;
        if (!prevBg) fc.backgroundColor = "#ffffff";
        (fc as any).clipPath = undefined;
        fc.renderAll();

        const multiplier = Math.max(2, Math.ceil(1 / displayScaleRef.current));
        let url = "";
        try {
          url = fc.toDataURL({
            format: "png",
            quality: 1,
            multiplier,
            left: 0,
            top: 0,
            width: fc.getWidth(),
            height: fc.getHeight(),
            filter: (obj: fabric.FabricObject) => {
              const anyObj = obj as any;
              return !anyObj.excludeFromExport && !anyObj.isGuide;
            },
          } as any);
        } catch {
          // Cross-origin taint or other canvas error — return empty so callers
          // fall back to the existing thumbnail rather than crashing.
          url = "";
        }

        (fc as any).clipPath = prevClipPath;
        if (!prevBg) fc.backgroundColor = prevBg;
        fc.renderAll();
        return url;
      },

      toJPG() {
        const fc = fabricRef.current;
        if (!fc) return "";
        const prevClipPath = (fc as any).clipPath;
        const prevBg = fc.backgroundColor;
        if (!prevBg) fc.backgroundColor = "#ffffff";
        (fc as any).clipPath = undefined;
        fc.renderAll();

        const multiplier = Math.max(2, Math.ceil(1 / displayScaleRef.current));
        const url = fc.toDataURL({
          format: "jpeg",
          quality: 0.95,
          multiplier,
          left: 0,
          top: 0,
          width: fc.getWidth(),
          height: fc.getHeight(),
          filter: (obj: fabric.FabricObject) => {
            const anyObj = obj as any;
            return !anyObj.excludeFromExport && !anyObj.isGuide;
          },
        } as any);

        (fc as any).clipPath = prevClipPath;
        if (!prevBg) fc.backgroundColor = prevBg;
        fc.renderAll();
        return url;
      },

      setBackgroundColor(colorOrGradient: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = colorOrGradient;
        // Increment token so any in-flight async render is discarded
        const token = ++bgTokenRef.current;
        // Remove ALL existing background image objects
        fc.getObjects()
          .filter((o) => (o as any).isBgImage)
          .forEach((o) => fc.remove(o));
        // Handle CSS gradient strings by drawing onto an off-screen canvas
        if (colorOrGradient.startsWith("linear-gradient") || colorOrGradient.startsWith("radial-gradient")) {
          const splitTopLevelComma = (input: string): string[] => {
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
          };

          const parseGradientCss = (input: string): {
            kind: "linear" | "radial";
            angle: number;
            stops: Array<{ color: string; offset: number }>;
          } | null => {
            const raw = input.trim();
            const linear = raw.match(/^linear-gradient\((.*)\)$/i);
            const radial = raw.match(/^radial-gradient\((.*)\)$/i);
            if (!linear && !radial) return null;

            const kind: "linear" | "radial" = linear ? "linear" : "radial";
            const inner = (linear?.[1] ?? radial?.[1] ?? "").trim();
            const args = splitTopLevelComma(inner);
            if (args.length < 2) return null;

            let angle = 90;
            let stopArgs = args;
            if (kind === "linear") {
              if (/deg$/i.test(args[0])) {
                const parsed = Number.parseFloat(args[0]);
                angle = Number.isFinite(parsed) ? parsed : 90;
                stopArgs = args.slice(1);
              }
            } else if (/\bat\b|circle|ellipse/i.test(args[0])) {
              stopArgs = args.slice(1);
            }
            if (stopArgs.length < 2) return null;

            const stops = stopArgs
              .map((part, idx) => {
                const m = part.match(/(.+?)\s+([-\d.]+)%$/);
                const color = (m ? m[1] : part).trim();
                const offset = m
                  ? Number.parseFloat(m[2]) / 100
                  : idx / Math.max(stopArgs.length - 1, 1);
                return {
                  color,
                  offset: Math.max(0, Math.min(1, Number.isFinite(offset) ? offset : 0)),
                };
              })
              .sort((a, b) => a.offset - b.offset);

            return { kind, angle, stops };
          };

          const offscreen = document.createElement("canvas");
          offscreen.width = fc.getWidth();
          offscreen.height = fc.getHeight();
          const ctx = offscreen.getContext("2d")!;
          const parsed = parseGradientCss(colorOrGradient);
          if (parsed) {
            const w = offscreen.width;
            const h = offscreen.height;

            if (parsed.kind === "linear") {
              const rad = (parsed.angle * Math.PI) / 180;
              const x1 = w / 2 - (Math.cos(rad) * w) / 2;
              const y1 = h / 2 - (Math.sin(rad) * h) / 2;
              const x2 = w / 2 + (Math.cos(rad) * w) / 2;
              const y2 = h / 2 + (Math.sin(rad) * h) / 2;
              const grad = ctx.createLinearGradient(x1, y1, x2, y2);
              parsed.stops.forEach((stop) => grad.addColorStop(stop.offset, stop.color));
              ctx.fillStyle = grad;
            } else {
              const cx = w / 2;
              const cy = h / 2;
              const r = Math.max(w, h) / 2;
              const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
              parsed.stops.forEach((stop) => grad.addColorStop(stop.offset, stop.color));
              ctx.fillStyle = grad;
            }
          } else {
            ctx.fillStyle = "#ffffff";
          }
          ctx.fillRect(0, 0, offscreen.width, offscreen.height);
          fc.backgroundColor = "#ffffff";
          fabric.FabricImage.fromURL(offscreen.toDataURL()).then((img) => {
            // Discard if a newer call has already started
            if (token !== bgTokenRef.current) return;
            // Remove any bg images that may have been added in the meantime
            fc.getObjects()
              .filter((o) => (o as any).isBgImage)
              .forEach((o) => fc.remove(o));
            const lW = Math.round(mmToPx(configRef.current.canvas.width));
            const lH = Math.round(mmToPx(configRef.current.canvas.height));
            placeBackgroundObject(img, lW, lH, "cover", 0, 0);
            img.set({ selectable: false, evented: false, excludeFromExport: false } as any);
            setCanvasBackgroundObject(fc, img);
            if (marginGroupRef.current) fc.bringObjectToFront(marginGroupRef.current);
            fc.renderAll();
            pushUndoSnapshot(true);
          });
        } else {
          setCanvasBackgroundObject(fc, null);
          fc.backgroundColor = colorOrGradient;
          fc.renderAll();
          pushUndoSnapshot(true);
        }
      },

      setBackgroundImage(dataUrl: string, fitMode: "cover" | "contain" = "contain") {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "image";
        bgFitModeRef.current = fitMode;
        bgOffsetRef.current = { x: 0, y: 0 }; // Reset offset
        setCanvasBackgroundObject(fc, null);
        fc.getObjects()
          .filter((o) => (o as any).isBgImage)
          .forEach((o) => fc.remove(o));
        bgSVGRef.current = null; // Clear SVG background
        fc.backgroundColor = "#ffffff";
        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" }).then((img) => {
          const lW = Math.round(mmToPx(configRef.current.canvas.width));
          const lH = Math.round(mmToPx(configRef.current.canvas.height));
          placeBackgroundObject(img, lW, lH, fitMode, 0, 0);
          img.set({
            originX: "center",
            originY: "center",
            selectable: false,
            evented: false,
          } as any);
          setCanvasBackgroundObject(fc, img);
          if (marginGroupRef.current) fc.bringObjectToFront(marginGroupRef.current);
          fc.renderAll();
          pushUndoSnapshot(true);
        });
      },

      setBackgroundSVG(svgString: string, fitMode: "cover" | "contain" = "contain") {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "svg";
        bgFitModeRef.current = fitMode;
        bgOffsetRef.current = { x: 0, y: 0 }; // Reset offset
        
        setCanvasBackgroundObject(fc, null);
        // Remove existing background (image or SVG)
        fc.getObjects()
          .filter((o) => (o as any).isBgImage)
          .forEach((o) => fc.remove(o));
        bgSVGRef.current = null;
        
        fc.backgroundColor = "#ffffff";
        
        // Load SVG and apply appropriate scaling
        (fabric as any).loadSVGFromString(svgString)
          .then((result: any) => {
            const objs: fabric.FabricObject[] = (result.objects ?? []).filter(Boolean);
            if (!objs.length) return;
            
            const svgElement: fabric.FabricObject =
              objs.length === 1
                ? objs[0]
                : new fabric.Group(objs, { left: 0, top: 0, ...result.options });
            
            svgElement.set({
              originX: "center",
              originY: "center",
              selectable: false,
              evented: false,
            } as any);
            const lW = Math.round(mmToPx(configRef.current.canvas.width));
            const lH = Math.round(mmToPx(configRef.current.canvas.height));
            placeBackgroundObject(svgElement, lW, lH, fitMode, 0, 0);
            
            svgElement.setCoords();
            setCanvasBackgroundObject(fc, svgElement);
            if (marginGroupRef.current) fc.bringObjectToFront(marginGroupRef.current);
            
            // Store reference for zoom rescaling
            bgSVGRef.current = svgElement;
            
            fc.renderAll();
            pushUndoSnapshot(true);
          })
          .catch(() => {/* SVG parse failed – silently ignore */});
      },

      setBackgroundFitMode(fitMode: "cover" | "contain") {
        const fc = fabricRef.current;
        if (!fc) return;
        bgFitModeRef.current = fitMode;
        bgOffsetRef.current = { x: 0, y: 0 }; // Reset offset when changing mode
        const bg = getCanvasBackgroundObject(fc);
        if (bg) {
          const lW = Math.round(mmToPx(configRef.current.canvas.width));
          const lH = Math.round(mmToPx(configRef.current.canvas.height));
          placeBackgroundObject(bg, lW, lH, fitMode, 0, 0);
          setCanvasBackgroundObject(fc, bg);
        }
        fc.renderAll();
        pushUndoSnapshot(true);
      },

      moveBackground(offsetX: number, offsetY: number) {
        bgOffsetRef.current.x += offsetX;
        bgOffsetRef.current.y += offsetY;
        const fc = fabricRef.current;
        if (!fc) return;
        const bg = getCanvasBackgroundObject(fc);
        if (!bg) return;
        
        const canvasW = Math.round(mmToPx(configRef.current.canvas.width));
        const canvasH = Math.round(mmToPx(configRef.current.canvas.height));
        const srcW = bg.width ?? 1;
        const srcH = bg.height ?? 1;
        const scale = bgFitModeRef.current === "cover"
          ? Math.max(canvasW / srcW, canvasH / srcH)
          : Math.min(canvasW / srcW, canvasH / srcH);
        const bgW = srcW * scale;
        const bgH = srcH * scale;
        
        // Clamp using abs so it works for both cover (bgW>canvasW) and contain (bgW<canvasW)
        const maxOffsetX = Math.abs(bgW - canvasW) / 2;
        const maxOffsetY = Math.abs(bgH - canvasH) / 2;
        bgOffsetRef.current.x = Math.max(-maxOffsetX, Math.min(maxOffsetX, bgOffsetRef.current.x));
        bgOffsetRef.current.y = Math.max(-maxOffsetY, Math.min(maxOffsetY, bgOffsetRef.current.y));
        
        bg.set({
          originX: "center",
          originY: "center",
          scaleX: scale,
          scaleY: scale,
          left: canvasW / 2 + bgOffsetRef.current.x,
          top: canvasH / 2 + bgOffsetRef.current.y,
        });
        setCanvasBackgroundObject(fc, bg);
        fc.renderAll();
        pushUndoSnapshot(true);
      },

      resetBackgroundPosition() {
        bgOffsetRef.current = { x: 0, y: 0 };
        const fc = fabricRef.current;
        if (!fc) return;
        const bg = getCanvasBackgroundObject(fc);
        if (!bg) return;
        
        const canvasW = Math.round(mmToPx(configRef.current.canvas.width));
        const canvasH = Math.round(mmToPx(configRef.current.canvas.height));
        placeBackgroundObject(bg, canvasW, canvasH, bgFitModeRef.current, 0, 0);
        setCanvasBackgroundObject(fc, bg);
        fc.renderAll();
        pushUndoSnapshot(true);
      },

      clearBackground() {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "none";
        ++bgTokenRef.current; // cancel any in-flight gradient renders
        bgSVGRef.current = null;
        setCanvasBackgroundObject(fc, null);
        fc.getObjects()
          .filter((o) => (o as any).isBgImage)
          .forEach((o) => fc.remove(o));
        removeLegacyBackgroundArtifacts(fc);
        fc.backgroundColor = "#ffffff";
        fc.discardActiveObject();
        onSelectionChange(null);
        onBgChangeRef.current?.("none");
        fc.renderAll();
        pushUndoSnapshot(true);
      },

      bringForward() {
        const fc = fabricRef.current;
        const obj = fc?.getActiveObject();
        if (!fc || !obj) return;
        fc.bringObjectForward(obj);
        fc.renderAll();
      },

      sendBackward() {
        const fc = fabricRef.current;
        const obj = fc?.getActiveObject();
        if (!fc || !obj) return;
        fc.sendObjectBackwards(obj);
        fc.renderAll();
      },

      bringToFront() {
        const fc = fabricRef.current;
        const obj = fc?.getActiveObject();
        if (!fc || !obj) return;
        fc.bringObjectToFront(obj);
        fc.renderAll();
      },

      sendToBack() {
        const fc = fabricRef.current;
        const obj = fc?.getActiveObject();
        if (!fc || !obj) return;
        fc.sendObjectToBack(obj);
        if (marginGroupRef.current) fc.bringObjectToFront(marginGroupRef.current);
        fc.renderAll();
      },

      alignToPage(alignment: 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right') {
        const fc = fabricRef.current;
        const obj = fc?.getActiveObject();
        if (!fc || !obj) return;
        const safeRect = getSafeAreaRectPx(configRef.current, displayScaleRef.current);
        const safeLeft = safeRect.x;
        const safeTop = safeRect.y;
        const safeRight = safeRect.right;
        const safeBottom = safeRect.bottom;
        const safeW = safeRect.width;
        const safeH = safeRect.height;

        if (obj instanceof fabric.IText || obj instanceof fabric.Textbox) {
          // Recompute text dimensions before aligning to avoid stale bounds.
          (obj as any).initDimensions?.();
        }
        const oW = obj.getScaledWidth();
        const oH = obj.getScaledHeight();
        switch (alignment) {
          case 'top':
            obj.set({ top: safeTop });
            break;
          case 'middle':
            obj.set({ top: safeTop + (safeH - oH) / 2 });
            break;
          case 'bottom':
            obj.set({ top: safeBottom - oH });
            break;
          case 'left':
            obj.set({ left: safeLeft });
            break;
          case 'center':
            obj.set({ left: safeLeft + (safeW - oW) / 2 });
            break;
          case 'right':
            obj.set({ left: safeRight - oW });
            break;
        }
        obj.setCoords();
        constrainObjectToSafeArea(obj, true);
        fc.fire("object:modified", { target: obj });
        fc.renderAll();
      },

      getDisplayScale() {
        return displayScaleRef.current;
      },

      applyImageMask(shape: ImageMaskShape, radius = 24) {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active) return;

        const anyActive = active as any;

        // For image-variable Group placeholders: persist mask metadata so it is
        // transferred to the real FabricImage when the template is rendered.
        if (active.type === "group" && anyActive.__fieldKind === "image") {
          anyActive.maskShape = shape;
          anyActive.maskRadius = radius;
          anyActive.__maskOptions = {
            ...(anyActive.__maskOptions ?? {}),
            cornerRadius: shape === "rounded" ? radius : 0,
          };
          fc.fire("object:modified", { target: active });
          fc.requestRenderAll();
          return;
        }

        if (active.type !== "image") return;

        const image = active as fabric.FabricImage & {
          maskShape?: ImageMaskShape;
          maskRadius?: number;
        };
        const clipPath = createImageMaskClipPath(image, shape, radius, getImageMaskClipPadding(image));
        image.set({ clipPath });
        image.maskShape = shape;
        image.maskRadius = radius;
        image.set("dirty", true);
        image.setCoords();
        fc.fire("object:modified", { target: image });
        fc.requestRenderAll();
      },

      setImageBorderRadius(radius: number) {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active) return;

        const anyActive = active as any;

        // Group image-field placeholder: store radius for later rendering.
        if (active.type === "group" && anyActive.__fieldKind === "image") {
          const shape: ImageMaskShape = (anyActive.maskShape as ImageMaskShape) ?? "rounded";
          const normalizedShape: ImageMaskShape = shape === "none" ? "rounded" : shape;
          const safeRadius = Math.max(0, radius);
          anyActive.maskShape = normalizedShape;
          anyActive.maskRadius = safeRadius;
          anyActive.__maskOptions = {
            ...(anyActive.__maskOptions ?? {}),
            cornerRadius: safeRadius,
          };
          fc.fire("object:modified", { target: active });
          fc.requestRenderAll();
          return;
        }

        if (active.type !== "image") return;

        const image = active as fabric.FabricImage & {
          maskShape?: ImageMaskShape;
          maskRadius?: number;
        };
        const shape = image.maskShape ?? "rounded";
        const normalizedShape: ImageMaskShape = shape === "none" ? "rounded" : shape;
        const safeRadius = Math.max(0, radius);
        const clipPath = createImageMaskClipPath(image, normalizedShape, safeRadius, getImageMaskClipPadding(image));
        image.set({ clipPath });
        image.maskShape = normalizedShape;
        image.maskRadius = safeRadius;
        image.set("dirty", true);
        image.setCoords();
        fc.fire("object:modified", { target: image });
        fc.requestRenderAll();
      },

      autoFitText() {
        const fc = fabricRef.current;
        const obj = fc?.getActiveObject();
        if (!fc || !obj) return;
        if (!(obj instanceof fabric.IText)) return; // Textbox extends IText so this catches both
        const text = obj as fabric.IText;
        const anyText = text as any;
        const boxW = Math.max(40, Number(anyText.__boxWidth) || Number(text.getScaledWidth()) || 80);
        const boxH = Math.max(20, Number(anyText.__boxHeight) || Number(text.getScaledHeight()) || 20);

        anyText.__boxWidth = boxW;
        anyText.__boxHeight = boxH;

        if (text instanceof fabric.Textbox) {
          text.set({ width: boxW, scaleX: 1 });
        }

        applyTextFit(text, boxW, boxH);
        constrainObjectToSafeArea(text, true);
        fc.fire("object:modified", { target: text });
        fc.renderAll();
      },

      // ── SVG Upload ──────────────────────────────────────────────────────
      addSVG(svgString: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        const uid = `layer-${++layerCounterRef.current}`;
        // fabric.loadSVGFromString returns Promise<{objects, options}> in Fabric v6
        (fabric as any).loadSVGFromString(svgString)
          .then((result: any) => {
            const objs: fabric.FabricObject[] = (result.objects ?? []).filter(Boolean);
            if (!objs.length) return;
            const element: fabric.FabricObject =
              objs.length === 1
                ? objs[0]
                : new fabric.Group(objs, { left: 0, top: 0, ...result.options });

            const maxW = fc.getWidth() * 0.5;
            const maxH = fc.getHeight() * 0.5;
            const ew = element.getScaledWidth()  || 100;
            const eh = element.getScaledHeight() || 100;
            if (ew > maxW || eh > maxH) {
              const scl = Math.min(maxW / ew, maxH / eh);
              element.scaleX = (element.scaleX || 1) * scl;
              element.scaleY = (element.scaleY || 1) * scl;
            }
            const { margin } = configRef.current;
            const ds = displayScaleRef.current;
            (element as any).__uid = uid;
            (element as any).__layerName = "SVG";
            element.set({
              left: mmToPx(margin.left) * ds,
              top:  mmToPx(margin.top)  * ds,
              hasControls: false,
            });
            element.setCoords();
            fc.add(element);
            fc.setActiveObject(element);
            fc.renderAll();
          })
          .catch(() => {/* SVG parse failed – silently ignore */});
      },

      // ── PNG Mask (transparency-based masking) ───────────────────────────
      applyPNGMask(maskDataUrl: string) {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active || active.type !== "image") return;

        const image = active as fabric.FabricImage;

        // Always work from the un-masked original source.
        // getSrc(false) uses _originalElement — the image before any Fabric filters.
        // Fallback chain: stored original → getSrc(false) → element.src
        const originalSrc: string =
          (image as any)._originalSrc ||
          (typeof (image as any).getSrc === "function"
            ? (image as any).getSrc(false)
            : "") ||
          (image.getElement() as HTMLImageElement)?.src ||
          "";

        if (!originalSrc) return;

        const savedProps = {
          left:       image.left,
          top:        image.top,
          scaleX:     image.scaleX,
          scaleY:     image.scaleY,
          angle:      image.angle,
          opacity:    image.opacity,
          maskShape:  (image as any).maskShape,
          maskRadius: (image as any).maskRadius,
        };

        // Load BOTH images fresh via new Image() — no crossOrigin attribute.
        // Using Fabric's internal _element (which was loaded with crossOrigin:"anonymous")
        // can taint the offscreen canvas in Firefox/Safari, causing toDataURL() to throw
        // a silent SecurityError.  Loading fresh from the data URL avoids that entirely.
        const origImg = new Image();
        const maskImg = new Image();
        let origReady = false, maskReady = false;

        const compose = () => {
          if (!origReady || !maskReady) return;

          const w = origImg.naturalWidth  || (image.width  ?? 400);
          const h = origImg.naturalHeight || (image.height ?? 400);

          const off = document.createElement("canvas");
          off.width = w; off.height = h;
          const ctx = off.getContext("2d")!;

          // 1. Draw source photo at natural resolution
          ctx.drawImage(origImg, 0, 0, w, h);

          // 2. Clip to mask's opaque areas via destination-in compositing.
          //
          // KEY GEOMETRY: Use "contain" (fit) scaling — the FULL mask shape must be
          // visible within the photo bounds.  With "cover" scaling the mask is zoomed
          // in so its opaque CENTER fills the entire photo, producing zero visible
          // clipping.  With "contain" scaling the full brush stroke sits inside the
          // photo; any photo area that falls OUTSIDE the brush stroke becomes
          // transparent (destination-in with nothing drawn = alpha 0).
          ctx.globalCompositeOperation = "destination-in";
          const mNW = maskImg.naturalWidth  || w;
          const mNH = maskImg.naturalHeight || h;
          const containScale = Math.min(w / mNW, h / mNH);
          const scaledMW     = Math.round(mNW * containScale);
          const scaledMH     = Math.round(mNH * containScale);
          const maskOffX     = Math.round((w - scaledMW) / 2);
          const maskOffY     = Math.round((h - scaledMH) / 2);
          ctx.drawImage(maskImg, maskOffX, maskOffY, scaledMW, scaledMH);
          ctx.globalCompositeOperation = "source-over"; // always reset

          let resultUrl: string;
          try {
            resultUrl = off.toDataURL("image/png");
          } catch {
            // SecurityError: canvas tainted — should not happen with data URLs
            return;
          }

          fabric.FabricImage.fromURL(resultUrl).then((newImg) => {
            ignoreSaveRef.current = true;
            fc.remove(active);
            newImg.set({
              ...savedProps,
              _originalSrc: originalSrc,
              _pngMaskSrc:  maskDataUrl,
            } as any);
            fc.add(newImg);
            fc.setActiveObject(newImg);
            ignoreSaveRef.current = false;
            fc.fire("object:modified", { target: newImg });
            fc.requestRenderAll();
          });
        };

        origImg.onload = () => { origReady = true; compose(); };
        maskImg.onload = () => { maskReady = true; compose(); };
        origImg.src = originalSrc;
        maskImg.src = maskDataUrl;
      },

      removePNGMask() {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active || active.type !== "image") return;
        const image = active as fabric.FabricImage & { _originalSrc?: string; _pngMaskSrc?: string };
        const originalSrc = image._originalSrc;
        if (!originalSrc) {
          delete (image as any)._pngMaskSrc;
          return;
        }
        const savedProps = {
          left:      image.left,
          top:       image.top,
          scaleX:    image.scaleX,
          scaleY:    image.scaleY,
          angle:     image.angle,
          opacity:   image.opacity,
          maskShape: (image as any).maskShape,
          maskRadius:(image as any).maskRadius,
        };
        fabric.FabricImage.fromURL(originalSrc, { crossOrigin: "anonymous" }).then((newImg) => {
          ignoreSaveRef.current = true;
          fc.remove(active);
          newImg.set(savedProps as any);
          fc.add(newImg);
          fc.setActiveObject(newImg);
          ignoreSaveRef.current = false;
          fc.fire("object:modified", { target: newImg });
          fc.requestRenderAll();
        });
      },

      // ── Word Wrap (IText ↔ Textbox) ─────────────────────────────────────
      enableWordWrap(fixedWidth?: number) {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active) return;
        const anyActive = active as any;

        // When there is no previously stored box width (first time enabling wrap on
        // a fresh IText), do NOT use getScaledWidth() — that returns the full
        // rendered text width and would make the Textbox exactly as wide as the
        // unwrapped text, so nothing would ever wrap.  Use 200 as a sensible
        // default that forces visible wrapping.
        const boxW = Math.max(
          40,
          Number(fixedWidth)
          || Number(anyActive.__boxWidth)
          || 200
        );
        const boxH = Math.max(
          20,
          Number(anyActive.__boxHeight)
          || Number(active.getScaledHeight())
          || 20
        );

        if (active instanceof fabric.Textbox) {
          const tb = active as fabric.Textbox;
          tb.set({ width: boxW, scaleX: 1, splitByGrapheme: false });
          (tb as any).__boxWidth = boxW;
          (tb as any).__boxHeight = boxH;
          (tb as any).__textMode = "wrap";
          patchWordBoundaryWrap(tb);
          // Force Fabric to re-compute wrapped lines after property changes.
          (tb as any).initDimensions?.();
          tb.setCoords();
          applyTextboxControls(tb);
          fc.fire("object:modified", { target: active });
          fc.renderAll();
          return;
        }
        if (!(active instanceof fabric.IText)) return;
        const it = active as fabric.IText;
        const extraProps = {
          __uid: anyActive.__uid,
          __layerName: anyActive.__layerName,
          __fieldKey: anyActive.__fieldKey,
          __fieldKind: anyActive.__fieldKind,
          __isDynamicField: anyActive.__isDynamicField,
          variableKey: anyActive.variableKey,
          __boxWidth: boxW,
          __boxHeight: boxH,
          backgroundColor: anyActive.backgroundColor,
          backgroundPadding: anyActive.backgroundPadding,
        };
        const tb = new fabric.Textbox(it.text ?? "", {
          left:       it.left,
          top:        it.top,
          width:      boxW,
          fontSize:   it.fontSize,
          fontFamily: it.fontFamily,
          fontWeight: it.fontWeight as string,
          fontStyle:  it.fontStyle as any,
          fill:       it.fill,
          textAlign:  it.textAlign as any,
          angle:      it.angle,
          opacity:    it.opacity,
          underline:  it.underline,
          splitByGrapheme: false,
          scaleX: 1,
          scaleY: it.scaleY,
          ...extraProps,
        });
        (tb as any).__textMode = "wrap";
        patchWordBoundaryWrap(tb);
        // Re-compute wrapped lines in the new Textbox before rendering.
        (tb as any).initDimensions?.();
        ignoreSaveRef.current = true;
        fc.remove(active);
        fc.add(tb);
        fc.setActiveObject(tb);
        ignoreSaveRef.current = false;
        fc.fire("object:modified", { target: tb });
        fc.renderAll();
      },

      disableWordWrap() {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active) return;

        if (active instanceof fabric.Textbox) {
          // Switch Textbox to "auto" mode: single-line, dynamic font sizing.
          const tb = active as fabric.Textbox;
          const anyTb = tb as any;
          anyTb.__textMode = "auto";
          const boxW = Math.max(40, Number(anyTb.__boxWidth) || Number(tb.width) || 200);
          // Remove wrap patch — auto mode uses enableNoWrap instead.
          unpatchWordBoundaryWrap(tb);
          tb.set({ splitByGrapheme: false, scaleX: 1, scaleY: 1, width: boxW });
          applyAutoFitFont(tb, boxW);
          applyTextboxControls(tb);
          fc.fire("object:modified", { target: tb });
          fc.renderAll();
        } else if (active instanceof fabric.IText) {
          // Legacy IText: stamp mode and apply auto controls.
          (active as any).__textMode = "auto";
          applyITextAutoControls(active as fabric.IText);
          fc.fire("object:modified", { target: active });
          fc.renderAll();
        }
      },

      // ── Set text mode programmatically ──────────────────────────────────
      setTextMode(mode: "none" | "auto" | "wrap" | "auto_wrap") {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active) return;

        // Both "none" (Normal) and "auto" (Auto Size) use the same single-line
        // auto-fit behaviour. They only differ in which button is highlighted
        // in the Properties Panel.  We stamp the exact mode string so the UI
        // reflects the user's explicit choice.
        if (mode === "none" || mode === "auto") {
          const stampMode = mode; // preserve exact value for UI feedback
          if (active instanceof fabric.Textbox) {
            const tb = active as fabric.Textbox;
            const anyTb = tb as any;
            anyTb.__textMode = stampMode;
            const boxW = Math.max(40, Number(anyTb.__boxWidth) || Number(tb.width) || 200);
            anyTb.__boxWidth = boxW;
            if (stampMode === "auto") {
              // Auto Size: single-line, font shrinks; clip at container edge.
              // Clicking "Auto Size" explicitly resets the manual height flag so
              // the box height returns to content-driven sizing.
              anyTb.__boxHeight = 0;
              unpatchWordBoundaryWrap(tb);
              tb.set({ splitByGrapheme: false, scaleX: 1, scaleY: 1, width: boxW });
              applyAutoFitFont(tb, boxW);
            } else {
              // Normal (none): fixed font, word-boundary wrap. Remove no-wrap patch.
              disableNoWrap(tb);
              patchWordBoundaryWrap(tb);
              tb.set({ splitByGrapheme: false, scaleX: 1, scaleY: 1, width: boxW });
              (tb as any).initDimensions?.();
              tb.setCoords();
            }
            applyTextboxControls(tb);
            fc.fire("object:modified", { target: tb });
            fc.renderAll();
          } else if (active instanceof fabric.IText) {
            // Convert legacy IText → Textbox
            const it = active as fabric.IText;
            const anyIt = it as any;
            const boxW = Math.max(80, Number(anyIt.__boxWidth) || Math.round(it.getScaledWidth()) || 200);
            const tb = new fabric.Textbox(it.text ?? "", {
              left: it.left, top: it.top, width: boxW,
              fontSize: it.fontSize, fontFamily: it.fontFamily,
              fontWeight: it.fontWeight as string, fontStyle: it.fontStyle as any,
              fill: it.fill, textAlign: it.textAlign as any,
              angle: it.angle, opacity: it.opacity, underline: it.underline,
              splitByGrapheme: false,
              scaleX: 1, scaleY: 1,
              backgroundColor: anyIt.backgroundColor ?? "transparent",
              backgroundPadding: anyIt.backgroundPadding ?? 0,
            });
            (tb as any).__uid = anyIt.__uid;
            (tb as any).__layerName = anyIt.__layerName;
            (tb as any).__fieldKey = anyIt.__fieldKey;
            (tb as any).__fieldKind = anyIt.__fieldKind;
            (tb as any).__isDynamicField = anyIt.__isDynamicField;
            (tb as any).variableKey = anyIt.variableKey;
            (tb as any).__boxWidth = boxW;
            (tb as any).__boxHeight = anyIt.__boxHeight;
            (tb as any).__textMode = stampMode;
            if (stampMode === "auto") {
              unpatchWordBoundaryWrap(tb);
              applyAutoFitFont(tb, boxW);
            } else {
              disableNoWrap(tb);
              patchWordBoundaryWrap(tb);
              (tb as any).initDimensions?.();
              tb.setCoords();
            }
            ignoreSaveRef.current = true;
            fc.remove(active);
            fc.add(tb);
            fc.setActiveObject(tb);
            ignoreSaveRef.current = false;
            applyTextboxControls(tb);
            fc.fire("object:modified", { target: tb });
            fc.renderAll();
          }
          return;
        }

        // "wrap" or "auto_wrap" — both use Textbox
        const anyActive = active as any;
        const existingBoxW = Math.max(80, Number(anyActive.__boxWidth) || 200);

        if (active instanceof fabric.Textbox) {
          // Already a Textbox: update mode and re-apply controls.
          // Remove any auto-size no-wrap patch; apply word-boundary wrap patch.
          const tb = active as fabric.Textbox;
          disableNoWrap(tb);
          anyActive.__textMode = mode;
          anyActive.__boxWidth = Number(tb.width) || existingBoxW;
          tb.set({ width: anyActive.__boxWidth, scaleX: 1, splitByGrapheme: false });
          // Both "wrap" and "auto_wrap" use word-boundary wrap.
          // auto_wrap: font is fixed, height auto-adjusts to content.
          unpatchWordBoundaryWrap(tb); // reset first to avoid double-patching
          patchWordBoundaryWrap(tb);
          (tb as any).initDimensions?.();
          tb.setCoords();
          applyTextboxControls(tb);
          fc.fire("object:modified", { target: tb });
          fc.renderAll();
          return;
        }

        // IText → Textbox conversion
        if (!(active instanceof fabric.IText)) return;
        const it = active as fabric.IText;
        const tb = new fabric.Textbox(it.text ?? "", {
          left: it.left, top: it.top, width: existingBoxW,
          fontSize: it.fontSize, fontFamily: it.fontFamily,
          fontWeight: it.fontWeight as string, fontStyle: it.fontStyle as any,
          fill: it.fill, textAlign: it.textAlign as any,
          angle: it.angle, opacity: it.opacity, underline: it.underline,
          splitByGrapheme: false,
          scaleX: 1, scaleY: it.scaleY,
          __uid: anyActive.__uid, __layerName: anyActive.__layerName,
          __fieldKey: anyActive.__fieldKey, __fieldKind: anyActive.__fieldKind,
          __isDynamicField: anyActive.__isDynamicField, variableKey: anyActive.variableKey,
          __boxWidth: existingBoxW, __boxHeight: anyActive.__boxHeight,
          backgroundColor: anyActive.backgroundColor, backgroundPadding: anyActive.backgroundPadding,
          __textMode: mode,
        });
        // Both "wrap" and "auto_wrap" use word-boundary wrap.
        patchWordBoundaryWrap(tb);
        (tb as any).initDimensions?.();
        ignoreSaveRef.current = true;
        fc.remove(active);
        fc.add(tb);
        fc.setActiveObject(tb);
        ignoreSaveRef.current = false;
        fc.fire("object:modified", { target: tb });
        fc.renderAll();
      },

      // ── Auto-fit font size to Textbox bounds ────────────────────────────
      autoFitTextToBox() {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active) return;

        // If IText, convert to Textbox using current visual width
        let tb: fabric.Textbox;
        if (active instanceof fabric.IText && !(active instanceof fabric.Textbox)) {
          const it = active as fabric.IText;
          const anyIt = it as any;
          const boxW = Math.max(40, Number(anyIt.__boxWidth) || Number(it.getScaledWidth()) || 80);
          const boxH = Math.max(20, Number(anyIt.__boxHeight) || Number(it.getScaledHeight()) || 20);
          tb = new fabric.Textbox(it.text ?? "", {
            left:       it.left,
            top:        it.top,
            width:      boxW,
            fontSize:   it.fontSize,
            fontFamily: it.fontFamily,
            fontWeight: it.fontWeight as string,
            fontStyle:  it.fontStyle as any,
            fill:       it.fill,
            textAlign:  it.textAlign as any,
            angle:      it.angle,
            opacity:    it.opacity,
            underline:  it.underline,
            splitByGrapheme: true,
            __uid: anyIt.__uid,
            __layerName: anyIt.__layerName,
            __fieldKey: anyIt.__fieldKey,
            __fieldKind: anyIt.__fieldKind,
            __isDynamicField: anyIt.__isDynamicField,
            variableKey: anyIt.variableKey,
            __boxWidth: boxW,
            __boxHeight: boxH,
            __textMode: "auto_wrap",
          });
          ignoreSaveRef.current = true;
          fc.remove(active);
          fc.add(tb);
          fc.setActiveObject(tb);
          ignoreSaveRef.current = false;
        } else if (active instanceof fabric.Textbox) {
          tb = active as fabric.Textbox;
        } else {
          return;
        }

        const anyTb = tb as any;
        const targetW = Math.max(40, Number(anyTb.__boxWidth) || Number(tb.getScaledWidth()) || 80);
        const targetH = Math.max(20, Number(anyTb.__boxHeight) || Number(tb.getScaledHeight()) || 20);
        anyTb.__boxWidth = targetW;
        anyTb.__boxHeight = targetH;
        anyTb.__textMode = "auto_wrap";

        tb.set({ scaleX: 1, scaleY: 1, width: targetW, splitByGrapheme: true });
        applyTextboxControls(tb);
        applyTextFit(tb, targetW, targetH);
        fc.fire("object:modified", { target: tb });
        fc.renderAll();
      },

      applyMaskAndBorderToSelected(options: MaskBorderOptions = {}) {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active) return;

        const anyActive = active as any;
        if (!anyActive.__boxWidth || !anyActive.__boxHeight) {
          anyActive.__boxWidth = Math.max(1, Number(active.width || active.getScaledWidth() || 1));
          anyActive.__boxHeight = Math.max(1, Number(active.height || active.getScaledHeight() || 1));
        }

        applyMaskAndBorder(active, options);
        fc.fire("object:modified", { target: active });
        fc.renderAll();
      },

      async renderTemplateWithData(template: Record<string, any> | null, data: VariableRenderInput) {
        const fc = fabricRef.current;
        if (!fc) return "";

        const preview = await renderTemplateWithDataUtil(fc, template, data);

        // Ensure all text is clamped to its assigned dynamic box after replacement.
        fc.getObjects().forEach((obj) => {
          if (!(obj instanceof fabric.IText || obj instanceof fabric.Textbox)) return;
          const anyObj = obj as any;
          const boxW = Math.max(1, Number(anyObj.__boxWidth || obj.width || obj.getScaledWidth() || 1));
          const boxH = Math.max(1, Number(anyObj.__boxHeight || obj.height || obj.getScaledHeight() || 20));
          applyTextFit(obj, boxW, boxH);
        });

        // Ensure all images maintain aspect ratio and remain centered in their dynamic box.
        fc.getObjects().forEach((obj) => {
          if (!(obj instanceof fabric.FabricImage)) return;
          const anyObj = obj as any;
          const boxW = Math.max(1, Number(anyObj.__boxWidth || obj.width || obj.getScaledWidth() || 1));
          const boxH = Math.max(1, Number(anyObj.__boxHeight || obj.height || obj.getScaledHeight() || 1));
          applyImageFit(obj, boxW, boxH);
          // Re-apply the ImageMaskShape that was stored on the source Group placeholder
          // (or on an earlier version of this image) during design-mode editing.
          const maskShape = anyObj.maskShape as ImageMaskShape | undefined;
          if (maskShape && maskShape !== "none") {
            const maskRadius = Math.max(0, Number(anyObj.maskRadius ?? 24));
            const clipPath = createImageMaskClipPath(
              obj,
              maskShape,
              maskRadius,
              getImageMaskClipPadding(obj)
            );
            if (clipPath) obj.set({ clipPath });
          }
        });

        fc.renderAll();
        return preview;
      },

      // ── Layer Management ────────────────────────────────────────────────
      getLayers() {
        const fc = fabricRef.current;
        if (!fc) return [];
        
        return fc.getObjects()
          .filter((obj) => !(obj as any).excludeFromExport && !(obj as any).isBgImage)
          .map((obj, index) => ({
            id: (obj as any).__uid || String(index),
            name: (obj as any).__layerName || `Layer ${index + 1}`,
            locked: layerLockedRef.current.get((obj as any).__uid) || false,
          }))
          .reverse(); // Reverse to show top layer first
      },

      setLayerLocked(id: string, locked: boolean) {
        layerLockedRef.current.set(id, locked);
        const fc = fabricRef.current;
        if (!fc) return;
        
        // Find object with matching uid
        const obj = fc.getObjects().find((o) => (o as any).__uid === id);
        if (!obj) return;
        
        obj.set({
          selectable: !locked,
          evented: !locked,
        });
        fc.renderAll();
      },

      deleteLayer(id: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        
        const obj = fc.getObjects().find((o) => (o as any).__uid === id);
        if (!obj) return;
        
        ignoreSaveRef.current = true;
        fc.remove(obj);
        ignoreSaveRef.current = false;
        
        layerLockedRef.current.delete(id);
        fc.renderAll();
      },

      canUndo() {
        return undoStackRef.current.length > 1;
      },

      canRedo() {
        return redoStackRef.current.length > 0;
      },

      resetHistory() {
        const fc = fabricRef.current;
        if (!fc) return;
        const snapshot = createHistorySnapshot(fc);
        undoStackRef.current = [snapshot];
        redoStackRef.current = [];
      },

      constrainSelectedToSafeArea() {
        const fc = fabricRef.current;
        if (!fc) return;
        const active = fc.getActiveObject();
        if (!active) return;
        constrainObjectToSafeArea(active, true);
        fc.requestRenderAll();
      },

      getElementMetadata() {
        const fc = fabricRef.current;
        if (!fc) return [];
        return extractElementMetadata(fc);
      },

      // ── Variable image live preview ─────────────────────────────────────────
      async applyVariableImage(fieldKey: string, imageDataUrl: string | null) {
        const fc = fabricRef.current;
        if (!fc) return;

        const objects = fc.getObjects();

        if (!imageDataUrl) {
          // ── Clear: restore original placeholder Group ──────────────────────
          // Find the currently-applied FabricImage bound to this variable
          const bound = objects.find(
            (o) =>
              (o as any).variableKey === fieldKey &&
              (o as any).__fieldKind === "image" &&
              (o as any).__isVariableImageBound === true
          );

          const originalJson = variableImageOriginalsRef.current.get(fieldKey);
          if (originalJson && fc) {
            // Re-create the original placeholder Group from its cached JSON
            const restoredObjs = await fc.loadFromJSON({
              version: "6.0.0",
              objects: [originalJson],
            } as any).then(() => {
              // loadFromJSON replaces ALL objects, so we need a different approach:
              // enlivenObjects instead.
              return null;
            }).catch(() => null);
            void restoredObjs; // suppress unused warning

            // Use fabric.util.enlivenObjects to deserialize just the one object
            const enlivened = await new Promise<fabric.FabricObject[]>((resolve) => {
              (fabric.util as any).enlivenObjects(
                [originalJson],
                (objs: fabric.FabricObject[]) => resolve(objs),
                "fabric"
              );
            });

            if (enlivened.length > 0) {
              const restored = enlivened[0];
              // Copy position from the bound image if it exists (user may have moved it)
              if (bound) {
                restored.set({
                  left: bound.left,
                  top: bound.top,
                  angle: bound.angle,
                });
                fc.remove(bound);
              }
              (restored as any).__isVariableImageBound = false;
              fc.add(restored);
              fc.setActiveObject(restored);
              variableImageOriginalsRef.current.delete(fieldKey);
              fc.renderAll();
            }
          } else if (bound) {
            // No cached original; just remove the bound image (placeholder is lost)
            fc.remove(bound);
            fc.renderAll();
          }
          return;
        }

        // ── Apply: replace placeholder Group with a live FabricImage ──────────
        // Find the placeholder Group (or an already-bound image)
        const placeholder = objects.find(
          (o) =>
            (o as any).variableKey === fieldKey &&
            (o as any).__fieldKind === "image"
        );
        if (!placeholder) return;

        // Persist the original Group JSON before replacing it (only once)
        if (
          !variableImageOriginalsRef.current.has(fieldKey) &&
          placeholder instanceof fabric.Group
        ) {
          const serialized = (placeholder as any).toJSON([...SERIALIZABLE_PROPS, "selectable", "evented"]);
          variableImageOriginalsRef.current.set(fieldKey, serialized);
        }

        // Determine the box dimensions from metadata or current geometry
        const anyPh = placeholder as any;
        const boxW = Math.max(1, Number(anyPh.__boxWidth || placeholder.getScaledWidth() || 110));
        const boxH = Math.max(1, Number(anyPh.__boxHeight || placeholder.getScaledHeight() || 120));

        // Load image
        const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = "anonymous";
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Image load failed"));
          el.src = imageDataUrl;
        }).catch(() => null);

        if (!imgEl) return;

        const img = new fabric.FabricImage(imgEl, {
          left: placeholder.left ?? 0,
          top: placeholder.top ?? 0,
          angle: placeholder.angle ?? 0,
          opacity: placeholder.opacity ?? 1,
          originX: placeholder.originX,
          originY: placeholder.originY,
          selectable: true,
          evented: true,
          hasControls: true,
        } as any);

        // Copy all custom metadata
        (img as any).__uid            = anyPh.__uid;
        (img as any).__layerName      = anyPh.__layerName;
        (img as any).__fieldKey       = anyPh.__fieldKey ?? fieldKey;
        (img as any).__fieldKind      = "image";
        (img as any).__isDynamicField = true;
        (img as any).variableKey      = fieldKey;
        (img as any).__boxWidth       = boxW;
        (img as any).__boxHeight      = boxH;
        (img as any).__maskOptions    = anyPh.__maskOptions;
        (img as any).maskShape        = anyPh.maskShape;
        (img as any).maskRadius       = anyPh.maskRadius;
        (img as any).__isVariableImageBound = true;

        applyImageFit(img, boxW, boxH);

        // Re-apply mask shape if one was set on the placeholder
        const maskShape = anyPh.maskShape as ImageMaskShape | undefined;
        if (maskShape && maskShape !== "none") {
          const maskRadius = Math.max(0, Number(anyPh.maskRadius ?? 24));
          const clipPath = createImageMaskClipPath(img, maskShape, maskRadius, getImageMaskClipPadding(img));
          if (clipPath) img.set({ clipPath });
        }

        fc.remove(placeholder);
        fc.add(img);
        fc.setActiveObject(img);
        fc.renderAll();
      },
    }));

    return (
      <div
        ref={containerRef}
        style={{
          display: "block",
          width: `${viewportCanvasPxW}px`,
          height: `${viewportCanvasPxH}px`,
          boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        }}
      />
    );
  }
);

FabricCanvas.displayName = "FabricCanvas";
