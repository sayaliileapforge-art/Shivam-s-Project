import { buildTicks } from "../../../lib/fabricUtils";

export const RULER_THICKNESS = 22; // px

// ── Horizontal ruler (top) ────────────────────────────────────────────────────
export function HRuler({
  canvasPxW,
  canvasMmW,
  scale,
}: {
  canvasPxW: number;
  canvasMmW: number;
  scale: number;
}) {
  const ticks = buildTicks(canvasMmW, scale);
  return (
    <svg
      width={canvasPxW}
      height={RULER_THICKNESS}
      style={{ display: "block", flexShrink: 0, userSelect: "none" }}
    >
      <rect width={canvasPxW} height={RULER_THICKNESS} fill="#f9fafb" />
      <line x1={0} y1={RULER_THICKNESS} x2={canvasPxW} y2={RULER_THICKNESS} stroke="#d1d5db" strokeWidth={1} />
      {ticks.map(({ pos, mm, size, label }) => {
        const h = size === "lg" ? 14 : size === "md" ? 10 : 5;
        return (
          <g key={mm}>
            <line
              x1={pos} y1={RULER_THICKNESS}
              x2={pos} y2={RULER_THICKNESS - h}
              stroke="#9ca3af" strokeWidth={0.8}
            />
            {label && (
              <text x={pos + 2} y={RULER_THICKNESS - h - 1} fontSize={8} fill="#6b7280" fontFamily="monospace">
                {mm}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Vertical ruler (left) ─────────────────────────────────────────────────────
export function VRuler({
  canvasPxH,
  canvasMmH,
  scale,
}: {
  canvasPxH: number;
  canvasMmH: number;
  scale: number;
}) {
  const ticks = buildTicks(canvasMmH, scale);
  return (
    <svg
      width={RULER_THICKNESS}
      height={canvasPxH}
      style={{ display: "block", flexShrink: 0, userSelect: "none" }}
    >
      <rect width={RULER_THICKNESS} height={canvasPxH} fill="#f9fafb" />
      <line x1={RULER_THICKNESS} y1={0} x2={RULER_THICKNESS} y2={canvasPxH} stroke="#d1d5db" strokeWidth={1} />
      {ticks.map(({ pos, mm, size, label }) => {
        const w = size === "lg" ? 14 : size === "md" ? 10 : 5;
        return (
          <g key={mm}>
            <line
              x1={RULER_THICKNESS} y1={pos}
              x2={RULER_THICKNESS - w} y2={pos}
              stroke="#9ca3af" strokeWidth={0.8}
            />
            {label && (
              <text
                x={RULER_THICKNESS - w - 2}
                y={pos - 2}
                fontSize={8}
                fill="#6b7280"
                fontFamily="monospace"
                textAnchor="end"
                transform={`rotate(-90, ${RULER_THICKNESS - w - 2}, ${pos - 2})`}
              >
                {mm}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
