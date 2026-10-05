import { describe, expect, it } from "vitest";
import { jobRetryRequest } from "./render-job-requests";
import type { RenderJob } from "./render-jobs-api";

const VIEW = { view: { position: [0.62, 0.88, 2.25], target: [0, 0, 0] } };
const LOOK = { material: "platinum", lighting: "soft", scene_settings: { customBackground: { type: "image", asset_id: 41 } } };

function failedJob(job: Partial<RenderJob>): RenderJob {
  return {
    id: 4811,
    kind: "still",
    status: "failed",
    scene_id: 812,
    batch_id: null,
    spec: {},
    look: LOOK,
    variant_id: "variant-rose",
    name: "solitaire-4K",
    watermark: true,
    credits: 2,
    credit_state: "refunded",
    progress: 0.3,
    stage: null,
    attempts: 3,
    error: "The GPU was lost.",
    error_code: "gpu_lost",
    cancel_requested_at: null,
    outputs: [],
    created_at: "2026-10-03T14:02:11Z",
    started_at: "2026-10-03T14:02:14Z",
    finished_at: "2026-10-03T14:04:41Z",
    ...job,
  };
}

describe("jobRetryRequest", () => {
  it("asks for a still again with its look, variant and name, less the count and names the API added", () => {
    const job = failedJob({
      spec: { camera: VIEW, width: 3840, height: 2160, format: "png", jpeg_quality: 0.95, transparent: true, frames: 1, output_names: ["solitaire-4K.png"] },
    });

    expect(jobRetryRequest(job)).toEqual({
      kind: "still",
      scene_id: 812,
      variant_id: "variant-rose",
      look: LOOK,
      name: "solitaire-4K",
      spec: { camera: VIEW, width: 3840, height: 2160, format: "png", jpeg_quality: 0.95, transparent: true },
    });
  });

  it("drops an older job's outputs, and sends the nulls of a job that named no look", () => {
    const job = failedJob({
      kind: "angle_set",
      look: null,
      variant_id: null,
      name: null,
      spec: { cameras: [{ angle: "front", margin_pct: 8 }], width: 2000, height: 2000, frames: 1, outputs: ["ring-front.png"] },
    });

    expect(jobRetryRequest(job)).toEqual({
      kind: "angle_set",
      scene_id: 812,
      variant_id: null,
      look: null,
      name: null,
      spec: { cameras: [{ angle: "front", margin_pct: 8 }], width: 2000, height: 2000 },
    });
  });

  it("keeps a video's frames, which are its own setting", () => {
    const job = failedJob({ kind: "turntable", spec: { width: 1920, height: 1080, fps: 30, frames: 120, output_names: ["ring.mp4"] } });

    expect(jobRetryRequest(job)?.spec).toEqual({ width: 1920, height: 1080, fps: 30, frames: 120 });
  });

  it("is null for a job of no scene", () => {
    expect(jobRetryRequest(failedJob({ kind: "convert", scene_id: null }))).toBeNull();
  });
});
