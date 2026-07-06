import { describe, expect, it } from "vitest";
import { compareImages, type DecodedImage } from "@/lib/golden/compare-images";

function solid(width: number, height: number, rgba: [number, number, number, number]): DecodedImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0]; data[i + 1] = rgba[1]; data[i + 2] = rgba[2]; data[i + 3] = rgba[3];
  }
  return { data, width, height };
}

describe("compareImages", () => {
  it("identical images → SSIM 1", () => {
    const a = solid(64, 64, [200, 180, 90, 255]);
    expect(compareImages(a, solid(64, 64, [200, 180, 90, 255]))).toBeCloseTo(1, 5);
  });
  it("very different images → low SSIM", () => {
    const a = solid(64, 64, [255, 255, 255, 255]);
    const b = solid(64, 64, [0, 0, 0, 255]);
    expect(compareImages(a, b)).toBeLessThan(0.5);
  });
  it("throws on dimension mismatch", () => {
    expect(() => compareImages(solid(64, 64, [0, 0, 0, 255]), solid(32, 32, [0, 0, 0, 255]))).toThrow(/dimensions/);
  });
});
