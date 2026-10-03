import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { jobCameras, readHarnessJob } from "./job-payload";

/** The export golden's job: a payload as `GET /render-jobs/{id}/payload` returns it. */
const STILL = JSON.parse(readFileSync(path.join(process.cwd(), "tests/goldens/fixtures/export-still.json"), "utf8"));
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

describe("readHarnessJob", () => {
  it("reads the job the worker hands over, as the export golden does", () => {
    const job = readHarnessJob({ payload: STILL, sink: SINK });
    expect(job.sink).toEqual(SINK);
    expect(job.payload.kind).toBe("still");
    expect(job.payload.look.lighting).toBe("studio");
    expect(job.payload.look_items.backgrounds[0]?.slug).toBe("golden-dusk");
    expect(job.payload.limits.max_edge).toBe(4096);
    expect(jobCameras(job.payload)).toEqual([{ angle: "three-quarter", margin_pct: 8 }]);
  });

  it("reads an angle set's cameras in the order of its file names", () => {
    const job = readHarnessJob({ payload: angleSet(), sink: SINK });
    expect(jobCameras(job.payload)).toEqual([
      { angle: "front" },
      { pose: "pose-hero" },
      { view: { position: [0.6, 0.9, 2.2], target: [0, 0, 0] } },
    ]);
    expect(job.payload.spec.output_names).toEqual(["ring-front.png", "ring-hero.png", "ring-view.png"]);
  });

  it("refuses kinds the export mode does not render", () => {
    expect(() => readHarnessJob({ payload: { ...STILL, kind: "turntable" }, sink: SINK })).toThrow(/kind "turntable"/);
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
