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
  addDynamicField: (fieldKey: string) => void;
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
    const marginGroupRef = useRef<fabric.Group | null>(null);
    const displayScaleRef = useRef(displayScale);
    displayScaleRef.current = displayScale;
    const configRef = useRef(config);
    configRef.current = config;
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
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);
    const ignoreSaveRef = useRef(false);
    // Track layer lock states: Map of object id → locked boolean
    const layerLockedRef = useRef<Map<string, boolean>>(new Map());
    // Layer counter for generating unique IDs
    const layerCounterRef = useRef(0);

    const canvasPxW = Math.round(mmToPx(config.canvas.width) * displayScale);
    const canvasPxH = Math.round(mmToPx(config.canvas.height) * displayScale);

    const createImageMaskClipPath = useCallback(
      (
        image: fabric.FabricImage,
        shape: ImageMaskShape,
        radius: number
      ): fabric.FabricObject | undefined => {
        const w = image.width ?? 0;
        const h = image.height ?? 0;
        if (!w || !h || shape === "none") return undefined;

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
          const maxRadius = Math.min(w, h) / 2;
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
      if (!obj || (obj as unknown as { excludeFromExport?: boolean }).excludeFromExport) return;

      const { margin, canvas } = configRef.current;
      const ds = displayScaleRef.current;
      const safeLeft = mmToPx(margin.left) * ds;
      const safeTop = mmToPx(margin.top) * ds;
      const safeRight = mmToPx(canvas.width) * ds - mmToPx(margin.right) * ds;
      const safeBottom = mmToPx(canvas.height) * ds - mmToPx(margin.bottom) * ds;
      const safeWidth = Math.max(1, safeRight - safeLeft);
      const safeHeight = Math.max(1, safeBottom - safeTop);

      if (fitText && (obj instanceof fabric.IText || obj instanceof fabric.Textbox)) {
        let fontSize = Number(obj.fontSize ?? 16);
        const minFontSize = 6;

        obj.set({ scaleX: 1, scaleY: 1 });
        obj.setCoords();

        while ((obj.getScaledWidth() > safeWidth || obj.getScaledHeight() > safeHeight) && fontSize > minFontSize) {
          fontSize -= 1;
          obj.set({ fontSize });
          obj.setCoords();
        }
      }

      const objLeft = obj.left ?? 0;
      const objTop = obj.top ?? 0;
      const objRight = objLeft + obj.getScaledWidth();
      const objBottom = objTop + obj.getScaledHeight();

      let newLeft = objLeft;
      let newTop = objTop;

      if (objLeft < safeLeft) newLeft = safeLeft;
      if (objTop < safeTop) newTop = safeTop;
      if (objRight > safeRight) newLeft = safeRight - obj.getScaledWidth();
      if (objBottom > safeBottom) newTop = safeBottom - obj.getScaledHeight();

      if (newLeft !== objLeft || newTop !== objTop) {
        obj.set({ left: newLeft, top: newTop });
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
        width: canvasPxW,
        height: canvasPxH,
        backgroundColor: "#ffffff",
        selection: true,
        preserveObjectStacking: true,
      });

      // Disable resize controls on all objects
      fc.on("selection:created", (e) => {
        if (e.selected) {
          e.selected.forEach((obj) => {
            obj.set({ hasControls: false, hasBorders: true, borderColor: "#999" });
          });
        }
        onSelectionChange(e.selected?.[0] ?? null);
      });
      fc.on("selection:updated", (e) => {
        if (e.selected) {
          e.selected.forEach((obj) => {
            obj.set({ hasControls: false, hasBorders: true, borderColor: "#999" });
          });
        }
        onSelectionChange(e.selected?.[0] ?? null);
      });
      fc.on("selection:cleared", () => onSelectionChange(null));
      
      // Disable controls on newly added objects
      fc.on("object:added", (e) => {
        if (e.target) {
          e.target.set({ hasControls: false });
        }
      });

      // Save history snapshot after each modification
      const saveSnapshot = () => {
        if (ignoreSaveRef.current) return;
        const json = JSON.stringify(fc.toObject(["excludeFromExport", "isBgImage", "maskShape", "maskRadius"]));
        // Truncate redo branch
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(json);
        // Keep at most 30 snapshots (optimized for performance)
        if (historyRef.current.length > 30) historyRef.current.shift();
        historyIndexRef.current = historyRef.current.length - 1;
      };
      fc.on("object:added", saveSnapshot);
      fc.on("object:modified", saveSnapshot);
      fc.on("object:removed", saveSnapshot);

      // ── Clamp objects inside the margin safe-area ──────────────────────
      const clampToMargin = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj) return;
        constrainObjectToSafeArea(obj, true);
      };
      fc.on("object:moving",  clampToMargin);
      fc.on("object:scaling", clampToMargin);
      fc.on("object:rotating", clampToMargin);
      fc.on("object:modified", clampToMargin);
      fc.on("text:changed", clampToMargin);

      // Save initial blank canvas snapshot for history
      const initialSnapshot = JSON.stringify(fc.toObject(["excludeFromExport", "isBgImage", "maskShape", "maskRadius"]));
      historyRef.current.push(initialSnapshot);
      historyIndexRef.current = 0;

      fabricRef.current = fc;

      return () => {
        // React only owns the wrapper <div ref={containerRef}>, not the canvas.
        // Fabric disposes its own DOM nodes; React removes the wrapper div cleanly.
        try { fc.dispose(); } catch { /* ignore disposal errors */ }
        fabricRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Resize when config dims change ──────────────────────────────────────
    useEffect(() => {
      const fc = fabricRef.current;
      if (!fc) return;
      fc.setDimensions({ width: canvasPxW, height: canvasPxH });
      
      // Rescale background image to match new canvas size
      const bgImage = fc.getObjects().find((o) => (o as any).isBgImage) as fabric.FabricImage | undefined;
      if (bgImage) {
        const canvasW = fc.getWidth();
        const canvasH = fc.getHeight();
        const imgW = bgImage.width ?? 100;
        const imgH = bgImage.height ?? 100;
        const imgAspect = imgW / imgH;
        const canvasAspect = canvasW / canvasH;
        
        if (bgFitModeRef.current === "cover") {
          // Cover mode: fill canvas, crop if necessary
          let scaleX = 1, scaleY = 1;
          if (imgAspect > canvasAspect) {
            // Image wider: scale by height
            scaleY = canvasH / imgH;
            scaleX = scaleY;
          } else {
            // Image taller: scale by width
            scaleX = canvasW / imgW;
            scaleY = scaleX;
          }
          const scaledW = imgW * scaleX;
          const scaledH = imgH * scaleY;
          bgImage.set({
            scaleX,
            scaleY,
            left: (canvasW - scaledW) / 2,
            top: (canvasH - scaledH) / 2,
          });
        } else {
          // Contain mode: fit within canvas, no cropping, apply offset
          let scaleX = 1, scaleY = 1;
          if (imgAspect > canvasAspect) {
            // Image wider: scale by width
            scaleX = canvasW / imgW;
            scaleY = scaleX;
          } else {
            // Image taller: scale by height
            scaleY = canvasH / imgH;
            scaleX = scaleY;
          }
          const scaledW = imgW * scaleX;
          const scaledH = imgH * scaleY;
          const baseX = (canvasW - scaledW) / 2;
          const baseY = (canvasH - scaledH) / 2;
          bgImage.set({
            scaleX,
            scaleY,
            left: baseX + bgOffsetRef.current.x,
            top: baseY + bgOffsetRef.current.y,
          });
        }
      }
      
      // Rescale SVG background using cover or contain scaling
      if (bgSVGRef.current) {
        const svg = bgSVGRef.current;
        const canvasW = fc.getWidth();
        const canvasH = fc.getHeight();
        const svgW = svg.width ?? 100;
        const svgH = svg.height ?? 100;
        const svgAspect = svgW / svgH;
        const canvasAspect = canvasW / canvasH;
        
        let scaleX = 1, scaleY = 1;
        if (bgFitModeRef.current === "cover") {
          if (svgAspect > canvasAspect) {
            scaleY = canvasH / svgH;
            scaleX = scaleY;
          } else {
            scaleX = canvasW / svgW;
            scaleY = scaleX;
          }
          const scaledW = svgW * scaleX;
          const scaledH = svgH * scaleY;
          svg.set({
            scaleX,
            scaleY,
            left: (canvasW - scaledW) / 2,
            top: (canvasH - scaledH) / 2,
          });
        } else {
          if (svgAspect > canvasAspect) {
            scaleX = canvasW / svgW;
            scaleY = scaleX;
          } else {
            scaleY = canvasH / svgH;
            scaleX = scaleY;
          }
          const scaledW = svgW * scaleX;
          const scaledH = svgH * scaleY;
          const baseX = (canvasW - scaledW) / 2;
          const baseY = (canvasH - scaledH) / 2;
          svg.set({
            scaleX,
            scaleY,
            left: baseX + bgOffsetRef.current.x,
            top: baseY + bgOffsetRef.current.y,
          });
        }
      }
      
      fc.renderAll();
    }, [canvasPxW, canvasPxH]);

    // ── Margin guides ───────────────────────────────────────────────────────
    const drawMargins = useCallback(() => {
      const fc = fabricRef.current;
      if (!fc) return;

      // Remove previous
      if (marginGroupRef.current) {
        fc.remove(marginGroupRef.current);
        marginGroupRef.current = null;
      }

      if (!showMargins) {
        fc.renderAll();
        return;
      }

      const { margin, canvas } = config;
      const w = Math.round(mmToPx(canvas.width) * displayScaleRef.current);
      const h = Math.round(mmToPx(canvas.height) * displayScaleRef.current);
      const t = mmToPx(margin.top) * displayScaleRef.current;
      const l = mmToPx(margin.left) * displayScaleRef.current;
      const r = mmToPx(margin.right) * displayScaleRef.current;
      const b = mmToPx(margin.bottom) * displayScaleRef.current;

      const lineOpts = {
        stroke: "rgba(59,130,246,0.65)",
        strokeWidth: 0.8,
        strokeDashArray: [4, 3],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      };

      const lines: fabric.Line[] = [
        new fabric.Line([l, 0, l, h], lineOpts),
        new fabric.Line([w - r, 0, w - r, h], lineOpts),
        new fabric.Line([0, t, w, t], lineOpts),
        new fabric.Line([0, h - b, w, h - b], lineOpts),
      ];

      // Safe-area rect (filled semi-transparent)
      const safeRect = new fabric.Rect({
        left: l,
        top: t,
        width: w - l - r,
        height: h - t - b,
        fill: "rgba(59,130,246,0.04)",
        stroke: "rgba(59,130,246,0.3)",
        strokeWidth: 0.6,
        strokeDashArray: [5, 4],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });

      const group = new fabric.Group([...lines, safeRect], {
        selectable: false,
        evented: false,
        excludeFromExport: true,
      });

      fc.add(group);
      fc.sendObjectToBack(group);
      marginGroupRef.current = group;
      fc.renderAll();
    // displayScale is included so zoom changes recreate this function and
    // trigger the drawMargins useEffect below, keeping guides pixel-accurate.
    }, [config, showMargins, displayScale]);

    useEffect(() => {
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

          if (item.id && (item.type === "shape" || item.type === "icon")) {
            // Get drop position relative to canvas
            const rect = (e.target as HTMLElement)?.getBoundingClientRect?.();
            const canvasLeft = rect?.left || 0;
            const canvasTop = rect?.top || 0;
            const x = (e.clientX || 0) - canvasLeft;
            const y = (e.clientY || 0) - canvasTop;

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
    }, []);

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

      addDynamicField(fieldKey: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        const uid = `layer-${++layerCounterRef.current}`;
        const label = `{{${fieldKey}}}`;
        const { margin: dfMargin } = configRef.current;
        const dfDs = displayScaleRef.current;
        const t = new fabric.IText(label, {
          left: mmToPx(dfMargin.left) * dfDs,
          top:  mmToPx(dfMargin.top)  * dfDs,
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          fill: "#7c3aed",
          fontStyle: "italic",
          hasControls: false,
          backgroundColor: "transparent",
          backgroundPadding: 0,
        });
        (t as any).__uid = uid;
        (t as any).__layerName = `Field: ${fieldKey}`;
        fc.add(t);
        fc.setActiveObject(t);
        fc.renderAll();
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
            img.set({ left: mmToPx(imgMargin.left) * imgDs, top: mmToPx(imgMargin.top) * imgDs, maskShape: "none", maskRadius: 24, _originalSrc: dataUrl, hasControls: false } as any);
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
        const fc = fabricRef.current;
        if (!fc || historyIndexRef.current <= 0) return;
        historyIndexRef.current -= 1;
        const snapshot = historyRef.current[historyIndexRef.current];
        ignoreSaveRef.current = true;
        fc.loadFromJSON(snapshot).then(() => {
          // Disable controls on all loaded objects
          fc.getObjects().forEach((obj) => {
            obj.set({ hasControls: false });
          });
          fc.renderAll();
          ignoreSaveRef.current = false;
          onSelectionChange(null);
        });
      },

      redo() {
        const fc = fabricRef.current;
        if (!fc || historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current += 1;
        const snapshot = historyRef.current[historyIndexRef.current];
        ignoreSaveRef.current = true;
        fc.loadFromJSON(snapshot).then(() => {
          // Disable controls on all loaded objects
          fc.getObjects().forEach((obj) => {
            obj.set({ hasControls: false });
          });
          fc.renderAll();
          ignoreSaveRef.current = false;
          onSelectionChange(null);
        });
      },

      getCanvas() {
        return fabricRef.current;
      },

      loadFromJSON(json: object) {
        const fc = fabricRef.current;
        if (!fc) return;
        fc.loadFromJSON(JSON.stringify(json)).then(() => {
          // Disable controls on all loaded objects
          fc.getObjects().forEach((obj) => {
            obj.set({ hasControls: false });
          });
          fc.renderAll();
          drawMargins();
          // Restore bgString and notify parent
          const storedBg = (json as any)._bgString as string | undefined;
          if (storedBg !== undefined) {
            bgStringRef.current = storedBg;
            onBgChangeRef.current?.(storedBg);
          }
        });
      },

      toJSON() {
        const fc = fabricRef.current;
        if (!fc) return {};
        const json = fc.toObject(["excludeFromExport", "isBgImage", "maskShape", "maskRadius"]) as Record<string, unknown>;
        json.objects = (json.objects as fabric.FabricObject[]).filter(
          (o: { excludeFromExport?: boolean }) => !o.excludeFromExport
        );
        json._bgString = bgStringRef.current;
        return json;
      },

      toPNG() {
        const fc = fabricRef.current;
        if (!fc) return "";
        marginGroupRef.current && fc.remove(marginGroupRef.current);
        // Export at full print resolution: multiply back up from display scale
        const multiplier = Math.max(2, Math.ceil(1 / displayScaleRef.current));
        const url = fc.toDataURL({ format: "png", multiplier });
        marginGroupRef.current && fc.add(marginGroupRef.current);
        fc.sendObjectToBack(marginGroupRef.current!);
        fc.renderAll();
        return url;
      },

      toJPG() {
        const fc = fabricRef.current;
        if (!fc) return "";
        marginGroupRef.current && fc.remove(marginGroupRef.current);
        const multiplier = Math.max(2, Math.ceil(1 / displayScaleRef.current));
        const url = fc.toDataURL({ format: "jpeg", quality: 0.95, multiplier });
        marginGroupRef.current && fc.add(marginGroupRef.current);
        fc.sendObjectToBack(marginGroupRef.current!);
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
          fc.backgroundColor = "transparent";
          fabric.FabricImage.fromURL(offscreen.toDataURL()).then((img) => {
            // Discard if a newer call has already started
            if (token !== bgTokenRef.current) return;
            // Remove any bg images that may have been added in the meantime
            fc.getObjects()
              .filter((o) => (o as any).isBgImage)
              .forEach((o) => fc.remove(o));
            img.set({ left: 0, top: 0, selectable: false, evented: false, isBgImage: true, excludeFromExport: false } as any);
            img.scaleToWidth(fc.getWidth());
            img.scaleToHeight(fc.getHeight());
            fc.add(img);
            fc.sendObjectToBack(img);
            // keep margin guides behind content but above bg
            if (marginGroupRef.current) fc.sendObjectToBack(marginGroupRef.current);
            fc.renderAll();
          });
        } else {
          fc.backgroundColor = colorOrGradient;
          fc.renderAll();
        }
      },

      setBackgroundImage(dataUrl: string, fitMode: "cover" | "contain" = "cover") {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "image";
        bgFitModeRef.current = fitMode;
        bgOffsetRef.current = { x: 0, y: 0 }; // Reset offset
        const existing = fc.getObjects().find((o) => (o as any).isBgImage);
        if (existing) fc.remove(existing);
        bgSVGRef.current = null; // Clear SVG background
        fc.backgroundColor = "transparent";
        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" }).then((img) => {
          const canvasW = fc.getWidth();
          const canvasH = fc.getHeight();
          const imgW = img.width ?? 100;
          const imgH = img.height ?? 100;
          const imgAspect = imgW / imgH;
          const canvasAspect = canvasW / canvasH;
          
          let scaleX = 1, scaleY = 1;
          if (fitMode === "cover") {
            // Cover mode: fill canvas, crop if necessary
            if (imgAspect > canvasAspect) {
              scaleY = canvasH / imgH;
              scaleX = scaleY;
            } else {
              scaleX = canvasW / imgW;
              scaleY = scaleX;
            }
            const scaledW = imgW * scaleX;
            const scaledH = imgH * scaleY;
            img.set({
              scaleX,
              scaleY,
              left: (canvasW - scaledW) / 2,
              top: (canvasH - scaledH) / 2,
              selectable: false,
              evented: false,
              isBgImage: true,
            } as any);
          } else {
            // Contain mode: fit within canvas, no cropping
            if (imgAspect > canvasAspect) {
              scaleX = canvasW / imgW;
              scaleY = scaleX;
            } else {
              scaleY = canvasH / imgH;
              scaleX = scaleY;
            }
            const scaledW = imgW * scaleX;
            const scaledH = imgH * scaleY;
            img.set({
              scaleX,
              scaleY,
              left: (canvasW - scaledW) / 2,
              top: (canvasH - scaledH) / 2,
              selectable: false,
              evented: false,
              isBgImage: true,
            } as any);
          }
          fc.add(img);
          fc.sendObjectToBack(img);
          if (marginGroupRef.current) fc.sendObjectToBack(marginGroupRef.current);
          fc.renderAll();
        });
      },

      setBackgroundSVG(svgString: string, fitMode: "cover" | "contain" = "cover") {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "svg";
        bgFitModeRef.current = fitMode;
        bgOffsetRef.current = { x: 0, y: 0 }; // Reset offset
        
        // Remove existing background (image or SVG)
        const existingBg = fc.getObjects().find((o) => (o as any).isBgImage);
        if (existingBg) fc.remove(existingBg);
        bgSVGRef.current = null;
        
        fc.backgroundColor = "transparent";
        
        // Load SVG and apply appropriate scaling
        (fabric as any).loadSVGFromString(svgString)
          .then((result: any) => {
            const objs: fabric.FabricObject[] = (result.objects ?? []).filter(Boolean);
            if (!objs.length) return;
            
            const svgElement: fabric.FabricObject =
              objs.length === 1
                ? objs[0]
                : new fabric.Group(objs, { left: 0, top: 0, ...result.options });
            
            // Get SVG dimensions
            const svgW = svgElement.width ?? 100;
            const svgH = svgElement.height ?? 100;
            const canvasW = fc.getWidth();
            const canvasH = fc.getHeight();
            const svgAspect = svgW / svgH;
            const canvasAspect = canvasW / canvasH;
            
            let scaleX = 1, scaleY = 1;
            if (fitMode === "cover") {
              // Cover mode: fill canvas, crop if necessary
              if (svgAspect > canvasAspect) {
                scaleY = canvasH / svgH;
                scaleX = scaleY;
              } else {
                scaleX = canvasW / svgW;
                scaleY = scaleX;
              }
            } else {
              // Contain mode: fit within canvas, no cropping
              if (svgAspect > canvasAspect) {
                scaleX = canvasW / svgW;
                scaleY = scaleX;
              } else {
                scaleY = canvasH / svgH;
                scaleX = scaleY;
              }
            }
            
            // Center the SVG
            const scaledW = svgW * scaleX;
            const scaledH = svgH * scaleY;
            const offsetX = (canvasW - scaledW) / 2;
            const offsetY = (canvasH - scaledH) / 2;
            
            svgElement.set({
              scaleX,
              scaleY,
              left: offsetX,
              top: offsetY,
              selectable: false,
              evented: false,
              isBgImage: true, // Mark as background for layer management
            } as any);
            
            svgElement.setCoords();
            fc.add(svgElement);
            fc.sendObjectToBack(svgElement);
            if (marginGroupRef.current) fc.sendObjectToBack(marginGroupRef.current);
            
            // Store reference for zoom rescaling
            bgSVGRef.current = svgElement;
            
            fc.renderAll();
          })
          .catch(() => {/* SVG parse failed – silently ignore */});
      },

      setBackgroundFitMode(fitMode: "cover" | "contain") {
        const fc = fabricRef.current;
        if (!fc) return;
        bgFitModeRef.current = fitMode;
        bgOffsetRef.current = { x: 0, y: 0 }; // Reset offset when changing mode
        // Trigger resize effect to reapply scaling
        const curW = fc.getWidth();
        const curH = fc.getHeight();
        fc.setDimensions({ width: curW, height: curH });
        fc.renderAll();
      },

      moveBackground(offsetX: number, offsetY: number) {
        bgOffsetRef.current.x += offsetX;
        bgOffsetRef.current.y += offsetY;
        const fc = fabricRef.current;
        if (!fc) return;
        const bg = fc.getObjects().find((o) => (o as any).isBgImage);
        if (!bg) return;
        
        const canvasW = fc.getWidth();
        const canvasH = fc.getHeight();
        const bgW = bg.getScaledWidth();
        const bgH = bg.getScaledHeight();
        const baseX = (canvasW - bgW) / 2;
        const baseY = (canvasH - bgH) / 2;
        
        // Clamp offset to prevent excessive dragging
        const maxOffsetX = (bgW - canvasW) / 2;
        const maxOffsetY = (bgH - canvasH) / 2;
        bgOffsetRef.current.x = Math.max(-maxOffsetX, Math.min(maxOffsetX, bgOffsetRef.current.x));
        bgOffsetRef.current.y = Math.max(-maxOffsetY, Math.min(maxOffsetY, bgOffsetRef.current.y));
        
        bg.set({
          left: baseX + bgOffsetRef.current.x,
          top: baseY + bgOffsetRef.current.y,
        });
        fc.renderAll();
      },

      resetBackgroundPosition() {
        bgOffsetRef.current = { x: 0, y: 0 };
        const fc = fabricRef.current;
        if (!fc) return;
        const bg = fc.getObjects().find((o) => (o as any).isBgImage);
        if (!bg) return;
        
        const canvasW = fc.getWidth();
        const canvasH = fc.getHeight();
        const bgW = bg.getScaledWidth();
        const bgH = bg.getScaledHeight();
        
        bg.set({
          left: (canvasW - bgW) / 2,
          top: (canvasH - bgH) / 2,
        });
        fc.renderAll();
      },

      clearBackground() {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "";
        ++bgTokenRef.current; // cancel any in-flight gradient renders
        bgSVGRef.current = null;
        fc.getObjects()
          .filter((o) => (o as any).isBgImage)
          .forEach((o) => fc.remove(o));
        fc.backgroundColor = "transparent";
        fc.renderAll();
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
        if (marginGroupRef.current) fc.sendObjectToBack(marginGroupRef.current);
        fc.renderAll();
      },

      alignToPage(alignment: 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right') {
        const fc = fabricRef.current;
        const obj = fc?.getActiveObject();
        if (!fc || !obj) return;
        const { margin, canvas } = configRef.current;
        const ds = displayScaleRef.current;
        const safeLeft = mmToPx(margin.left) * ds;
        const safeTop = mmToPx(margin.top) * ds;
        const safeRight = mmToPx(canvas.width) * ds - mmToPx(margin.right) * ds;
        const safeBottom = mmToPx(canvas.height) * ds - mmToPx(margin.bottom) * ds;
        const safeW = Math.max(1, safeRight - safeLeft);
        const safeH = Math.max(1, safeBottom - safeTop);

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
        const clipPath = createImageMaskClipPath(image, shape, radius);
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
        const clipPath = createImageMaskClipPath(image, normalizedShape, safeRadius);
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

        // Compute the safe area (inside margins) in canvas px at current display scale
        const { margin, canvas: canvasCfg } = configRef.current;
        const ds = displayScaleRef.current;
        const safeLeft   = mmToPx(margin.left)  * ds;
        const safeTop    = mmToPx(margin.top)   * ds;
        const maxW = mmToPx(canvasCfg.width  - margin.left - margin.right)  * ds;
        const maxH = mmToPx(canvasCfg.height - margin.top  - margin.bottom) * ds;

        // Reset any handle-scaling so fontSize is the sole size control
        text.set({ scaleX: 1, scaleY: 1 });

        // For Textbox, pin the width to the safe-area width before measuring
        const isBox = obj instanceof fabric.Textbox;
        if (isBox) {
          (obj as fabric.Textbox).set({ width: maxW });
        }

        // Force Fabric to re-measure after every fontSize change.
        // IMPORTANT: Textbox.initDimensions() can expand `width` via dynamicMinWidth
        // when a single word is wider than the box (large font).  We must re-check
        // *both* dimensions so those cases are correctly rejected.
        const refreshDims = () => {
          (text as any).initDimensions?.();
          text.setCoords();
        };

        // Binary-search: largest font where text fits inside the safe area.
        // CRITICAL: reset Textbox width to maxW at the START of every iteration.
        // Fabric's initDimensions() expands `width` via dynamicMinWidth but NEVER
        // auto-shrinks it.  Without a reset, the expanded value from a large-font
        // iteration poisons all subsequent smaller-font checks, driving lo → 6.
        let lo = 6, hi = 800;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          text.set({ fontSize: mid });
          if (isBox) (obj as fabric.Textbox).set({ width: maxW }); // reset BEFORE measuring
          refreshDims();
          if (text.width <= maxW && text.height <= maxH) lo = mid;
          else hi = mid;
        }

        // Apply the found size; always restore the correct Textbox width
        if (isBox) (obj as fabric.Textbox).set({ width: maxW });
        text.set({ fontSize: lo, left: safeLeft, top: safeTop });
        refreshDims();
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
        if (active instanceof fabric.Textbox) {
          // Already a Textbox; just update width if provided
          if (fixedWidth && fixedWidth > 0) {
            (active as fabric.Textbox).set({ width: fixedWidth });
            active.setCoords();
            fc.fire("object:modified", { target: active });
            fc.renderAll();
          }
          return;
        }
        if (!(active instanceof fabric.IText)) return;
        const it = active as fabric.IText;
        const tb = new fabric.Textbox(it.text ?? "", {
          left:       it.left,
          top:        it.top,
          width:      fixedWidth ?? Math.max(80, it.getScaledWidth()),
          fontSize:   it.fontSize,
          fontFamily: it.fontFamily,
          fontWeight: it.fontWeight as string,
          fontStyle:  it.fontStyle  as string,
          fill:       it.fill,
          textAlign:  it.textAlign  as string,
          angle:      it.angle,
          opacity:    it.opacity,
          underline:  it.underline,
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
        const it = new fabric.IText(tb.text ?? "", {
          left:       tb.left,
          top:        tb.top,
          fontSize:   tb.fontSize,
          fontFamily: tb.fontFamily,
          fontWeight: tb.fontWeight as string,
          fontStyle:  tb.fontStyle  as string,
          fill:       tb.fill,
          textAlign:  tb.textAlign  as string,
          angle:      tb.angle,
          opacity:    tb.opacity,
          underline:  tb.underline,
          backgroundColor: (tb as any).backgroundColor ?? "transparent",
          backgroundPadding: (tb as any).backgroundPadding ?? 0,
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
          const vw = Math.max(80, it.getScaledWidth());
          tb = new fabric.Textbox(it.text ?? "", {
            left:       it.left,
            top:        it.top,
            width:      vw,
            fontSize:   it.fontSize,
            fontFamily: it.fontFamily,
            fontWeight: it.fontWeight as string,
            fontStyle:  it.fontStyle  as string,
            fill:       it.fill,
            textAlign:  it.textAlign  as string,
            angle:      it.angle,
            opacity:    it.opacity,
            underline:  it.underline,
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

        // Capture the VISUAL width (before scale reset) — this is the "box" the user
        // has drawn.  Use the canvas safe-area height as the target height, because
        // Fabric Textbox height is auto-calculated from content (no fixed frame height).
        const targetW = Math.max(80, tb.getScaledWidth());
        const { margin, canvas: canvasCfg } = configRef.current;
        const ds = displayScaleRef.current;
        const targetH = mmToPx(canvasCfg.height - margin.top - margin.bottom) * ds;

        // Reset scale and fix width to the visual width
        tb.set({ scaleX: 1, scaleY: 1, width: targetW });

        const refreshDims = () => {
          (tb as any).initDimensions?.();
          tb.setCoords();
        };

        // Binary-search: largest font where text wraps within targetW and fits in targetH.
        // CRITICAL: reset width to targetW at the START of every iteration.
        // Fabric's initDimensions() expands `width` via dynamicMinWidth but NEVER
        // auto-shrinks it.  Without a reset, the expanded value from a large-font
        // iteration poisons all subsequent smaller-font checks, driving lo → 6.
        let lo = 6, hi = Math.min(400, Math.ceil(targetH));
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          tb.set({ fontSize: mid, width: targetW }); // reset width BEFORE measuring
          refreshDims();
          if (tb.width <= targetW && tb.height <= targetH) lo = mid;
          else hi = mid;
        }
        // Restore correct width after search
        tb.set({ fontSize: lo, width: targetW });
        refreshDims();
        fc.fire("object:modified", { target: tb });
        fc.renderAll();
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
        return historyIndexRef.current > 0;
      },

      canRedo() {
        return historyIndexRef.current < historyRef.current.length - 1;
      },

      resetHistory() {
        const fc = fabricRef.current;
        if (!fc) return;
        const snapshot = JSON.stringify(fc.toObject(["excludeFromExport", "isBgImage", "maskShape", "maskRadius"]));
        historyRef.current = [snapshot];
        historyIndexRef.current = 0;
      },

      constrainSelectedToSafeArea() {
        const fc = fabricRef.current;
        if (!fc) return;
        const active = fc.getActiveObject();
        if (!active) return;
        constrainObjectToSafeArea(active, true);
        fc.requestRenderAll();
      },
    }));

    return (
      <div
        ref={containerRef}
        style={{ display: "block", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}
      />
    );
  }
);

FabricCanvas.displayName = "FabricCanvas";
