/**
 * AlignmentGuides.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders smart alignment & equal-spacing guides directly on canvas.contextTop
 * using the browser's native 2D canvas API.
 *
 * Guides are drawn as dashed light-blue lines (alignment) and dashed
 * light-green bracket markers (equal spacing).  No Fabric objects are added to
 * the canvas — guides exist purely as pixels on the contextTop overlay layer,
 * so they never interfere with history, object lists, or exports.
 *
 * Rendering is driven by requestAnimationFrame so the CPU cost is bounded to
 * one draw call per display frame regardless of how fast object:moving fires.
 * An `after:render` hook keeps the guides redrawn in sync with Fabric's own
 * repaint cycle.
 *
 * Lifecycle:
 *   1. Call `showGuides(...)` on every `object:moving` event.
 *   2. Call `clearGuides(...)` on `object:modified` / `mouse:up` to remove them.
 */

import * as fabric from "fabric";
import type { AlignmentLine, SpacingGuide } from "../../../lib/alignmentUtils";

// ─── Visual constants ─────────────────────────────────────────────────────────

/** Dashed cyan-blue for standard alignment lines (left / center / right / top / bottom). */
const ALIGN_COLOR   = "#00E5FF"; // Canva-style cyan guide
/** Dashed light-green for equal-spacing bracket markers. */
const SPACING_COLOR = "#34d399"; // Emerald 400

const GUIDE_OPACITY = 0.95;
const LINE_WIDTH    = 1;
/** [dash, gap] lengths in logical pixels. */
const DASH: [number, number] = [5, 5];

// ─── AlignmentGuideManager ───────────────────────────────────────────────────

export class AlignmentGuideManager {
  // ── Pending draw-state ──────────────────────────────────────────────────
  private _alignLines:    AlignmentLine[] = [];
  private _spacingGuides: SpacingGuide[]  = [];
  private _hasGuides = false;

  // ── Fabric canvas + rAF handles ─────────────────────────────────────────
  private _fc: fabric.Canvas | null = null;
  private _rafId: number | null = null;
  /** Bound reference kept so we can unregister the listener precisely. */
  private _afterRenderCb: (() => void) | null = null;


  // ────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Schedule guide rendering for the current drag frame.
   *
   * Safe to call many times per second — only one rAF draw call is queued
   * per display frame.
   *
   * @param fc             Fabric canvas instance.
   * @param alignLines     From `detectAlignment()`.
   * @param spacingGuides  From `detectEqualSpacing()`.
   */
  showGuides(
    fc:            fabric.Canvas,
    alignLines:    AlignmentLine[],
    spacingGuides: SpacingGuide[],
  ): void {
    this._fc            = fc;
    this._alignLines    = alignLines;
    this._spacingGuides = spacingGuides;
    this._hasGuides     = alignLines.length > 0 || spacingGuides.length > 0;

    // Hook Fabric's after:render so our overlay stays visible across repaints
    this._ensureAfterRenderHook(fc);

    // Schedule an immediate rAF paint (first-frame responsiveness)
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._paint();
    });
  }

  /**
   * Remove all guide visuals and unhook from Fabric's render cycle.
   * Call on `object:modified` and `mouse:up`.
   */
  clearGuides(fc: fabric.Canvas): void {
    // Cancel any queued rAF paint
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this._alignLines    = [];
    this._spacingGuides = [];
    this._hasGuides     = false;

    // Unhook from Fabric's render loop
    this._removeAfterRenderHook(fc);

    // Immediately wipe the contextTop overlay using the actual canvas dimensions
    const ctx = this._getContextTop(fc);
    if (ctx) ctx.clearRect(0, 0, fc.getWidth(), fc.getHeight());
  }

  // ────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────────────────────────────────

  /** Register the `after:render` listener exactly once. */
  private _ensureAfterRenderHook(fc: fabric.Canvas): void {
    if (this._afterRenderCb) return; // already registered
    this._afterRenderCb = () => this._paint();
    fc.on("after:render", this._afterRenderCb);
  }

  /** Unregister the `after:render` listener. */
  private _removeAfterRenderHook(fc: fabric.Canvas): void {
    if (!this._afterRenderCb) return;
    fc.off("after:render", this._afterRenderCb);
    this._afterRenderCb = null;
  }

  /** Retrieve the contextTop 2D rendering context from a Fabric canvas. */
  private _getContextTop(fc: fabric.Canvas): CanvasRenderingContext2D | null {
    return ((fc as any).contextTop as CanvasRenderingContext2D | undefined) ?? null;
  }

  /**
   * Paint all pending guides onto contextTop.
   * Clears the entire overlay layer first so stale lines never accumulate.
   */
  private _paint(): void {
    const fc = this._fc;
    if (!fc) return;
    const ctx = this._getContextTop(fc);
    if (!ctx) return;

    // contextTop is drawn in CSS-pixel space (viewport space).
    // All guide positions come from getBoundingRect(), which returns
    // MODEL-SPACE coordinates (before the viewport transform).
    // We must scale every drawn coordinate by the viewport transform so
    // guides visually land on top of the rendered objects.
    //
    // Fabric viewport transform: [scaleX, skewY, skewX, scaleY, panX, panY]
    // For a pure zoom: [ds, 0, 0, ds, 0, 0]
    const vpt = (fc as any).viewportTransform as number[] | undefined;
    const vX = vpt ? vpt[0] : 1;   // horizontal scale (+ pan handled below)
    const vY = vpt ? vpt[3] : 1;   // vertical scale
    const panX = vpt ? vpt[4] : 0; // horizontal pan offset (CSS px)
    const panY = vpt ? vpt[5] : 0; // vertical pan offset (CSS px)

    const cw = fc.getWidth();
    const ch = fc.getHeight();

    // Always clear the FULL contextTop canvas first.
    ctx.clearRect(0, 0, cw, ch);
    if (!this._hasGuides) return;

    ctx.save();
    ctx.globalAlpha = GUIDE_OPACITY;

    for (const line of this._alignLines) {
      this._paintAlignLine(ctx, line, cw, ch, vX, vY, panX, panY);
    }

    for (const sg of this._spacingGuides) {
      this._paintSpacingGuide(ctx, sg, vX, vY, panX, panY);
    }

    ctx.restore();
  }

  /**
   * Draw one dashed alignment guide line spanning the full canvas edge-to-edge.
   *
   *  axis === "x"  →  vertical line   at x = line.position  (model-space)
   *  axis === "y"  →  horizontal line at y = line.position  (model-space)
   *
   * vX / vY are the viewport scale factors extracted from fc.viewportTransform.
   * panX / panY are the viewport pan offsets (CSS pixels).
   * Multiplying model coords by vX/vY and adding pan converts them to the
   * same CSS-pixel space that contextTop uses for drawing.
   */
  private _paintAlignLine(
    ctx:  CanvasRenderingContext2D,
    line: AlignmentLine,
    cw:   number,
    ch:   number,
    vX   = 1,
    vY   = 1,
    panX = 0,
    panY = 0,
  ): void {
    ctx.save();
    ctx.strokeStyle = ALIGN_COLOR;
    ctx.lineWidth   = LINE_WIDTH;
    ctx.setLineDash(DASH);
    ctx.lineDashOffset = 0;

    ctx.beginPath();
    if (line.axis === "x") {
      // Vertical guide — convert model x to viewport x, span full canvas height
      const x = line.position * vX + panX;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
    } else {
      // Horizontal guide — convert model y to viewport y, span full canvas width
      const y = line.position * vY + panY;
      ctx.moveTo(0,  y);
      ctx.lineTo(cw, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw equal-spacing brackets for one detected spacing triplet.
   *
   * All neighbor coordinates are in model space; multiply by vX/vY and add
   * pan offsets to convert to contextTop CSS-pixel drawing coordinates.
   */
  private _paintSpacingGuide(
    ctx:  CanvasRenderingContext2D,
    sg:   SpacingGuide,
    vX   = 1,
    vY   = 1,
    panX = 0,
    panY = 0,
  ): void {
    const [a, b] = sg.neighbors;

    ctx.save();
    ctx.strokeStyle = SPACING_COLOR;
    ctx.lineWidth   = LINE_WIDTH;
    ctx.setLineDash(DASH);

    if (sg.axis === "x") {
      // ── Horizontal equal spacing ────────────────────────────────────────
      // Convert model coords to viewport coords
      const aLeft   = a.left   * vX + panX;
      const aWidth  = a.width  * vX;
      const bLeft   = b.left   * vX + panX;
      const aTop    = a.top    * vY + panY;
      const aBottom = (a.top + a.height) * vY + panY;
      const bTop    = b.top    * vY + panY;
      const bBottom = (b.top + b.height) * vY + panY;
      const gap     = sg.gap   * vX;

      const yMin  = Math.min(aTop, bTop);
      const yMax  = Math.max(aBottom, bBottom);
      const yRef  = (yMin + yMax) / 2;
      const tick  = 6;

      // Left tick (centre of left gap)
      const lx = aLeft + aWidth + gap / 2;
      ctx.beginPath();
      ctx.moveTo(lx, yRef - tick);
      ctx.lineTo(lx, yRef + tick);
      ctx.stroke();

      // Right tick (centre of right gap)
      const rx = bLeft - gap / 2;
      ctx.beginPath();
      ctx.moveTo(rx, yRef - tick);
      ctx.lineTo(rx, yRef + tick);
      ctx.stroke();

      // Thin connector between both ticks
      ctx.save();
      ctx.globalAlpha *= 0.4;
      ctx.beginPath();
      ctx.moveTo(lx, yRef);
      ctx.lineTo(rx, yRef);
      ctx.stroke();
      ctx.restore();

    } else {
      // ── Vertical equal spacing ──────────────────────────────────────────
      const aLeft   = a.left   * vX + panX;
      const aRight  = (a.left + a.width)  * vX + panX;
      const bLeft   = b.left   * vX + panX;
      const bRight  = (b.left + b.width)  * vX + panX;
      const aBottom = (a.top + a.height)  * vY + panY;
      const bTop    = b.top    * vY + panY;
      const gap     = sg.gap   * vY;

      const xMin  = Math.min(aLeft, bLeft);
      const xMax  = Math.max(aRight, bRight);
      const xRef  = (xMin + xMax) / 2;
      const tick  = 6;

      // Top tick (centre of top gap)
      const ty = aBottom + gap / 2;
      ctx.beginPath();
      ctx.moveTo(xRef - tick, ty);
      ctx.lineTo(xRef + tick, ty);
      ctx.stroke();

      // Bottom tick (centre of bottom gap)
      const by = bTop - gap / 2;
      ctx.beginPath();
      ctx.moveTo(xRef - tick, by);
      ctx.lineTo(xRef + tick, by);
      ctx.stroke();

      // Thin connector between both ticks
      ctx.save();
      ctx.globalAlpha *= 0.4;
      ctx.beginPath();
      ctx.moveTo(xRef, ty);
      ctx.lineTo(xRef, by);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
