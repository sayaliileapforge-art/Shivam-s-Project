/**
 * alignmentUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, framework-agnostic helpers for real-time alignment detection and
 * snapping in the Designer Studio canvas.
 *
 * No Fabric.js dependency — easy to unit-test in isolation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Axis-aligned bounding box in canvas model-space pixels. */
export interface AlignmentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A single guide line to render on the canvas.
 *
 *  axis === 'x'  →  vertical line   (constant x, spans from `start` to `end` on y)
 *  axis === 'y'  →  horizontal line (constant y, spans from `start` to `end` on x)
 */
export interface AlignmentLine {
  axis: "x" | "y";
  /** Fixed coordinate on this axis */
  position: number;
  /** Start coordinate on the perpendicular axis */
  start: number;
  /** End coordinate on the perpendicular axis */
  end: number;
  /** Which key point triggered this: 'left'|'hcenter'|'right'|'top'|'vcenter'|'bottom' */
  type: string;
}

/** A pair of objects whose equal spacing with the current object was detected. */
export interface SpacingGuide {
  /** 'x' = equal horizontal gaps; 'y' = equal vertical gaps */
  axis: "x" | "y";
  /** The average gap size in pixels */
  gap: number;
  /** The two neighboring rects that form the equal-spacing triplet */
  neighbors: [AlignmentRect, AlignmentRect];
}

export interface AlignmentResult {
  lines: AlignmentLine[];
  /** New bounding-rect `left` to snap to, or null if no x-snap */
  snapLeft: number | null;
  /** New bounding-rect `top` to snap to, or null if no y-snap */
  snapTop: number | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Six key points (edges + centers) of a rect. */
function edges(r: AlignmentRect) {
  return {
    left:    r.left,
    hcenter: r.left + r.width  / 2,
    right:   r.left + r.width,
    top:     r.top,
    vcenter: r.top  + r.height / 2,
    bottom:  r.top  + r.height,
  };
}

// The six key-point checks performed along the x-axis (vertical guide lines).
function xCheckPoints(cur: ReturnType<typeof edges>, r: AlignmentRect) {
  return [
    { curVal: cur.left,    type: "left",    snapFn: (p: number) => p },
    { curVal: cur.hcenter, type: "hcenter", snapFn: (p: number) => p - r.width / 2 },
    { curVal: cur.right,   type: "right",   snapFn: (p: number) => p - r.width },
  ] as const;
}

// The six key-point checks performed along the y-axis (horizontal guide lines).
function yCheckPoints(cur: ReturnType<typeof edges>, r: AlignmentRect) {
  return [
    { curVal: cur.top,     type: "top",     snapFn: (p: number) => p },
    { curVal: cur.vcenter, type: "vcenter", snapFn: (p: number) => p - r.height / 2 },
    { curVal: cur.bottom,  type: "bottom",  snapFn: (p: number) => p - r.height },
  ] as const;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect alignment between the dragged rect and all other rects.
 *
 * For each pair of matching key points (e.g. dragged-left ≈ other-right) within
 * `threshold` pixels:
 *  - records a guide line spanning both objects
 *  - records the snap target position (first match wins per axis)
 *
 * @param current   Bounding rect of the object being dragged.
 * @param others    Bounding rects of all other interactive objects.
 * @param threshold Snap distance in pixels (default: 5).
 */
export function detectAlignment(
  current: AlignmentRect,
  others:  AlignmentRect[],
  threshold = 5,
): AlignmentResult {
  const cur = edges(current);
  const lines: AlignmentLine[] = [];
  let snapLeft: number | null = null;
  let snapTop:  number | null = null;

  // Unique-position de-duplication keys
  const seenX = new Set<number>();
  const seenY = new Set<number>();

  for (const other of others) {
    const oth = edges(other);

    // ── X-axis: vertical guide lines ─────────────────────────────────────
    const xTargets = [
      { val: oth.left,    type: "left"    },
      { val: oth.hcenter, type: "hcenter" },
      { val: oth.right,   type: "right"   },
    ];

    for (const pt of xCheckPoints(cur, current)) {
      for (const tgt of xTargets) {
        if (Math.abs(pt.curVal - tgt.val) <= threshold) {
          const pos = tgt.val;
          if (snapLeft === null) snapLeft = pt.snapFn(pos);

          // Span the line across both objects' full vertical extents
          const y1 = Math.min(cur.top,    oth.top);
          const y2 = Math.max(cur.bottom, oth.bottom);

          if (!seenX.has(Math.round(pos))) {
            seenX.add(Math.round(pos));
            lines.push({ axis: "x", position: pos, start: y1, end: y2, type: pt.type });
          }
        }
      }
    }

    // ── Y-axis: horizontal guide lines ───────────────────────────────────
    const yTargets = [
      { val: oth.top,     type: "top"     },
      { val: oth.vcenter, type: "vcenter" },
      { val: oth.bottom,  type: "bottom"  },
    ];

    for (const pt of yCheckPoints(cur, current)) {
      for (const tgt of yTargets) {
        if (Math.abs(pt.curVal - tgt.val) <= threshold) {
          const pos = tgt.val;
          if (snapTop === null) snapTop = pt.snapFn(pos);

          // Span the line across both objects' full horizontal extents
          const x1 = Math.min(cur.left,  oth.left);
          const x2 = Math.max(cur.right, oth.right);

          if (!seenY.has(Math.round(pos))) {
            seenY.add(Math.round(pos));
            lines.push({ axis: "y", position: pos, start: x1, end: x2, type: pt.type });
          }
        }
      }
    }
  }

  return { lines, snapLeft, snapTop };
}

/**
 * Detect equal-spacing situations relative to the dragged object.
 *
 * Checks whether the current object is evenly spaced between two others along
 * either the x-axis or y-axis.
 *
 * @param current   Bounding rect of the object being dragged.
 * @param others    Bounding rects of all other interactive objects (≥ 2 needed).
 * @param threshold Pixel tolerance for "equal" gap detection (default: 5).
 */
export function detectEqualSpacing(
  current: AlignmentRect,
  others:  AlignmentRect[],
  threshold = 5,
): SpacingGuide[] {
  const guides: SpacingGuide[] = [];
  if (others.length < 2) return guides;

  // ── X-axis: horizontal equal spacing ─────────────────────────────────────
  // Sort other objects by their left edge, then check if current fits equally
  // between any adjacent pair.
  const byX = [...others].sort((a, b) => a.left - b.left);
  for (let i = 0; i < byX.length - 1; i++) {
    const leftObj  = byX[i];
    const rightObj = byX[i + 1];

    // gap from right-edge of leftObj → left-edge of current
    const gapA = current.left - (leftObj.left + leftObj.width);
    // gap from right-edge of current → left-edge of rightObj
    const gapB = rightObj.left - (current.left + current.width);

    if (gapA > 0 && gapB > 0 && Math.abs(gapA - gapB) <= threshold) {
      guides.push({
        axis: "x",
        gap: (gapA + gapB) / 2,
        neighbors: [leftObj, rightObj],
      });
    }
  }

  // ── Y-axis: vertical equal spacing ───────────────────────────────────────
  const byY = [...others].sort((a, b) => a.top - b.top);
  for (let i = 0; i < byY.length - 1; i++) {
    const topObj    = byY[i];
    const bottomObj = byY[i + 1];

    const gapA = current.top - (topObj.top + topObj.height);
    const gapB = bottomObj.top - (current.top + current.height);

    if (gapA > 0 && gapB > 0 && Math.abs(gapA - gapB) <= threshold) {
      guides.push({
        axis: "y",
        gap: (gapA + gapB) / 2,
        neighbors: [topObj, bottomObj],
      });
    }
  }

  return guides;
}

/**
 * Given an object's current bounding-rect left/top and an alignment result,
 * compute the snapped bounding-rect left/top.
 *
 * Returns the original values unchanged when no snap applies.
 */
export function getSnapPosition(
  current: AlignmentRect,
  result:  AlignmentResult,
): { left: number; top: number } {
  return {
    left: result.snapLeft ?? current.left,
    top:  result.snapTop  ?? current.top,
  };
}

/**
 * Extract a normalised AlignmentRect from a Fabric FabricObject.
 *
 * In Fabric v7, `getBoundingRect()` returns absolute canvas-space coords but
 * uses CACHED corner points — it does NOT force a recalculation.  During an
 * `object:moving` event Fabric has already updated the object's position but
 * has NOT yet called `setCoords()`, so the cached coords are stale.
 *
 * Fix: call `obj.setCoords()` first to flush the current transform into the
 * cache, then call `getBoundingRect()`.  This gives accurate positions for the
 * moving object on every drag tick without touching anything else.
 */
export function rectFromFabricObject(obj: {
  setCoords(): void;
  getBoundingRect(): { left: number; top: number; width: number; height: number };
}): AlignmentRect {
  obj.setCoords();                  // flush current transform → update cached corners
  const b = obj.getBoundingRect(); // now reads from fresh cache
  return { left: b.left, top: b.top, width: b.width, height: b.height };
}
