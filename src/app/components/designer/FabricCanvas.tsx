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
import { CurvedText, type CurvedTextOpts } from "./CurvedTextObject";

// Re-export for consumers
export type { CurvedTextOpts };

// ─── Public handle ────────────────────────────────────────────────────────────

export interface FabricCanvasHandle {
  addText: () => void;
  addRect: () => void;
  addCircle: () => void;
  addLine: () => void;
  addImage: (dataUrl: string) => void;
  addQRCode: (text: string) => void;
  addDynamicField: (fieldKey: string) => void;
  /** Add a scalable SVG from an SVG string. */
  addSVG: (svgString: string) => void;
  /** Add a CurvedText arc-text object. */
  addCurvedText: (opts?: CurvedTextOpts) => void;
  /** Update properties on the selected CurvedText object. */
  updateCurvedText: (props: Partial<CurvedTextOpts>) => void;
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
  setBackgroundImage: (dataUrl: string) => void;
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
    // Undo/redo history stacks (serialized JSON snapshots)
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);
    const ignoreSaveRef = useRef(false);

    const canvasPxW = Math.round(mmToPx(config.canvas.width) * displayScale);
    const canvasPxH = Math.round(mmToPx(config.canvas.height) * displayScale);

    // Ensure CurvedText is registered (idempotent)
    try { (fabric as any).classRegistry?.setClass(CurvedText, "CurvedText"); } catch { /**/ }

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

      // Enable object controls
      fc.on("selection:created", (e) => onSelectionChange(e.selected?.[0] ?? null));
      fc.on("selection:updated", (e) => onSelectionChange(e.selected?.[0] ?? null));
      fc.on("selection:cleared", () => onSelectionChange(null));

      // Save history snapshot after each modification
      const saveSnapshot = () => {
        if (ignoreSaveRef.current) return;
        const json = JSON.stringify(fc.toObject(["excludeFromExport", "isBgImage", "maskShape", "maskRadius"]));
        // Truncate redo branch
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(json);
        // Keep at most 50 snapshots
        if (historyRef.current.length > 50) historyRef.current.shift();
        historyIndexRef.current = historyRef.current.length - 1;
      };
      fc.on("object:added", saveSnapshot);
      fc.on("object:modified", saveSnapshot);
      fc.on("object:removed", saveSnapshot);

      // ── Clamp objects inside the margin safe-area ──────────────────────
      const clampToMargin = (e: { target?: fabric.FabricObject }) => {
        const obj = e.target;
        if (!obj || (obj as unknown as { excludeFromExport?: boolean }).excludeFromExport) return;
        const { margin, canvas } = configRef.current;
        const ds = displayScaleRef.current;
        const safeLeft   = mmToPx(margin.left)   * ds;
        const safeTop    = mmToPx(margin.top)    * ds;
        const safeRight  = mmToPx(canvas.width)  * ds - mmToPx(margin.right)  * ds;
        const safeBottom = mmToPx(canvas.height) * ds - mmToPx(margin.bottom) * ds;
        const objLeft   = (obj.left ?? 0);
        const objTop    = (obj.top  ?? 0);
        const objRight  = objLeft + obj.getScaledWidth();
        const objBottom = objTop  + obj.getScaledHeight();
        let newLeft = objLeft;
        let newTop  = objTop;
        if (objLeft < safeLeft)   newLeft = safeLeft;
        if (objTop  < safeTop)    newTop  = safeTop;
        if (objRight  > safeRight)  newLeft = safeRight  - obj.getScaledWidth();
        if (objBottom > safeBottom) newTop  = safeBottom - obj.getScaledHeight();
        if (newLeft !== objLeft || newTop !== objTop) {
          obj.set({ left: newLeft, top: newTop });
          obj.setCoords();
        }
      };
      fc.on("object:moving",  clampToMargin);
      fc.on("object:scaling", clampToMargin);

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

    // ── Imperative API ──────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      addText() {
        const fc = fabricRef.current;
        if (!fc) return;
        const { margin } = configRef.current;
        const ds = displayScaleRef.current;
        const sl = mmToPx(margin.left) * ds;
        const st = mmToPx(margin.top)  * ds;
        const t = new fabric.IText("Double-click to edit", {
          left: sl,
          top: st,
          fontFamily: "Inter, sans-serif",
          fontSize: 16,
          fill: "#1f2937",
        });
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
        });
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
        const c = new fabric.Circle({
          left: sl,
          top: st,
          radius: 50,
          fill: "rgba(34,197,94,0.15)",
          stroke: "#22c55e",
          strokeWidth: 1.5,
        });
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
        const l = new fabric.Line([sl, st + 20, sl + 80, st + 20], {
          stroke: "#6b7280",
          strokeWidth: 2,
        });
        fc.add(l);
        fc.setActiveObject(l);
        fc.renderAll();
      },

      addQRCode(text: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        QRCode.toDataURL(text || "https://example.com", { margin: 1, width: 200 })
          .then((url) => {
            fabric.FabricImage.fromURL(url).then((img) => {
              const size = Math.min(fc.getWidth(), fc.getHeight()) * 0.25;
              img.scaleToWidth(size);
              img.scaleToHeight(size);
              const { margin: qrMargin } = configRef.current;
              const qrDs = displayScaleRef.current;
              img.set({ left: mmToPx(qrMargin.left) * qrDs, top: mmToPx(qrMargin.top) * qrDs });
              fc.add(img);
              fc.setActiveObject(img);
              fc.renderAll();
            });
          })
          .catch(() => {});
      },

      addDynamicField(fieldKey: string) {
        const fc = fabricRef.current;
        if (!fc) return;
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
        });
        fc.add(t);
        fc.setActiveObject(t);
        fc.renderAll();
      },

      addImage(dataUrl: string) {
        const fc = fabricRef.current;
        if (!fc) return;
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
            img.set({ left: mmToPx(imgMargin.left) * imgDs, top: mmToPx(imgMargin.top) * imgDs, maskShape: "none", maskRadius: 24, _originalSrc: dataUrl } as any);
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
          const offscreen = document.createElement("canvas");
          offscreen.width = fc.getWidth();
          offscreen.height = fc.getHeight();
          const ctx = offscreen.getContext("2d")!;
          // Parse the gradient direction + stops to build CanvasGradient
          const match = colorOrGradient.match(/linear-gradient\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
          if (match) {
            const angle = match[1].includes("deg")
              ? parseFloat(match[1])
              : 135;
            const rad = (angle * Math.PI) / 180;
            const w = offscreen.width, h = offscreen.height;
            const x1 = w / 2 - (Math.cos(rad) * w) / 2;
            const y1 = h / 2 - (Math.sin(rad) * h) / 2;
            const x2 = w / 2 + (Math.cos(rad) * w) / 2;
            const y2 = h / 2 + (Math.sin(rad) * h) / 2;
            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, match[2].trim());
            grad.addColorStop(1, match[3].trim());
            ctx.fillStyle = grad;
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

      setBackgroundImage(dataUrl: string) {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "image";
        const existing = fc.getObjects().find((o) => (o as any).isBgImage);
        if (existing) fc.remove(existing);
        fc.backgroundColor = "transparent";
        fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" }).then((img) => {
          img.set({ left: 0, top: 0, selectable: false, evented: false, isBgImage: true } as any);
          img.scaleToWidth(fc.getWidth());
          img.scaleToHeight(fc.getHeight());
          fc.add(img);
          fc.sendObjectToBack(img);
          if (marginGroupRef.current) fc.sendObjectToBack(marginGroupRef.current);
          fc.renderAll();
        });
      },

      clearBackground() {
        const fc = fabricRef.current;
        if (!fc) return;
        bgStringRef.current = "";
        ++bgTokenRef.current; // cancel any in-flight gradient renders
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
        const cW = fc.getWidth();
        const cH = fc.getHeight();
        const oW = obj.getScaledWidth();
        const oH = obj.getScaledHeight();
        switch (alignment) {
          case 'top':    obj.set({ top: 0 }); break;
          case 'middle': obj.set({ top: (cH - oH) / 2 }); break;
          case 'bottom': obj.set({ top: cH - oH }); break;
          case 'left':   obj.set({ left: 0 }); break;
          case 'center': obj.set({ left: (cW - oW) / 2 }); break;
          case 'right':  obj.set({ left: cW - oW }); break;
        }
        obj.setCoords();
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
            element.set({
              left: mmToPx(margin.left) * ds,
              top:  mmToPx(margin.top)  * ds,
            });
            element.setCoords();
            fc.add(element);
            fc.setActiveObject(element);
            fc.renderAll();
          })
          .catch(() => {/* SVG parse failed – silently ignore */});
      },

      // ── Curved / Arc Text ───────────────────────────────────────────────
      addCurvedText(opts: CurvedTextOpts = {}) {
        const fc = fabricRef.current;
        if (!fc) return;
        const ds  = displayScaleRef.current;
        const { margin } = configRef.current;
        const ct = new CurvedText({
          text: "Curved Text",
          radius: 80 * ds,
          fontSize: 18 * ds,
          fill: "#1f2937",
          ...opts,
        });
        ct.refreshSize();
        ct.set({
          left: mmToPx(margin.left) * ds + ct.width / 2,
          top:  mmToPx(margin.top)  * ds + ct.height / 2,
        });
        fc.add(ct);
        fc.setActiveObject(ct);
        fc.renderAll();
      },

      updateCurvedText(props: Partial<CurvedTextOpts>) {
        const fc = fabricRef.current;
        const active = fc?.getActiveObject();
        if (!fc || !active || (active as any).type !== "CurvedText") return;
        const ct = active as CurvedText;
        Object.assign(ct, props);
        if ("radius" in props || "fontSize" in props) ct.refreshSize();
        ct.set("dirty", true);
        ct.setCoords();
        fc.fire("object:modified", { target: ct });
        fc.requestRenderAll();
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
