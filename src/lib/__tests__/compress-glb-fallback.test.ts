import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { convertUploadToGlb } from "@/lib/convert/to-glb";
import { buildRingFixture } from "./fixtures/jewelry-fixtures";
import { toBinaryStl } from "./fixtures/mesh-writers";
import { installNodeFileReader } from "./fixtures/node-file-reader";

vi.mock("@/lib/convert/compress-glb.client", () => ({
  compressGlbBuffer: vi.fn(async () => {
    throw new Error("codec failed to load");
  }),
}));

beforeAll(installNodeFileReader);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("convertUploadToGlb when compression fails", () => {
  it("keeps the uncompressed GLB and logs a warning", async () => {
    vi.stubGlobal("window", globalThis); // compression only runs in a browser
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = new File([toBinaryStl(buildRingFixture().soup)], "ring.stl");

    const converted = await convertUploadToGlb(file, { generateThumbnail: false });

    const glb = new Uint8Array(await converted.glb.arrayBuffer());
    expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe("glTF");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("compression failed"), expect.any(Error));
  });
});
