import { resolveModelConfig, tickFixedClock } from "@/features/viewer";
import { VIEWER_FOV_DEG } from "@/lib/viewer-scene";
import { planCampaignPack } from "../campaign-pack/domain/plan";
import type { PackIdentity, Vec3 } from "../campaign-pack/domain/types";
import { sceneHasTracedGems } from "../campaign-pack/engine/gem-scope";
import type { PackProgress } from "../campaign-pack/engine/runner";
import { liveOrbitTarget, readPackStage, renderPackOnStage, type PackStage } from "../campaign-pack/engine/stage-pack";
import type { CampaignPackSpec, PackEntry, PayloadOfKind, RenderJobPayload } from "./job-payload";
import { createPackSink } from "./pack-sink";
import type { SinkClient } from "./sink-client";

/** How often at most the page tells the worker how far the pack has got; its heartbeats go every 20 s. */
const PROGRESS_EVERY_MS = 1000;

/** Who the pack is for, as the studio's dialog names it: the scene's SKU and name, and its viewer id. */
function packIdentity(scene: RenderJobPayload["scene"]): PackIdentity {
  return { modelId: scene.viewer_id, sku: scene.sku, name: scene.name };
}

/**
 * The studio camera a pack that isn't auto-framed shoots from: the job's view through the viewer's
 * lens, orbiting its target, or the stage's own camera without one.
 */
function studioCamera(stage: PackStage, view: CampaignPackSpec["view"]) {
  if (!view) return { camera: stage.camera, orbitTarget: liveOrbitTarget() };
  const camera = stage.camera.clone();
  camera.fov = VIEWER_FOV_DEG;
  camera.position.set(...view.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...view.target);
  camera.updateProjectionMatrix();
  return { camera, orbitTarget: [...view.target] as Vec3 };
}

/**
 * The pack's progress, for the worker's heartbeats: at most once a second, and its end. A report
 * that fails is let go; the next file or frame stops the pack if the sink has gone.
 */
function reportProgress(sink: SinkClient): (progress: PackProgress) => void {
  let reportedAt = -Infinity;
  return ({ fraction }) => {
    const now = performance.now();
    if (fraction < 1 && now - reportedAt < PROGRESS_EVERY_MS) return;
    reportedAt = now;
    sink.postProgress(fraction, "rendering").catch(() => {});
  };
}

/**
 * Renders a Campaign Pack from the loaded, warmed-up stage, as the studio's pack renders it (ADR
 * 0005, D2): the pack's own plan, names, metal re-skins, cameras and documents, each file going to
 * the sink as it is made and each turntable as raw frames, for the worker to put in the ZIP. The
 * stage draws on the fixed clock from `firstFrame` while the metal environment probe waits, as the
 * studio's live loop draws for it; without that, re-skinned metals would render without
 * reflections. Resolves with the ZIP's entries, in order.
 */
export async function renderCampaignPack(
  payload: PayloadOfKind<"campaign_pack">,
  sink: SinkClient,
  { firstFrame }: { firstFrame: number },
): Promise<PackEntry[]> {
  const stage = readPackStage();
  const { view, ...config } = payload.spec;
  const identity = packIdentity(payload.scene);
  const plan = planCampaignPack(config, {
    identity,
    savedPoses: payload.look.scene_settings.poses ?? [],
    hasTracedGems: sceneHasTracedGems(stage.scene),
  });
  if (plan.jobs.length === 0) throw new Error("invalid render job: the pack makes nothing this piece can render");
  const stopped = new AbortController();
  const files = createPackSink(sink, (reason) => stopped.abort(reason));
  const { camera, orbitTarget } = studioCamera(stage, view);
  await renderPackOnStage(stage, {
    plan,
    config,
    identity,
    camera,
    orbitTarget,
    slotTokens: resolveModelConfig(payload.look).slotTokens,
    // The API checked the pack against the owner's plan and decided the mark when it made the job.
    limits: { maxEdge: payload.limits.max_edge, watermark: payload.watermark },
    writer: files,
    openVideo: (job) => files.openVideo(job),
    origin: payload.app_url,
    generatedAt: new Date(),
    signal: stopped.signal,
    onProgress: reportProgress(sink),
    keepStageTicking: () => tickFixedClock(firstFrame),
    requireEnvironment: true,
  });
  return files.entries;
}
