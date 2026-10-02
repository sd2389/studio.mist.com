import { describe, expect, it } from "vitest";
import {
  drawExportWatermark,
  WATERMARK_TEXT,
  watermarkFontPx,
  watermarkTiling,
} from "@/lib/export-watermark";

type Style = {
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
};

type Draw = Style & { op: "fill" | "stroke"; text: string; x: number; y: number };

const fontSize = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);

/** A 2D context that records each text draw with the style in force (Node has no canvas). */
class RecordingContext {
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  lineJoin: CanvasLineJoin = "miter";
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  readonly draws: Draw[] = [];
  readonly transforms: { op: "translate" | "rotate"; args: number[] }[] = [];
  readonly saved: Style[] = [];

  style(): Style {
    const { font, textAlign, textBaseline, fillStyle, strokeStyle, lineWidth, lineJoin, globalAlpha, globalCompositeOperation } = this;
    return { font, textAlign, textBaseline, fillStyle, strokeStyle, lineWidth, lineJoin, globalAlpha, globalCompositeOperation };
  }
  save(): void {
    this.saved.push(this.style());
  }
  restore(): void {
    const style = this.saved.pop();
    if (style) Object.assign(this, style);
  }
  translate(x: number, y: number): void {
    this.transforms.push({ op: "translate", args: [x, y] });
  }
  rotate(angle: number): void {
    this.transforms.push({ op: "rotate", args: [angle] });
  }
  /** About 0.6 em per character, like a semibold sans. */
  measureText(text: string): TextMetrics {
    return { width: text.length * fontSize(this.font) * 0.6 } as TextMetrics;
  }
  fillText(text: string, x: number, y: number): void {
    this.draws.push({ ...this.style(), op: "fill", text, x, y });
  }
  strokeText(text: string, x: number, y: number): void {
    this.draws.push({ ...this.style(), op: "stroke", text, x, y });
  }
}

const rgba = (color: string) => color.match(/[\d.]+/g)!.map(Number);

/** Every point of the frame must sit within half a step of some mark (in the rotated frame). */
function uncoveredPoints(width: number, height: number): number {
  const fontPx = watermarkFontPx(width, height);
  const tiling = watermarkTiling(width, height, fontPx, WATERMARK_TEXT.length * fontPx * 0.6);
  const cos = Math.cos(tiling.angleRad);
  const sin = Math.sin(tiling.angleRad);
  let uncovered = 0;
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 24; j++) {
      const dx = (width * i) / 24 - width / 2;
      const dy = (height * j) / 24 - height / 2;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      const covered = tiling.positions.some(
        (p) => Math.abs(p.x - u) <= tiling.stepX / 2 + 1e-6 && Math.abs(p.y - v) <= tiling.stepY / 2 + 1e-6,
      );
      if (!covered) uncovered += 1;
    }
  }
  return uncovered;
}

describe("watermark layout", () => {
  it("sizes the mark from the frame, so it reads the same at any resolution", () => {
    expect(watermarkFontPx(3840, 2160)).toBe(2 * watermarkFontPx(1920, 1080));
    expect(watermarkFontPx(1080, 1920)).toBe(watermarkFontPx(1920, 1080));
    expect(watermarkFontPx(80, 60)).toBe(12);

    const hd = watermarkTiling(1920, 1080, 55, 330);
    const uhd = watermarkTiling(3840, 2160, 110, 660);
    expect(uhd.positions).toHaveLength(hd.positions.length);
    expect(uhd.positions[0]).toEqual({ x: hd.positions[0]!.x * 2, y: hd.positions[0]!.y * 2 });
  });

  it("covers the whole frame, corners included, at every export shape", () => {
    for (const [width, height] of [
      [1280, 720],
      [1920, 1080],
      [1080, 1920],
      [2000, 2000],
      [2880, 2160],
      [7680, 4320],
    ] as const) {
      expect(uncoveredPoints(width, height), `${width}×${height}`).toBe(0);
    }
  });

  it("tilts rows 30° and offsets every other row (brick pattern)", () => {
    const tiling = watermarkTiling(1920, 1080, 55, 330);
    expect(tiling.angleRad).toBeCloseTo((-30 * Math.PI) / 180, 12);
    const rowStarts = new Map<number, number>();
    for (const { x, y } of tiling.positions) rowStarts.set(y, Math.min(rowStarts.get(y) ?? Infinity, x));
    const [row0, row1] = [...rowStarts.entries()].sort((a, b) => a[0] - b[0]);
    const offset = Math.abs(row1![1] - row0![1]) % tiling.stepX;
    expect(offset).toBeCloseTo(tiling.stepX / 2, 6);
  });

  it("leaves out marks that cannot touch the frame", () => {
    const width = 1920;
    const height = 1080;
    const tiling = watermarkTiling(width, height, 55, 330);
    const margin = Math.hypot(tiling.stepX, tiling.stepY) / 2;
    const cos = Math.cos(tiling.angleRad);
    const sin = Math.sin(tiling.angleRad);
    for (const { x, y } of tiling.positions) {
      const frameX = width / 2 + x * cos - y * sin;
      const frameY = height / 2 + x * sin + y * cos;
      expect(frameX).toBeGreaterThanOrEqual(-margin);
      expect(frameX).toBeLessThanOrEqual(width + margin);
      expect(frameY).toBeGreaterThanOrEqual(-margin);
      expect(frameY).toBeLessThanOrEqual(height + margin);
    }
  });
});

describe("drawExportWatermark", () => {
  it("tiles faint light text with a dark edge over the whole frame", () => {
    const ctx = new RecordingContext();
    drawExportWatermark(ctx, 1920, 1080);

    const fontPx = watermarkFontPx(1920, 1080);
    const tiling = watermarkTiling(1920, 1080, fontPx, WATERMARK_TEXT.length * fontPx * 0.6);
    const fills = ctx.draws.filter((d) => d.op === "fill");
    const strokes = ctx.draws.filter((d) => d.op === "stroke");
    expect(fills).toHaveLength(tiling.positions.length);
    expect(strokes).toHaveLength(tiling.positions.length);
    expect(fills.map(({ x, y }) => ({ x, y }))).toEqual(tiling.positions);

    for (const draw of ctx.draws) {
      expect(draw.text).toBe(WATERMARK_TEXT);
      expect(draw.font).toContain(`${fontPx}px`);
      expect(draw.textAlign).toBe("center");
      expect(draw.textBaseline).toBe("middle");
      // Plain "over" blending: marks land on transparent pixels too, so cutouts keep them.
      expect(draw.globalCompositeOperation).toBe("source-over");
      expect(draw.globalAlpha).toBe(1);
      expect(draw.lineWidth).toBeGreaterThan(0);
      expect(draw.lineWidth).toBeLessThan(fontPx / 5);
    }
    const [fr, fg, fb, fa] = rgba(fills[0]!.fillStyle);
    expect(Math.min(fr!, fg!, fb!)).toBeGreaterThanOrEqual(200);
    expect(fa).toBeLessThanOrEqual(0.3);
    const [sr, sg, sb, sa] = rgba(strokes[0]!.strokeStyle);
    expect(Math.max(sr!, sg!, sb!)).toBeLessThanOrEqual(60);
    expect(sa).toBeLessThanOrEqual(0.3);
  });

  it("draws each mark's edge before its fill, rotated about the frame centre", () => {
    const ctx = new RecordingContext();
    drawExportWatermark(ctx, 1080, 1920);
    expect(ctx.draws[0]!.op).toBe("stroke");
    expect(ctx.draws[1]!.op).toBe("fill");
    expect(ctx.draws[1]!.x).toBe(ctx.draws[0]!.x);
    expect(ctx.transforms).toEqual([
      { op: "translate", args: [540, 960] },
      { op: "rotate", args: [(-30 * Math.PI) / 180] },
    ]);
  });

  it("leaves the context's state as it found it", () => {
    const ctx = new RecordingContext();
    const before = ctx.style();
    drawExportWatermark(ctx, 3840, 2160);
    expect(ctx.saved).toHaveLength(0);
    expect(ctx.style()).toEqual(before);
  });
});
