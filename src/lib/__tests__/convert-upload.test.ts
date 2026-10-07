import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { inspectModelFromFile } from "@/lib/convert/to-glb";
import { convertParsedUpload } from "@/lib/upload/convert-upload";
import { layerRowsOf } from "@/lib/upload/layer-state";
import { buildParsedUpload, decimateParsedUpload } from "@/lib/upload/parsed-upload";
import { buildRingFixture } from "./fixtures/jewelry-fixtures";
import { toBinaryStl } from "./fixtures/mesh-writers";
import { installNodeFileReader } from "./fixtures/node-file-reader";

/**
 * Save's conversion, which the upload page and the render worker's convert mode both run
 * (ADR 0006): the reviewed layers into the model config, then the GLB and its thumbnail.
 */

beforeAll(installNodeFileReader);

afterEach(() => {
  vi.restoreAllMocks();
});

async function parsedRing(extraSlots: Record<string, string[]> = {}) {
  const file = new File([toBinaryStl(buildRingFixture().soup)], "ring.stl");
  const inspected = await inspectModelFromFile(file);
  Object.assign(inspected.loaded.slotTokens, extraSlots);
  return buildParsedUpload(file, inspected);
}

describe("convertParsedUpload", () => {
  it("saves the layers as reviewed, with the slots stamped on the GLB", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = await parsedRing();
    const converted = await convertParsedUpload(parsed, layerRowsOf(parsed.preloaded.root, parsed.modelConfig));

    expect(converted.modelConfig.slots.map((slot) => [slot.slotId, slot.kind])).toEqual([
      ["Accent 1", "accent"],
      ["Gem 1", "gem"],
      ["Metal 1", "metal"],
      ["Metal 2", "metal"],
    ]);
    expect(Object.keys(converted.modelConfig.slotTokens ?? {}).sort()).toEqual(["Accent 1", "Gem 1", "Metal 1", "Metal 2"]);
    expect(converted.slotSelections).toEqual({ "Accent 1": "diamond", "Gem 1": "diamond", "Metal 1": "gold-14k-yellow", "Metal 2": "gold-14k-yellow" });
    expect(converted.polygonCount).toBe(parsed.polyCount);
    expect(converted.glbFilename).toBe("ring.glb");
    expect(new TextDecoder().decode(new Uint8Array(await converted.glb.arrayBuffer()).subarray(0, 4))).toBe("glTF");
  });

  it("saves without a thumbnail it couldn't render, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = await parsedRing();
    // Node has no canvas to render the thumbnail on: the same as a browser whose GPU failed.
    const converted = await convertParsedUpload(parsed, layerRowsOf(parsed.preloaded.root, parsed.modelConfig));
    expect(converted.thumbnail).toBeNull();
    expect(converted.warnings).toEqual([expect.stringMatching(/^The thumbnail could not be rendered \(.+\), so the piece has none\.$/)]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("thumbnail failed"), expect.any(Error));
  });

  it("selects materials only for slots the model has: an empty layer gets none", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = await parsedRing({ "Gem 9": ["gem 9"] });
    expect(parsed.slotSelections["Gem 9"]).toBe("diamond");
    const converted = await convertParsedUpload(parsed, layerRowsOf(parsed.preloaded.root, parsed.modelConfig));
    expect(converted.modelConfig.slots.map((slot) => slot.slotId)).not.toContain("Gem 9");
    expect(Object.keys(converted.slotSelections)).not.toContain("Gem 9");
  });

  it("counts the model as decimated, as the upload page's Decimate button leaves it", async () => {
    const parsed = await parsedRing();
    const decimated = await decimateParsedUpload(parsed, Math.round(parsed.polyCount / 2));
    expect(decimated.polyCount).toBeLessThan(parsed.polyCount);
    expect(decimated.preloaded).toBe(parsed.preloaded);
    expect(decimated.modelConfig).toBe(parsed.modelConfig);
  });
});
