/**
 * The mark on exports from plans that watermark (Free): a faint "MIST Studio" tiled
 * diagonally across the whole frame. Light text with a thin dark edge, so it reads on white
 * and on black; sized from the frame, so it looks the same at HD and at 4K.
 */

export const WATERMARK_TEXT = "MIST Studio";

/** Rows rise 30° from left to right (canvas rotation is clockwise-positive). */
const ANGLE_RAD = (-30 * Math.PI) / 180;
/** Font size as a share of the frame's diagonal. */
const FONT_PER_DIAGONAL = 0.025;
const MIN_FONT_PX = 12;
/** Space after each mark along a row, and between rows, in font sizes. */
const GAP_EM = 2;
const ROW_EM = 3.6;
const EDGE_EM = 0.08;
const FILL = "rgba(255, 255, 255, 0.22)";
const EDGE = "rgba(0, 0, 0, 0.16)";
const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** The part of a 2D context (on-screen or offscreen) the watermark draws with. */
export type WatermarkContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "rotate"
  | "measureText"
  | "fillText"
  | "strokeText"
  | "font"
  | "textAlign"
  | "textBaseline"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "globalAlpha"
  | "globalCompositeOperation"
>;

export type WatermarkTiling = {
  fontPx: number;
  angleRad: number;
  /** Distance between marks along a row, and between rows. */
  stepX: number;
  stepY: number;
  /** Mark centres in the rotated frame, origin at the frame centre. */
  positions: { x: number; y: number }[];
};

export function watermarkFontPx(width: number, height: number): number {
  return Math.max(MIN_FONT_PX, Math.round(Math.hypot(width, height) * FONT_PER_DIAGONAL));
}

/**
 * Where the marks go: rows of `textWidth`-wide marks, every other row shifted half a step (a
 * brick pattern), so every point of the frame is within half a step of a mark. Marks that
 * would not touch the frame are left out.
 */
export function watermarkTiling(width: number, height: number, fontPx: number, textWidth: number): WatermarkTiling {
  const stepX = textWidth + fontPx * GAP_EM;
  const stepY = fontPx * ROW_EM;
  const reach = Math.hypot(width, height) / 2;
  const cols = Math.ceil(reach / stepX) + 1;
  const rows = Math.ceil(reach / stepY) + 1;
  // A mark whose centre is farther than this outside the frame cannot touch it.
  const margin = Math.hypot(stepX, stepY) / 2;
  const cos = Math.cos(ANGLE_RAD);
  const sin = Math.sin(ANGLE_RAD);
  const positions: WatermarkTiling["positions"] = [];
  for (let row = -rows; row <= rows; row++) {
    const shift = row % 2 === 0 ? 0 : stepX / 2;
    for (let col = -cols; col <= cols; col++) {
      const x = col * stepX + shift;
      const y = row * stepY;
      const frameX = width / 2 + x * cos - y * sin;
      const frameY = height / 2 + x * sin + y * cos;
      if (frameX < -margin || frameX > width + margin || frameY < -margin || frameY > height + margin) continue;
      positions.push({ x, y });
    }
  }
  return { fontPx, angleRad: ANGLE_RAD, stepX, stepY, positions };
}

/**
 * Draws the watermark over everything in a `width × height` frame, transparent pixels
 * included (cutout PNGs keep it), and leaves the context's state as it found it.
 */
export function drawExportWatermark(ctx: WatermarkContext, width: number, height: number): void {
  const fontPx = watermarkFontPx(width, height);
  ctx.save();
  ctx.font = `600 ${fontPx}px ${FONT_FAMILY}`;
  const tiling = watermarkTiling(width, height, fontPx, ctx.measureText(WATERMARK_TEXT).width);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = fontPx * EDGE_EM;
  ctx.strokeStyle = EDGE;
  ctx.fillStyle = FILL;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(tiling.angleRad);
  for (const { x, y } of tiling.positions) {
    // Edge first, so the fill covers its inner half and only a thin outline shows.
    ctx.strokeText(WATERMARK_TEXT, x, y);
    ctx.fillText(WATERMARK_TEXT, x, y);
  }
  ctx.restore();
}
