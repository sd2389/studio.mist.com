import { describe, expect, it } from "vitest";
import { ConvertFailure, readConvertJob } from "./convert-job";

/** A convert job as the worker hands it over: the API's normalised spec (normalised_convert_spec) and its limits. */
const SPEC = {
  item_id: 9001,
  source: { key: "customers/7/ingest/31/9001/R-1001.obj", filename: "R-1001.obj", bytes: 4_200 },
  companions: [{ key: "customers/7/ingest/31/9001/R-1001.mtl", filename: "R-1001.mtl", bytes: 120 }],
  units: "cm",
  max_polygons: 2_000_000,
  decimate: "auto",
  thumbnail: { size: 512, format: "webp" },
  scene: { sku: "R-1001", name: "R-1001", category: "Ring", note: null },
  output_names: ["model.glb", "thumbnail.webp", "conversion.json"],
};
const handOff = (spec: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) => ({
  payload: { kind: "convert", spec: { ...SPEC, ...spec }, limits: { max_edge: 512, max_runtime_seconds: 600 }, ...payload },
  sink: { url: "http://127.0.0.1:41234", token: "f00d" },
});

describe("readConvertJob", () => {
  it("reads what the page converts from: the design's files by name, its unit, the cap and the thumbnail", () => {
    expect(readConvertJob(handOff())).toEqual({
      payload: {
        kind: "convert",
        spec: {
          source: { filename: "R-1001.obj", bytes: 4_200 },
          companions: [{ filename: "R-1001.mtl", bytes: 120 }],
          units: "cm",
          max_polygons: 2_000_000,
          decimate: "auto",
          thumbnail: { size: 512, format: "webp" },
        },
        limits: { max_edge: 512, max_runtime_seconds: 600 },
      },
      sink: { url: "http://127.0.0.1:41234", token: "f00d" },
    });
  });

  it("refuses a hand-off it can't convert from, as an invalid spec", () => {
    const refused = (raw: unknown) => {
      try {
        readConvertJob(raw);
      } catch (error) {
        return error instanceof ConvertFailure ? `${error.code}: ${error.message}` : String(error);
      }
      return "read";
    };
    expect(refused(handOff({}, { kind: "still" }))).toMatch(/^invalid_spec: invalid convert job: kind "still"/);
    expect(refused(handOff({ units: "ft" }))).toBe("invalid_spec: invalid convert job: spec.units");
    expect(refused(handOff({ max_polygons: 0 }))).toBe("invalid_spec: invalid convert job: spec.max_polygons");
    expect(refused(handOff({ decimate: "maybe" }))).toBe("invalid_spec: invalid convert job: spec.decimate");
    expect(refused(handOff({ source: { filename: "", bytes: 1 } }))).toBe("invalid_spec: invalid convert job: spec.source.filename");
    expect(refused(handOff({ companions: [{ filename: "a.mtl", bytes: 0 }] }))).toBe("invalid_spec: invalid convert job: spec.companions[0].bytes");
    expect(refused(handOff({ thumbnail: { size: 512, format: "png" } }))).toBe("invalid_spec: invalid convert job: spec.thumbnail");
    expect(refused(handOff({ output_names: ["model.glb", "conversion.json"] }))).toBe("invalid_spec: invalid convert job: spec.output_names");
    expect(refused({ ...handOff(), sink: { url: "http://127.0.0.1:1" } })).toMatch(/invalid render job: sink/);
  });
});
