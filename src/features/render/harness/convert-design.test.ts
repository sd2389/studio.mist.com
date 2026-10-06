import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installNodeFileReader } from "@/lib/__tests__/fixtures/node-file-reader";
import { convertDesign, type DesignFiles } from "./convert-design";
import { ConvertFailure, type ConvertSpec } from "./convert-job";

/**
 * The convert mode's pipeline on the committed fixtures (tests/convert/), in Node: the upload
 * page's own steps, with the choices a person makes there made by the job's spec. Node has no
 * canvas, so every thumbnail here fails, as one would on a browser whose GPU did.
 */

const fixture = (name: string) => new File([readFileSync(path.join(process.cwd(), "tests/convert", name))], name);
const ring = (): DesignFiles => ({ source: fixture("ring.obj"), companions: [fixture("ring.mtl")] });
const THUMBNAIL_WARNING = expect.stringMatching(/^The thumbnail could not be rendered/);
/** The fixture ring: a band of 384 triangles and a stone of 46. */
const RING_TRIANGLES = 430;
const STONE_TRIANGLES = 46;

const spec = (fields: Partial<ConvertSpec> = {}): ConvertSpec => ({
  source: { filename: "ring.obj", bytes: 1 },
  companions: [],
  units: "auto",
  max_polygons: 100_000,
  decimate: "auto",
  thumbnail: { size: 512, format: "webp" },
  ...fields,
});

async function failureOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    if (error instanceof ConvertFailure) return `${error.code}: ${error.message}`;
    throw error;
  }
  return "converted";
}

beforeAll(installNodeFileReader);

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("convertDesign", () => {
  it("makes the GLB, and conversion.json with each slot's role, its size and what it assumed", async () => {
    const progress: number[] = [];
    const design = await convertDesign(ring(), spec(), (value) => void progress.push(value));

    expect(new TextDecoder().decode(new Uint8Array(await design.glb.arrayBuffer()).subarray(0, 4))).toBe("glTF");
    expect(design.thumbnail).toBeNull();
    const { report } = design;
    expect(Object.keys(report).sort()).toEqual(["model_config", "polygon_count", "roles", "slot_selections", "units", "warnings"]);
    expect(report.model_config.slots.map((slot) => [slot.slotId, slot.kind])).toEqual([["Gem 1", "gem"], ["Metal 1", "metal"]]);
    expect(report.slot_selections).toEqual({ "Gem 1": "diamond", "Metal 1": "gold-14k-yellow" });
    expect(report.roles).toEqual({ "Gem 1": "gem", "Metal 1": "metal" });
    expect(report.polygon_count).toBe(RING_TRIANGLES);
    expect(report.units).toEqual({ mm_per_unit: 1, source: "assumed", size_mm: [20.2, 24.473, 6.5] });
    expect(report.warnings).toEqual(["The file's unit was taken to be millimetres: it is 20.2 × 24.5 × 6.5 mm.", THUMBNAIL_WARNING]);
    expect(progress).toEqual([0.3, 0.5]);
  });

  it("sizes a unitless file in the unit its batch gives", async () => {
    const files = { source: fixture("ring-cm.stl"), companions: [] };
    const guessed = await convertDesign(files, spec({ source: { filename: "ring-cm.stl", bytes: 1 } }));
    expect(guessed.report.units).toMatchObject({ mm_per_unit: 1, source: "assumed", size_mm: [2.02, 2.447, 0.65] });
    const given = await convertDesign({ source: fixture("ring-cm.stl"), companions: [] }, spec({ units: "cm" }));
    expect(given.report.units).toEqual({ mm_per_unit: 10, source: "override", size_mm: [20.2, 24.473, 6.5] });
    expect(given.report.warnings).toEqual([THUMBNAIL_WARNING]);
  });

  it("decimates metal down to the cap, the stones as they were, and says so", async () => {
    const cap = 300;
    const { report } = await convertDesign(ring(), spec({ max_polygons: cap }));
    expect(report.polygon_count).toBeLessThanOrEqual(cap);
    expect(report.polygon_count).toBeGreaterThan(STONE_TRIANGLES);
    expect(report.warnings).toContain(`Metal was simplified from ${RING_TRIANGLES} to ${report.polygon_count} triangles to fit the plan's ${cap}.`);
    expect(report.roles).toEqual({ "Gem 1": "gem", "Metal 1": "metal" });
  });

  it("fails a design over the cap that its stones alone keep there, or that may not be decimated", async () => {
    expect(await failureOf(convertDesign(ring(), spec({ max_polygons: STONE_TRIANGLES - 6 })))).toMatch(
      /^over_polygon_cap: The design has 430 triangles, more than the plan's 40, and simplifying its metal brought it only to \d+: its stones/,
    );
    expect(await failureOf(convertDesign(ring(), spec({ max_polygons: 300, decimate: "fail" })))).toBe(
      "over_polygon_cap: The design has 430 triangles, more than the plan's 300, and its batch doesn't decimate.",
    );
  });

  it("converts a GLB too, its roles taken from its slot names when its meshes give none", async () => {
    const glb = new File([readFileSync(path.join(process.cwd(), "backend/scripts/fixtures/demo-embed-ring.glb"))], "demo-ring.glb");
    const { report } = await convertDesign({ source: glb, companions: [] }, spec({ source: { filename: "demo-ring.glb", bytes: 1 } }));
    expect(report.roles).toEqual({ "Gem 1": "gem", "Metal 1": "metal" });
    expect(report.warnings).toEqual(expect.arrayContaining([
      'No mesh in slot "Gem 1" says what it is: taken as gem from the slot\'s name.',
      'No mesh in slot "Metal 1" says what it is: taken as metal from the slot\'s name.',
    ]));
  });

  it("fails a file it can't read as unreadable, and a thumbnail it doesn't make as an invalid spec", async () => {
    const pointCloud = new File(["ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n"], "cloud.ply");
    expect(await failureOf(convertDesign({ source: pointCloud, companions: [] }, spec()))).toMatch(/^model_unreadable: /);
    expect(await failureOf(convertDesign(ring(), spec({ thumbnail: { size: 256, format: "webp" } })))).toMatch(/^invalid_spec: /);
  });
});
