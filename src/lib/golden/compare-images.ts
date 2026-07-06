import { ssim } from "ssim.js";

export type DecodedImage = { data: Uint8ClampedArray; width: number; height: number };

/** Structural similarity between two same-sized RGBA images, 0..1. */
export function compareImages(a: DecodedImage, b: DecodedImage): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const { mssim } = ssim(
    { data: a.data, width: a.width, height: a.height },
    { data: b.data, width: b.width, height: b.height },
  );
  return mssim;
}
