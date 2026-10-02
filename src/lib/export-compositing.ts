import { paintBackdrop, type ExportBackdrop } from "@/lib/export-backdrop";

export type ExportCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export function makeCanvas(width: number, height: number): ExportCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasToBlob(canvas: ExportCanvas, mimeType: string, quality?: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: mimeType, quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))), mimeType, quality);
  });
}

function context2d(canvas: ExportCanvas): Canvas2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as Canvas2D | null;
  if (!ctx) throw new Error("2D canvas unavailable for export compositing");
  return ctx;
}

function sizedSurface(existing: ExportCanvas | null, width: number, height: number): ExportCanvas {
  const surface = existing ?? makeCanvas(width, height);
  if (surface.width !== width) surface.width = width;
  if (surface.height !== height) surface.height = height;
  return surface;
}

/**
 * Rebuilds straight RGBA from a colour render over black (so its RGB is premultiplied) and a
 * coverage matte: rgb = colour / α. Pixels outside the matte become fully transparent.
 */
export function unpremultiplyWithMatte(color: Uint8ClampedArray, matte: Uint8ClampedArray): void {
  for (let i = 0; i < color.length; i += 4) {
    const alpha = matte[i + 3]!;
    if (alpha === 0) {
      color[i] = 0;
      color[i + 1] = 0;
      color[i + 2] = 0;
    } else if (alpha < 255) {
      const scale = 255 / alpha;
      color[i] = color[i]! * scale;
      color[i + 1] = color[i + 1]! * scale;
      color[i + 2] = color[i + 2]! * scale;
    }
    color[i + 3] = alpha;
  }
}

/**
 * 2D layers for flattening WebGPU renders. The viewer PostFX chain (bloom + SMAA) writes
 * alpha ≈ 1 everywhere, so coverage comes from a plain render (the matte) and colour from
 * the full render. Read synchronously, before the next render replaces the WebGPU canvas.
 */
export function createExportLayers() {
  let matte: ExportCanvas | null = null;
  let cutout: ExportCanvas | null = null;
  let flat: ExportCanvas | null = null;
  return {
    copyMatte(source: ExportCanvas): ExportCanvas {
      matte = sizedSurface(matte, source.width, source.height);
      const ctx = context2d(matte);
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(source, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      return matte;
    },
    /** Transparent PNG layer: full-render colour with the matte's alpha. */
    cutout(matteLayer: ExportCanvas, colorRender: ExportCanvas): ExportCanvas {
      const { width, height } = matteLayer;
      cutout = sizedSurface(cutout, width, height);
      const ctx = context2d(cutout);
      // Over black, the render's RGB is its premultiplied colour whatever alpha it carries.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(colorRender, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      unpremultiplyWithMatte(pixels.data, context2d(matteLayer).getImageData(0, 0, width, height).data);
      ctx.putImageData(pixels, 0, 0);
      return cutout;
    },
    /** `backdrop · (1 − α) + colour`: exact backdrop, bloom glow kept. */
    flatten(
      backdrop: ExportBackdrop,
      image: CanvasImageSource | null,
      matteLayer: ExportCanvas,
      colorRender: ExportCanvas,
    ): ExportCanvas {
      const { width, height } = matteLayer;
      flat = sizedSurface(flat, width, height);
      const ctx = context2d(flat);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, width, height);
      paintBackdrop(ctx, width, height, backdrop, image);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(matteLayer, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(colorRender, 0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      return flat;
    },
  };
}
