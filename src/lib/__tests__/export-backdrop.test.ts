import { describe, expect, it } from "vitest";
import {
  coverRect,
  isTransparentCssColor,
  linearGradientLine,
  parseCssBackdrop,
  splitTopLevel,
} from "@/lib/export-backdrop";

describe("parseCssBackdrop", () => {
  it("reads computed linear gradients (default 180deg omitted)", () => {
    expect(parseCssBackdrop("linear-gradient(rgb(255, 255, 255) 0%, rgb(238, 238, 238) 100%)", "rgba(0, 0, 0, 0)")).toEqual({
      kind: "linear-gradient",
      angleDeg: 180,
      stops: [
        { color: "rgb(255, 255, 255)", offset: 0 },
        { color: "rgb(238, 238, 238)", offset: 1 },
      ],
    });
  });

  it("reads angles, side keywords and evenly distributes missing offsets", () => {
    const deg = parseCssBackdrop("linear-gradient(90deg, rgb(1, 2, 3), rgb(4, 5, 6), rgb(7, 8, 9))", null);
    expect(deg).toMatchObject({ kind: "linear-gradient", angleDeg: 90 });
    expect(deg?.kind === "linear-gradient" && deg.stops.map((stop) => stop.offset)).toEqual([0, 0.5, 1]);
    expect(parseCssBackdrop("linear-gradient(to left, red, blue)", null)).toMatchObject({ angleDeg: 270 });
    expect(parseCssBackdrop("linear-gradient(0.25turn, red, blue)", null)).toMatchObject({ angleDeg: 90 });
  });

  it("reads radial gradients from ViewportBackground", () => {
    const radial = parseCssBackdrop("radial-gradient(circle at center center, rgb(250, 250, 250) 0%, rgb(200, 200, 200) 100%)", "");
    expect(radial).toEqual({
      kind: "radial-gradient",
      stops: [
        { color: "rgb(250, 250, 250)", offset: 0 },
        { color: "rgb(200, 200, 200)", offset: 1 },
      ],
    });
  });

  it("reads images and solid colours, ignores transparency", () => {
    expect(parseCssBackdrop('url("https://cdn.example/bg.jpg")', "rgb(10, 10, 10)")).toEqual({
      kind: "image",
      url: "https://cdn.example/bg.jpg",
      fallbackColor: "rgb(10, 10, 10)",
    });
    expect(parseCssBackdrop("none", "rgb(244, 242, 238)")).toEqual({ kind: "color", color: "rgb(244, 242, 238)" });
    expect(parseCssBackdrop("none", "rgba(0, 0, 0, 0)")).toBeNull();
    expect(parseCssBackdrop(null, "transparent")).toBeNull();
  });

  it("uses the first layer of multiple backgrounds", () => {
    const value = "linear-gradient(red, blue), url(\"a.png\")";
    expect(splitTopLevel(value)).toHaveLength(2);
    expect(parseCssBackdrop(value, null)).toMatchObject({ kind: "linear-gradient" });
  });
});

describe("gradient geometry", () => {
  it("matches CSS gradient-line length and direction", () => {
    const down = linearGradientLine(200, 100, 180);
    for (const [key, value] of Object.entries({ x0: 100, y0: 0, x1: 100, y1: 100 })) {
      expect(down[key as keyof typeof down]).toBeCloseTo(value, 9);
    }
    const diagonal = linearGradientLine(100, 100, 45);
    expect(diagonal.x1 - diagonal.x0).toBeCloseTo(100, 9);
    expect(diagonal.y0 - diagonal.y1).toBeCloseTo(100, 9);
  });

  it("covers and centres images", () => {
    expect(coverRect(200, 100, 100, 100)).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });

  it("detects transparent colours", () => {
    expect(isTransparentCssColor("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isTransparentCssColor("rgb(0 0 0 / 0)")).toBe(true);
    expect(isTransparentCssColor("#000")).toBe(false);
  });
});
