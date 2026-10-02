import { makeCanvas, type ExportCanvas } from "./export-compositing";

/**
 * Supersampling for still exports: render the same frame several times with sub-pixel
 * camera jitter and average the results. Facet edges and pinpoint sparkles resolve the way
 * a camera's sensor integrates them, instead of the single-sample stair-stepping SMAA can
 * only partly hide. Averaging happens in premultiplied space so transparent edges stay clean.
 */

export const STILL_EXPORT_SAMPLES = 8;

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  let i = index;
  while (i > 0) {
    result += fraction * (i % base);
    i = Math.floor(i / base);
    fraction /= base;
  }
  return result;
}

/** Sub-pixel offset for sample `index`, in pixels, centred on the pixel (Halton 2,3). */
export function jitterOffset(index: number): [number, number] {
  return [halton(index + 1, 2) - 0.5, halton(index + 1, 3) - 0.5];
}

type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function context2d(canvas: ExportCanvas): Context2D | null {
  return canvas.getContext("2d", { willReadFrequently: true }) as Context2D | null;
}

export type SampleAverager = {
  add: (source: ExportCanvas) => void;
  resolve: () => ExportCanvas;
};

export function createSampleAverager(): SampleAverager {
  let sum: Float32Array | null = null;
  let width = 0;
  let height = 0;
  let count = 0;
  let scratch: ExportCanvas | null = null;

  /** GPU canvases have no 2D context; read them through a scratch copy. */
  const readPixels = (source: ExportCanvas): Uint8ClampedArray => {
    const direct = context2d(source);
    if (direct) return direct.getImageData(0, 0, source.width, source.height).data;
    if (!scratch || scratch.width !== source.width || scratch.height !== source.height) {
      scratch = makeCanvas(source.width, source.height);
    }
    const ctx = context2d(scratch)!;
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, source.width, source.height).data;
  };

  return {
    add(source) {
      const data = readPixels(source);
      if (!sum || source.width !== width || source.height !== height) {
        width = source.width;
        height = source.height;
        sum = new Float32Array(data.length);
        count = 0;
      }
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]! / 255;
        sum[i] += data[i]! * alpha;
        sum[i + 1] += data[i + 1]! * alpha;
        sum[i + 2] += data[i + 2]! * alpha;
        sum[i + 3] += alpha;
      }
      count += 1;
    },
    resolve() {
      const out = makeCanvas(width, height);
      const ctx = context2d(out)!;
      const image = ctx.createImageData(width, height);
      const pixels = image.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const coverage = sum![i + 3]!;
        pixels[i + 3] = Math.round((coverage / count) * 255);
        if (coverage <= 0) continue;
        pixels[i] = sum![i]! / coverage;
        pixels[i + 1] = sum![i + 1]! / coverage;
        pixels[i + 2] = sum![i + 2]! / coverage;
      }
      ctx.putImageData(image, 0, 0);
      return out;
    },
  };
}
