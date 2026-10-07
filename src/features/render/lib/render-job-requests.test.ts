import { describe, expect, it } from "vitest";
import type { LookSnapshot } from "@/features/viewer";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "../campaign-pack/domain/defaults";
import { DEFAULT_STILL_EXPORT } from "../ui/StillExportSettings";
import {
  campaignPackJobRequest,
  campaignPackJobSpec,
  jobRetryRequest,
  orbitPath,
  posesPath,
  quickStillSpec,
  stillJobRequest,
  stillJobSpec,
  turntableJobRequest,
  turntableJobSpec,
} from "./render-job-requests";
import type { RenderJob, RenderJobCamera } from "./render-jobs-api";

const VIEW = { view: { position: [0.62, 0.88, 2.25], target: [0, 0, 0] } };
const LIVE_VIEW: RenderJobCamera = { view: { position: [0.62, 0.88, 2.25], target: [0, 0, 0] } };

describe("stillJobSpec", () => {
  it("takes the size from the resolution and aspect picked, as the browser export did", () => {
    expect(stillJobSpec(DEFAULT_STILL_EXPORT, LIVE_VIEW)).toEqual({
      camera: LIVE_VIEW,
      width: 3840,
      height: 2160,
      format: "png",
      jpeg_quality: 0.95,
      transparent: false,
    });
    expect(stillJobSpec({ ...DEFAULT_STILL_EXPORT, resolution: "2k", aspect: "1:1" }, LIVE_VIEW)).toMatchObject({
      width: 1440,
      height: 1440,
    });
    expect(stillJobSpec({ ...DEFAULT_STILL_EXPORT, resolution: "hd", aspect: "4:3" }, LIVE_VIEW)).toMatchObject({
      width: 960,
      height: 720,
    });
  });

  it("keeps a JPEG's quality within the 0.8 to 1 a job takes", () => {
    const jpeg = { ...DEFAULT_STILL_EXPORT, format: "jpeg" as const, transparent: true };

    expect(stillJobSpec({ ...jpeg, jpegQuality: 0.7 }, LIVE_VIEW)).toMatchObject({ format: "jpeg", jpeg_quality: 0.8, transparent: true });
    expect(stillJobSpec({ ...jpeg, jpegQuality: 0.88 }, LIVE_VIEW).jpeg_quality).toBe(0.88);
  });
});

describe("quickStillSpec", () => {
  it("is a PNG of the viewport's aspect ratio, 2048 px on its longest side", () => {
    expect(quickStillSpec({ width: 1600, height: 900 }, LIVE_VIEW)).toEqual({
      camera: LIVE_VIEW,
      width: 2048,
      height: 1152,
      format: "png",
      transparent: false,
    });
    expect(quickStillSpec({ width: 750, height: 1334 }, LIVE_VIEW)).toMatchObject({ width: 1151, height: 2048 });
    expect(quickStillSpec({ width: 1024, height: 1024 }, LIVE_VIEW)).toMatchObject({ width: 2048, height: 2048 });
  });

  it("stays within what a job renders, however narrow or unready the viewport", () => {
    expect(quickStillSpec({ width: 4000, height: 20 }, LIVE_VIEW)).toMatchObject({ width: 2048, height: 64 });
    expect(quickStillSpec({ width: 0, height: 0 }, LIVE_VIEW)).toMatchObject({ width: 2048, height: 2048 });
  });
});

describe("stillJobRequest", () => {
  const spec = stillJobSpec(DEFAULT_STILL_EXPORT, LIVE_VIEW);
  const look = { material: "platinum", lighting: "studio" } as LookSnapshot;

  it("sends the studio's look for its own scene", () => {
    expect(stillJobRequest(spec, { sceneId: 812, look, name: "ring-4K-16x9" })).toEqual({
      kind: "still",
      scene_id: 812,
      variant_id: null,
      look,
      name: "ring-4K-16x9",
      spec,
    });
  });

  it("names a saved variant without a look, for the API to read", () => {
    expect(stillJobRequest(spec, { sceneId: 913, variantId: "variant-pt", name: "halo-platinum-4K" })).toMatchObject({
      scene_id: 913,
      variant_id: "variant-pt",
      look: null,
    });
  });
});
describe("turntableJobSpec", () => {
  const settings = { width: 1920, height: 1080, fps: 30, frames: 120, quality: "high" as const };

  it("orbits once round the live view's target from the view itself, at the size, rate, length and quality picked", () => {
    expect(turntableJobSpec(settings, orbitPath(LIVE_VIEW))).toEqual({
      width: 1920,
      height: 1080,
      fps: 30,
      frames: 120,
      quality: "high",
      path: { orbit: { start: LIVE_VIEW } },
    });
  });

  it("cuts through the poses by id, in the order the studio lists them", () => {
    const poses = [{ id: "pose-top" }, { id: "pose-right" }, { id: "pose-default" }, { id: "pose-left" }, { id: "pose-lxk2" }];

    expect(turntableJobSpec({ ...settings, quality: "max" }, posesPath(poses))).toMatchObject({
      quality: "max",
      path: { poses: ["pose-top", "pose-right", "pose-default", "pose-left", "pose-lxk2"] },
    });
  });

  it("keeps the frame even both ways, as H.264's 4:2:0 chroma needs", () => {
    expect(turntableJobSpec({ ...settings, width: 1081, height: 607 }, orbitPath(LIVE_VIEW))).toMatchObject({ width: 1080, height: 606 });
  });
});

describe("turntableJobRequest", () => {
  const spec = turntableJobSpec({ width: 3840, height: 2160, fps: 24, frames: 240, quality: "standard" }, orbitPath(LIVE_VIEW));

  it("sends the studio's look for its own scene, or names a saved variant for the API to read", () => {
    const look = { material: "platinum", lighting: "studio" } as LookSnapshot;

    expect(turntableJobRequest(spec, { sceneId: 812, look, name: "ring-360" })).toEqual({
      kind: "turntable",
      scene_id: 812,
      variant_id: null,
      look,
      name: "ring-360",
      spec,
    });
    expect(turntableJobRequest(spec, { sceneId: 913, variantId: "variant-pt", name: "halo-platinum-360" })).toMatchObject({
      kind: "turntable",
      scene_id: 913,
      variant_id: "variant-pt",
      look: null,
    });
  });
});

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

describe("campaignPackJobSpec", () => {
  const view = { position: [1.2, 0.6, 1.8] as [number, number, number], target: [0, 0.1, 0] as [number, number, number] };

  it("is the dialog's config, the ASET image only where there are traced gems to draw it from", () => {
    expect(campaignPackJobSpec(DEFAULT_CAMPAIGN_PACK_CONFIG, { hasTracedGems: true, view })).toEqual(DEFAULT_CAMPAIGN_PACK_CONFIG);
    expect(campaignPackJobSpec(DEFAULT_CAMPAIGN_PACK_CONFIG, { hasTracedGems: false, view })).toEqual({ ...DEFAULT_CAMPAIGN_PACK_CONFIG, cutScope: false });
  });

  it("carries the studio camera a pack that isn't auto-framed shoots from", () => {
    const manual = { ...DEFAULT_CAMPAIGN_PACK_CONFIG, autoFrame: false };
    expect(campaignPackJobSpec(manual, { hasTracedGems: true, view })).toEqual({ ...manual, view });
    expect(campaignPackJobSpec(manual, { hasTracedGems: true, view: null })).toEqual(manual);
  });

  it("asks for the pack of the scene in the studio's look, named after its root folder", () => {
    const look = { material: "platinum" } as unknown as LookSnapshot;
    expect(campaignPackJobRequest(DEFAULT_CAMPAIGN_PACK_CONFIG, { sceneId: 812, look, name: "RING-1" })).toEqual({
      kind: "campaign_pack",
      scene_id: 812,
      variant_id: null,
      look,
      name: "RING-1",
      spec: DEFAULT_CAMPAIGN_PACK_CONFIG,
    });
  });
});

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

  it("asks for a Campaign Pack again as its config, less the count the API made of every image and frame", () => {
    const job = failedJob({ kind: "campaign_pack", name: "RING-1", spec: { ...DEFAULT_CAMPAIGN_PACK_CONFIG, frames: 2041, output_names: ["RING-1_campaign-pack.zip"] } });

    expect(jobRetryRequest(job)).toMatchObject({ kind: "campaign_pack", name: "RING-1", spec: DEFAULT_CAMPAIGN_PACK_CONFIG });
    expect(jobRetryRequest(job)?.spec).not.toHaveProperty("frames");
  });

  it("is null for a job of no scene", () => {
    expect(jobRetryRequest(failedJob({ kind: "convert", scene_id: null }))).toBeNull();
  });
});
