import { describe, expect, it } from "vitest";
import { unpremultiplyWithMatte } from "@/lib/export-compositing";

const px = (...values: number[]) => new Uint8ClampedArray(values);

describe("unpremultiplyWithMatte", () => {
  it("restores straight colour from a render over black and a coverage matte", () => {
    // Opaque subject, 50% edge, background with a bloom glow outside the silhouette.
    const color = px(200, 100, 50, 255, 100, 50, 25, 255, 40, 40, 40, 255);
    const matte = px(0, 0, 0, 255, 0, 0, 0, 128, 0, 0, 0, 0);
    unpremultiplyWithMatte(color, matte);
    expect([...color.slice(0, 4)]).toEqual([200, 100, 50, 255]);
    expect([...color.slice(4, 8)]).toEqual([199, 100, 50, 128]);
    expect([...color.slice(8, 12)]).toEqual([0, 0, 0, 0]);
  });

  it("clamps bright edge pixels instead of overflowing", () => {
    const color = px(250, 250, 250, 255);
    unpremultiplyWithMatte(color, px(0, 0, 0, 64));
    expect([...color]).toEqual([255, 255, 255, 64]);
  });
});
