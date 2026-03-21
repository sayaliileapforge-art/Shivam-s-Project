import { cn } from "./utils";

export type MaskShape = "circle" | "rounded" | "custom";

export interface MaskStyleConfig {
  shape: MaskShape;
  roundedRadius: number;
  customClipPath?: string;

  borderWidth: number;
  borderColor: string;
  useGradientBorder: boolean;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;

  shadowEnabled: boolean;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowSpread: number;
  shadowColor: string;
  shadowOpacity: number;

  opacity: number;

  glowEnabled: boolean;
  glowColor: string;
  glowIntensity: number;
  glowSize: number;
}

export const DEFAULT_MASK_STYLE: MaskStyleConfig = {
  shape: "rounded",
  roundedRadius: 24,
  customClipPath: "polygon(50% 0%, 88% 20%, 100% 60%, 70% 100%, 30% 100%, 0% 60%, 12% 20%)",

  borderWidth: 3,
  borderColor: "#e2e8f0",
  useGradientBorder: false,
  gradientFrom: "#06b6d4",
  gradientTo: "#8b5cf6",
  gradientAngle: 120,

  shadowEnabled: true,
  shadowX: 0,
  shadowY: 10,
  shadowBlur: 26,
  shadowSpread: 0,
  shadowColor: "#0f172a",
  shadowOpacity: 0.26,

  opacity: 1,

  glowEnabled: false,
  glowColor: "#22d3ee",
  glowIntensity: 0.55,
  glowSize: 18,
};

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : value;

  const intValue = Number.parseInt(normalized, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function buildShapeStyle(config: MaskStyleConfig): React.CSSProperties {
  if (config.shape === "circle") {
    return { borderRadius: "9999px" };
  }
  if (config.shape === "rounded") {
    return { borderRadius: `${config.roundedRadius}px` };
  }
  return {
    clipPath: config.customClipPath || DEFAULT_MASK_STYLE.customClipPath,
  };
}

function buildOuterShadow(config: MaskStyleConfig): string {
  const layers: string[] = [];

  if (config.shadowEnabled) {
    layers.push(
      `${config.shadowX}px ${config.shadowY}px ${config.shadowBlur}px ${config.shadowSpread}px ${hexToRgba(
        config.shadowColor,
        config.shadowOpacity
      )}`
    );
  }

  if (config.glowEnabled) {
    const glowBase = hexToRgba(config.glowColor, config.glowIntensity);
    layers.push(`0 0 ${Math.max(1, config.glowSize)}px ${glowBase}`);
    layers.push(`0 0 ${Math.max(2, config.glowSize * 1.8)}px ${hexToRgba(config.glowColor, config.glowIntensity * 0.72)}`);
    layers.push(`0 0 ${Math.max(4, config.glowSize * 2.8)}px ${hexToRgba(config.glowColor, config.glowIntensity * 0.45)}`);
  }

  return layers.join(", ");
}

export interface MaskedImageProps {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  config: MaskStyleConfig;
}

export function MaskedImage({
  src,
  alt = "Masked image",
  width = 360,
  height = 260,
  className,
  config,
}: MaskedImageProps) {
  const shapeStyle = buildShapeStyle(config);

  const outerStyle: React.CSSProperties = {
    width,
    height,
    boxShadow: buildOuterShadow(config) || undefined,
    transition: "all 160ms ease",
    ...(config.useGradientBorder
      ? {
          padding: `${config.borderWidth}px`,
          background: `linear-gradient(${config.gradientAngle}deg, ${config.gradientFrom}, ${config.gradientTo})`,
          ...shapeStyle,
        }
      : {
          border: `${config.borderWidth}px solid ${config.borderColor}`,
          ...shapeStyle,
        }),
  };

  const innerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: "#0f172a",
    ...shapeStyle,
  };

  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: Math.max(0, Math.min(1, config.opacity)),
    transition: "all 160ms ease",
  };

  return (
    <div className={cn("relative", className)} style={outerStyle}>
      <div style={innerStyle}>
        <img src={src} alt={alt} style={imageStyle} draggable={false} />
      </div>
    </div>
  );
}
