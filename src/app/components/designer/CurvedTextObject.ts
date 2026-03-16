/**
 * CurvedText – a custom Fabric.js object that renders text along a circular arc.
 *
 * Properties
 *  text           – the string to render
 *  radius         – arc radius in canvas px
 *  startAngle     – center angle in degrees  (−90 = top of circle)
 *  direction      – 'cw'  clockwise (normal reading) | 'ccw' counter-clockwise (bottom arc)
 *  letterSpacing  – extra px gap between characters
 *  fontSize       – font size in px
 *  fontFamily     – CSS font family string
 *  fontWeight     – 'normal' | 'bold'
 *  fontStyle      – 'normal' | 'italic'
 *  fill           – inherited from FabricObject (TFiller | null) – use string colour
 */
import * as fabric from "fabric";

export interface CurvedTextOpts {
  text?: string;
  radius?: number;
  startAngle?: number;
  direction?: "cw" | "ccw";
  letterSpacing?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  fill?: string;
}

export class CurvedText extends fabric.FabricObject {
  static type = "CurvedText";

  text: string = "Curved Text";
  radius: number = 100;
  startAngle: number = -90;
  direction: "cw" | "ccw" = "cw";
  letterSpacing: number = 5;
  fontSize: number = 24;
  fontFamily: string = "Inter";
  fontWeight: string = "normal";
  fontStyle: string = "normal";

  constructor(
    opts: CurvedTextOpts & { [key: string]: unknown } = {}
  ) {
    const r  = (opts.radius   as number ?? 100);
    const fs = (opts.fontSize as number ?? 24);
    const size = (r + fs * 2) * 2;
    super({ width: size, height: size, originX: "center", originY: "center", ...opts });

    this.text         = (opts.text         as string  ?? "Curved Text");
    this.radius       = r;
    this.startAngle   = (opts.startAngle   as number  ?? -90);
    this.direction    = (opts.direction    as "cw" | "ccw" ?? "cw");
    this.letterSpacing = (opts.letterSpacing as number ?? 5);
    this.fontSize     = fs;
    this.fontFamily   = (opts.fontFamily   as string  ?? "Inter");
    this.fontWeight   = (opts.fontWeight   as string  ?? "normal");
    this.fontStyle    = (opts.fontStyle    as string  ?? "normal");
  }

  /** Recompute bounding-box after radius / fontSize change. */
  refreshSize() {
    const size = (this.radius + this.fontSize * 2) * 2;
    this.width  = size;
    this.height = size;
    this.setCoords();
  }

  _render(ctx: CanvasRenderingContext2D) {
    const chars = Array.from(this.text);
    if (!chars.length) return;

    ctx.save();
    ctx.font      = `${this.fontStyle} ${this.fontWeight} ${this.fontSize}px "${this.fontFamily}"`;
    ctx.fillStyle = typeof this.fill === "string" ? this.fill : "#000000";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";

    const dirMult    = this.direction === "ccw" ? -1 : 1;
    const widths     = chars.map(ch => ctx.measureText(ch).width);
    const spacingRad = this.letterSpacing / this.radius;
    const totalRad   = widths.reduce((s, w) => s + w / this.radius, 0)
                     + spacingRad * Math.max(0, chars.length - 1);

    let curRad = (this.startAngle * Math.PI / 180) - dirMult * totalRad / 2;

    for (let i = 0; i < chars.length; i++) {
      const charRad = widths[i] / this.radius;
      const midRad  = curRad + dirMult * charRad / 2;

      ctx.save();
      ctx.rotate(midRad);
      ctx.translate(0, -this.radius);
      if (this.direction === "ccw") ctx.rotate(Math.PI);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();

      curRad += dirMult * (charRad + spacingRad);
    }

    ctx.restore();
  }

  toObject(propertiesToInclude?: string[]): Record<string, unknown> {
    return {
      ...super.toObject(propertiesToInclude),
      text:          this.text,
      radius:        this.radius,
      startAngle:    this.startAngle,
      direction:     this.direction,
      letterSpacing: this.letterSpacing,
      fontSize:      this.fontSize,
      fontFamily:    this.fontFamily,
      fontWeight:    this.fontWeight,
      fontStyle:     this.fontStyle,
    };
  }

  static fromObject(obj: Record<string, unknown>): Promise<CurvedText> {
    return Promise.resolve(
      new CurvedText(obj as CurvedTextOpts & { [key: string]: unknown })
    );
  }
}

// Register with Fabric's class-registry so JSON round-trips work.
try {
  (fabric as any).classRegistry?.setClass(CurvedText, "CurvedText");
} catch {
  (fabric as any)["CurvedText"] = CurvedText;
}
