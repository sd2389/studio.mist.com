import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { jobCameras, jobImageSize, readHarnessJob, type PayloadOfKind, type RenderJobPayload } from "./job-payload";

/** The export goldens' jobs: payloads as `GET /render-jobs/{id}/payload` returns them. */
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), `tests/goldens/fixtures/${name}.json`), "utf8"));
const STILL = fixture("export-still");
const TURNTABLE = fixture("export-turntable");
const SINK = { url: "http://127.0.0.1:41234", token: "f00d" };

function angleSet(overrides: Record<string, unknown> = {}) {
  const spec = {
    ...STILL.spec,
    cameras: [{ angle: "front" }, { pose: "pose-hero" }, { view: { position: [0.6, 0.9, 2.2], target: [0, 0, 0] } }],
    output_names: ["ring-front.png", "ring-hero.png", "ring-view.png"],
    ...overrides,
  };
  delete spec.camera;
  return { ...STILL, kind: "angle_set", spec };
}

function turntable(spec: Record<string, unknown>) {
  return { ...TURNTABLE, spec: { ...TURNTABLE.spec, ...spec } };
}

function spin(spec: Record<string, unknown> = {}) {
  return {
    ...STILL,
    kind: "spin",
    spec: { frames: 72, size: 1080, format: "jpeg", jpeg_quality: 0.9, transparent: false, ...spec },
  };
}

/** The payload of a still or an angle set; anything else fails the test. */
function imagesPayload(payload: RenderJobPayload): PayloadOfKind<"still" | "angle_set"> {
  if (payload.kind !== "still" && payload.kind !== "angle_set") throw new Error(`a ${payload.kind}, not images`);
  return payload;
}

describe("readHarnessJob", () => {
  it("reads the job the worker hands over, as the export golden does", () => {
    const job = readHarnessJob({ payload: STILL, sink: SINK });
    expect(job.sink).toEqual(SINK);
    expect(job.payload.kind).toBe("still");
    expect(job.payload.look.lighting).toBe("studio");
    expect(job.payload.look_items.backgrounds[0]?.slug).toBe("golden-dusk");
    expect(job.payload.limits.max_edge).toBe(4096);
    expect(jobCameras(imagesPayload(job.payload))).toEqual([{ angle: "three-quarter", margin_pct: 8 }]);
  });

  it("reads an angle set's cameras in the order of its file names", () => {
    const job = readHarnessJob({ payload: angleSet(), sink: SINK });
    const payload = imagesPayload(job.payload);
    expect(jobCameras(payload)).toEqual([
      { angle: "front" },
      { pose: "pose-hero" },
      { view: { position: [0.6, 0.9, 2.2], target: [0, 0, 0] } },
    ]);
    expect(payload.spec.output_names).toEqual(["ring-front.png", "ring-hero.png", "ring-view.png"]);
  });

  it("refuses kinds the export mode does not render", () => {
    expect(() => readHarnessJob({ payload: { ...STILL, kind: "campaign_pack" }, sink: SINK })).toThrow(/kind "campaign_pack"/);
  });

  it("needs a file name for every image", () => {
    expect(() => readHarnessJob({ payload: angleSet({ output_names: ["ring-front.png"] }), sink: SINK })).toThrow(/output_names/);
  });

  it("refuses cameras it cannot place", () => {
    const withCamera = (camera: unknown) => ({ ...STILL, spec: { ...STILL.spec, camera } });
    expect(() => readHarnessJob({ payload: withCamera({ angle: "diagonal" }), sink: SINK })).toThrow(/spec\.camera\.angle/);
    expect(() => readHarnessJob({ payload: withCamera({ view: { position: [0, 1], target: [0, 0, 0] } }), sink: SINK })).toThrow(
      /spec\.camera\.view/,
    );
    expect(() => readHarnessJob({ payload: withCamera({ pose: "" }), sink: SINK })).toThrow(/spec\.camera\.pose/);
  });

  it("refuses a look it could not draw", () => {
    const look = { ...STILL.look, lighting: "candlelight" };
    expect(() => readHarnessJob({ payload: { ...STILL, look }, sink: SINK })).toThrow(/look\.lighting/);
  });

  it("refuses a hand-off without the sink's address and token", () => {
    expect(() => readHarnessJob({ payload: STILL })).toThrow(/sink/);
    expect(() => readHarnessJob({ payload: STILL, sink: { url: SINK.url, token: "" } })).toThrow(/sink/);
    expect(() => readHarnessJob(undefined)).toThrow(/payload/);
  });
});

describe("readHarnessJob: turntables", () => {
  it("reads a turntable that orbits from the live view, as the frame-strip golden does", () => {
    const job = readHarnessJob({ payload: TURNTABLE, sink: SINK });
    expect(job.payload.kind).toBe("turntable");
    expect(job.payload.spec).toEqual({
      width: 160,
      height: 90,
      fps: 30,
      frames: 12,
      quality: "high",
      path: { orbit: { start: { view: { position: [0.62, 0.88, 2.25], target: [0, 0, 0] } } } },
    });
    expect(jobImageSize(job.payload)).toEqual({ width: 160, height: 90 });
  });

  it("orbits from any camera, or cuts through poses by id", () => {
    const read = (spec: Record<string, unknown>) => readHarnessJob({ payload: turntable(spec), sink: SINK }).payload.spec;
    expect(read({ path: { orbit: { start: { pose: "pose-hero" } } } })).toMatchObject({ path: { orbit: { start: { pose: "pose-hero" } } } });
    expect(read({ path: { orbit: { start: { angle: "side" } } } })).toMatchObject({ path: { orbit: { start: { angle: "side" } } } });
    expect(read({ path: { poses: ["pose-top", "pose-hero"] } })).toMatchObject({ path: { poses: ["pose-top", "pose-hero"] } });
  });

  it("refuses a turntable it could not time or move", () => {
    const read = (spec: Record<string, unknown>) => () => readHarnessJob({ payload: turntable(spec), sink: SINK });
    expect(read({ fps: 0 })).toThrow(/spec\.fps/);
    expect(read({ frames: 0 })).toThrow(/spec\.frames/);
    expect(read({ frames: 12.5 })).toThrow(/spec\.frames/);
    expect(read({ quality: "ultra" })).toThrow(/spec\.quality/);
    expect(read({ width: 0 })).toThrow(/spec\.width/);
    expect(read({ path: null })).toThrow(/spec\.path/);
    expect(read({ path: { poses: [] } })).toThrow(/spec\.path\.poses/);
    expect(read({ path: { poses: ["pose-top", ""] } })).toThrow(/spec\.path\.poses/);
    expect(read({ path: { orbit: { start: { angle: "diagonal" } } } })).toThrow(/spec\.path\.orbit\.start\.angle/);
  });
});

describe("readHarnessJob: spins", () => {
  it("reads a spin: square frames, encoded as the job asks", () => {
    const job = readHarnessJob({ payload: spin(), sink: SINK });
    expect(job.payload.kind).toBe("spin");
    expect(job.payload.spec).toEqual({ frames: 72, size: 1080, format: "jpeg", jpeg_quality: 0.9, transparent: false });
    expect(jobImageSize(job.payload)).toEqual({ width: 1080, height: 1080 });
  });

  it("refuses a spin without its frame count, size or encoding", () => {
    const read = (spec: Record<string, unknown>) => () => readHarnessJob({ payload: spin(spec), sink: SINK });
    expect(read({ frames: 0 })).toThrow(/spec\.frames/);
    expect(read({ size: -1 })).toThrow(/spec\.size/);
    expect(read({ format: "webp" })).toThrow(/spec\.format/);
    expect(read({ jpeg_quality: 2 })).toThrow(/spec\.jpeg_quality/);
  });
});
