import type { PersistedSlotTokens } from "@/lib/slot-materials/detect-slots";
import { createMp4FrameEncoder } from "@/lib/video-capture";
import { assertCampaignPackAllowed, loadExportPlan } from "../../lib/export-plan";
import { planCampaignPack } from "../domain/plan";
import type { CampaignPackConfig, PackIdentity, SavedPoseLike, TurntableJob } from "../domain/types";
import { PackZipWriter } from "../domain/zip-writer";
import { sceneHasTracedGems } from "./gem-scope";
import type { PackVideoEncoder } from "./pack-backend";
import type { PackProgress, PackRun } from "./runner";
import { liveOrbitTarget, readPackStage, renderPackOnStage } from "./stage-pack";

export type StudioPackInput = {
  config: CampaignPackConfig;
  identity: PackIdentity;
  savedPoses: SavedPoseLike[];
  slotTokens?: PersistedSlotTokens;
  signal: AbortSignal;
  onProgress: (progress: PackProgress) => void;
};

/** What the browser's pack hands its dialog: what it made, and the ZIP to download. */
export type PackRunResult = PackRun & { zip: Blob; zipName: string };

/** The browser's turntables: WebCodecs H.264, into an MP4 in memory. */
async function openBrowserMp4(job: TurntableJob): Promise<PackVideoEncoder> {
  const setup = await createMp4FrameEncoder({ width: job.width, height: job.height, fps: job.fps });
  if (!setup.ok) throw new Error(setup.reason);
  return setup.encoder;
}

/**
 * Plans and renders a campaign pack against the live studio scene, into one ZIP in memory. The
 * live viewport is paused (not modified) for the duration; everything renders on one offscreen
 * renderer. Packs are a Grow and Studio feature: on any other plan this refuses before rendering.
 */
export async function runStudioCampaignPack(input: StudioPackInput): Promise<PackRunResult> {
  const exportPlan = await loadExportPlan();
  assertCampaignPackAllowed(exportPlan);
  const stage = readPackStage();
  const plan = planCampaignPack(input.config, {
    identity: input.identity,
    savedPoses: input.savedPoses,
    hasTracedGems: sceneHasTracedGems(stage.scene),
  });
  if (plan.jobs.length === 0) throw new Error("Nothing to render — pick at least one metal and one output.");

  const generatedAt = new Date();
  const writer = new PackZipWriter(generatedAt);
  const run = await renderPackOnStage(stage, {
    plan,
    config: input.config,
    identity: input.identity,
    camera: stage.camera,
    orbitTarget: liveOrbitTarget(),
    slotTokens: input.slotTokens,
    limits: exportPlan,
    writer,
    openVideo: openBrowserMp4,
    origin: window.location.origin,
    generatedAt,
    signal: input.signal,
    onProgress: input.onProgress,
  });
  return { ...run, zip: writer.finish(), zipName: plan.zipName };
}
