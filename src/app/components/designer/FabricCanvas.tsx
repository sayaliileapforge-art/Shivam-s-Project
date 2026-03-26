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
  addDynamicField: (fieldKey: string, placement?: { x: number; y: number }) => void;
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
    const bgFitModeRef = useRef<"cover" | "contain">("cover");
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
    const isImageFieldKey = (key: string): boolean =>
      ["photo", "avatar", "image", "picture", "student_photo", "profile_image"].includes(key);
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
      const anyCanvas = fc as any;
      if (typeof anyCanvas.setBackgroundImage === "function") {
        anyCanvas.setBackgroundImage(obj, () => fc.requestRenderAll());
      }
      anyCanvas.backgroundImage = obj ?? undefined;
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
      placement?: { x: number; y: number }
    ) => {
      const fieldKey = normalizeFieldKey(rawFieldKey || "field");
      if (!fieldKey) return;
      const uid = `layer-${++layerCounterRef.current}`;
      const { margin } = configRef.current;
      const ds = displayScaleRef.current;
      const left = placement?.x ?? mmToPx(margin.left) * ds;
      const top = placement?.y ?? mmToPx(margin.top) * ds;
      const isImageField = isImageFieldKey(fieldKey);
      const isBarcodeField = isBarcodeFieldKey(fieldKey);
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

      if (fitText && (obj instanceof fabric.IText || obj instanceof fabric.Textbox)) {
        let fontSize = Number(obj.fontSize ?? 16);
        const minFontSize = 6;

        obj.set({ scaleX: 1, scaleY: 1 });
        obj.setCoords();

        let bounds = getBounds();
        while ((bounds.width > safeWidth || bounds.height > safeHeight) && fontSize > minFontSize) {
          fontSize -= 1;
          obj.set({ fontSize });
          obj.setCoords();
          bounds = getBounds();
        }
      }

      let bounds = getBounds();
      if (bounds.width > safeWidth || bounds.height > safeHeight) {
        const scaleRatio = Math.min(
          safeWidth / Math.max(bounds.width, 1),
          safeHeight / Math.max(bounds.height, 1),
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

      // Disable resize controls on all objects
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
              obj.set({
                centeredScaling: true,
                lockScalingY: true,
                lockSkewingX: true,
                lockSkewingY: true,
              });
              obj.setControlsVisibility({
                tl: false,
                tr: false,
                bl: false,
                br: false,
                mt: false,
                mb: false,
                ml: true,
                mr: true,
                mtr: true,
              });
            }
          });
        }
        onSelectionChangeRef.current(e.selected?.[0] ?? null);
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
              obj.set({
                centeredScaling: true,
                lockScalingY: true,
                lockSkewingX: true,
                lockSkewingY: true,
              });
              obj.setControlsVisibility({
                tl: false,
                tr: false,
                bl: false,
                br: false,
                mt: false,
                mb: false,
                ml: true,
                mr: true,
                mtr: true,
              });
            }
          });
        }
        onSelectionChangeRef.current(e.selected?.[0] ?? null);
      });
      fc.on("selection:cleared", () => onSelectionChangeRef.current(null));
      
      // Disable controls on newly added objects
      fc.on("object:added", (e) => {
        if (e.target) {
          const anyObj = e.target as any;
          const isLocked = anyObj.isGuide || anyObj.isBgImage || anyObj.excludeFromExport;
          e.target.set({ hasControls: !isLocked });

          if (!isLocked && e.target instanceof fabric.Textbox) {
            e.target.set({
              centeredScaling: true,
              lockScalingY: true,
              lockSkewingX: true,
              lockSkewingY: true,
            });
            e.target.setControlsVisibility({
              tl: false,
              tr: false,
              bl: false,
              br: false,
              mt: false,
              mb: false,
              ml: true,
              mr: true,
              mtr: true,
            });
          }

          constrainObjectToSafeArea(e.target, true);
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
          const center = obj.getCenterPoint();
          const anyObj = obj as any;
          const rawWidth = Number(obj.width || anyObj.__boxWidth || obj.getScaledWidth() || 80);
          const rawHeight = Number(anyObj.__boxHeight || obj.height || obj.getScaledHeight() || 20);

          const nextWidth = Math.max(40, rawWidth * Math.max(0.01, Number(obj.scaleX || 1)));
          const nextHeight = Math.max(20, rawHeight * Math.max(0.01, Number(obj.scaleY || 1)));

          obj.set({
            width: nextWidth,
            scaleX: 1,
            scaleY: 1,
          });

          obj.setPositionByOrigin(center, "center", "center");

          anyObj.__boxWidth = nextWidth;
          anyObj.__boxHeight = nextHeight;
          (obj as any).initDimensions?.();
          obj.setCoords();
        }

        constrainObjectToSafeArea(obj, false);
      };
      fc.on("object:moving",  clampToMargin);
      fc.on("object:scaling", onObjectScaling);
      fc.on("object:rotating", clampToMargin);
      fc.on("object:modified", clampToMargin);
      fc.on("text:changed", clampToMargin);

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
          fc.getWidth(),
          fc.getHeight(),
          bgFitModeRef.current,
          bgOffsetRef.current.x,
          bgOffsetRef.current.y
        );
      }
      
      // Rescale SVG background using cover or contain scaling
      if (bgSVGRef.current) {
        placeBackgroundObject(
          bgSVGRef.current,
          fc.getWidth(),
          fc.getHeight(),
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
            addDynamicFieldObject(fc, String(item.fieldKey), { x, y });
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
        const t = new fabric.IText("Double-click to edit", {
          left: sl,
          top: st,
          fontFamily: "Inter, sans-serif",
          fontSize: 16,
          fill: "#1f2937",
          hasControls: false,
          backgroundColor: "transparent",
          backgroundPadding: 0,
        });
        (t as any).__uid = uid;
        (t as any).__layerName = "Text";
        fc.add(t);
        fc.setActiveObject(t);
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

      addDynamicField(fieldKey: string, placement?: { x: number; y: number }) {
        const fc = fabricRef.current;
        if (!fc) return;
        addDynamicFieldObject(fc, fieldKey, placement);
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
        const url = fc.toDataURL({
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
            placeBackgroundObject(img, fc.getWidth(), fc.getHeight(), "cover", 0, 0);
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

      setBackgroundImage(dataUrl: string, fitMode: "cover" | "contain" = "cover") {
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
          placeBackgroundObject(img, fc.getWidth(), fc.getHeight(), fitMode, 0, 0);
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

      setBackgroundSVG(svgString: string, fitMode: "cover" | "contain" = "cover") {
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
            placeBackgroundObject(svgElement, fc.getWidth(), fc.getHeight(), fitMode, 0, 0);
            
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
          placeBackgroundObject(bg, fc.getWidth(), fc.getHeight(), fitMode, 0, 0);
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
        
        const canvasW = fc.getWidth();
        const canvasH = fc.getHeight();
        const srcW = bg.width ?? 1;
        const srcH = bg.height ?? 1;
        const scale = bgFitModeRef.current === "cover"
          ? Math.max(canvasW / srcW, canvasH / srcH)
          : Math.min(canvasW / srcW, canvasH / srcH);
        const bgW = srcW * scale;
        const bgH = srcH * scale;
        
        // Clamp offset to prevent excessive dragging
        const maxOffsetX = (bgW - canvasW) / 2;
        const maxOffsetY = (bgH - canvasH) / 2;
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
        
        const canvasW = fc.getWidth();
        const canvasH = fc.getHeight();
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
        if (!fc || !active || active.type !== "image") return;

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
        if (!fc || !active || active.type !== "image") return;

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
        const boxW = Math.max(
          40,
          Number(fixedWidth)
          || Number(anyActive.__boxWidth)
          || Number(active.getScaledWidth())
          || 80
        );
        const boxH = Math.max(
          20,
          Number(anyActive.__boxHeight)
          || Number(active.getScaledHeight())
          || 20
        );

        if (active instanceof fabric.Textbox) {
          const tb = active as fabric.Textbox;
          tb.set({ width: boxW, scaleX: 1 });
          (tb as any).__boxWidth = boxW;
          (tb as any).__boxHeight = boxH;
          tb.setCoords();
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
          scaleX: 1,
          scaleY: it.scaleY,
          ...extraProps,
        });
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
        if (!fc || !active || !(active instanceof fabric.Textbox)) return;
        const tb = active as fabric.Textbox;
        const anyTb = tb as any;
        const boxW = Math.max(40, Number(anyTb.__boxWidth) || Number(tb.getScaledWidth()) || 80);
        const boxH = Math.max(20, Number(anyTb.__boxHeight) || Number(tb.getScaledHeight()) || 20);
        const it = new fabric.IText(tb.text ?? "", {
          left:       tb.left,
          top:        tb.top,
          fontSize:   tb.fontSize,
          fontFamily: tb.fontFamily,
          fontWeight: tb.fontWeight as string,
          fontStyle:  tb.fontStyle as any,
          fill:       tb.fill,
          textAlign:  tb.textAlign as any,
          angle:      tb.angle,
          opacity:    tb.opacity,
          underline:  tb.underline,
          backgroundColor: (tb as any).backgroundColor ?? "transparent",
          backgroundPadding: (tb as any).backgroundPadding ?? 0,
          scaleX: tb.scaleX,
          scaleY: tb.scaleY,
          __uid: anyTb.__uid,
          __layerName: anyTb.__layerName,
          __fieldKey: anyTb.__fieldKey,
          __fieldKind: anyTb.__fieldKind,
          __isDynamicField: anyTb.__isDynamicField,
          variableKey: anyTb.variableKey,
          __boxWidth: boxW,
          __boxHeight: boxH,
        });
        ignoreSaveRef.current = true;
        fc.remove(active);
        fc.add(it);
        fc.setActiveObject(it);
        ignoreSaveRef.current = false;
        fc.fire("object:modified", { target: it });
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
            __uid: anyIt.__uid,
            __layerName: anyIt.__layerName,
            __fieldKey: anyIt.__fieldKey,
            __fieldKind: anyIt.__fieldKind,
            __isDynamicField: anyIt.__isDynamicField,
            variableKey: anyIt.variableKey,
            __boxWidth: boxW,
            __boxHeight: boxH,
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

        tb.set({ scaleX: 1, scaleY: 1, width: targetW });
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
