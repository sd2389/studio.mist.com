import { describe, expect, it } from "vitest";
import type { Scene } from "@/features/scene";
import { buildEmbedUrl } from "@/lib/embed-settings";
import { embedHref } from "./scene-display";

const scene = (sku: string | null) => ({ model_key: "customers/1/models/ring.glb", sku }) as Scene;

describe("embedHref", () => {
  it("opens the published piece by its SKU, the same link the studio hands out", () => {
    expect(embedHref(scene(" RING 1 "))).toBe("/embed/RING%201");
    expect(buildEmbedUrl("https://studio.example", "RING 1")).toBe(`https://studio.example${embedHref(scene("RING 1"))}`);
  });

  it("offers no embed until a SKU publishes the piece", () => {
    expect(embedHref(scene(null))).toBeNull();
    expect(embedHref(scene("  "))).toBeNull();
  });
});
