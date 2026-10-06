import * as THREE from "three";
import type { ExportLimits } from "@/lib/export-limits";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import type { PersistedSlotTokens } from "@/lib/slot-materials/detect-slots";
import { getHiresRefs, pauseLiveRendering } from "@/stores/hires-export-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useOrbitControlsStore } from "@/stores/orbit-controls-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { buildPackDocuments } from "../domain/documents";
import type { CampaignPackConfig, PackIdentity, PackPlan, TurntableJob, Vec3 } from "../domain/types";
import { probeMetalEnvironment } from "./environment-probe";
import { createPackRenderBackend, type PackRenderBackend, type PackVideoEncoder } from "./pack-backend";
import { runCampaignPack, type PackFileWriter, type PackProgress, type PackRun } from "./runner";
import { resolvePackBackdrop } from "./studio-look";

/** The loaded stage a pack renders from: the live renderer, its scene and its perspective camera. */
export type PackStage = { gl: ViewerRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera };

export function readPackStage(): PackStage {
  const refs = getHiresRefs();
  if (!refs) throw new Error("Open a model first — the 3D scene must be loaded.");
  if (!(refs.camera instanceof THREE.PerspectiveCamera)) {
    throw new Error("Campaign packs need the studio's perspective camera.");
  }
  return { gl: refs.gl, scene: refs.scene, camera: refs.camera };
}

/** What the live view orbits: the OrbitControls' target, or the origin before there are controls. */
export function liveOrbitTarget(): Vec3 {
  const target = useOrbitControlsStore.getState().controls?.target;
  return target ? [target.x, target.y, target.z] : [0, 0, 0];
}

export type StagePackInput = {
  plan: PackPlan;
  config: CampaignPackConfig;
  identity: PackIdentity;
  /** The studio camera: a pack that isn't auto-framed shoots from it, through its lens, orbiting `orbitTarget`. */
  camera: THREE.PerspectiveCamera;
  orbitTarget: Vec3;
  /** Slot tokens make metal re-skinning match the studio's slot detection. */
  slotTokens?: PersistedSlotTokens;
  /** The plan's cap and watermark, on every still, frame and video. */
  limits: ExportLimits;
  /** Where the files go, in the ZIP's order. */
  writer: PackFileWriter;
  openVideo: (job: TurntableJob) => Promise<PackVideoEncoder>;
  /** The studio's address, which the embed page and snippet point at. */
  origin: string;
  /** When the README and manifest say the pack was made. */
  generatedAt: Date;
  signal: AbortSignal;
  onProgress: (progress: PackProgress) => void;
  /**
   * Draws the live stage while the metal environment probe waits for frames, and returns what
   * stops it. The studio draws anyway; the render harness's stage draws only when it is told to.
   */
  keepStageTicking?: () => () => void;
  /**
   * Stop rather than re-skin metals without the studio's metal environment, which would leave
   * them without reflections: the server's pack, which must look as the studio's does.
   */
  requireEnvironment?: boolean;
};

/** A pack that puts a metal preset on the piece needs the environment the studio lights metals with. */
function reskinsMetals(plan: PackPlan): boolean {
  return plan.metals.some((metal) => metal.id !== "current");
}

/**
 * Renders a planned pack from the loaded stage, each file going to the writer as it is made: the
 * browser's ZIP or the render worker's sink. The live view is paused, not modified, for the
 * duration; everything renders on one offscreen renderer.
 */
export async function renderPackOnStage(stage: PackStage, input: StagePackInput): Promise<PackRun> {
  const { plan, config, identity, generatedAt } = input;
  const { exposure, postfxConfig } = getRenderFidelity();
  const { backdrop, label } = resolvePackBackdrop(config.background);
  // Probe before pausing: the probe needs the live environment applicator to run.
  const stopTicking = input.keepStageTicking?.();
  const environment = await probeMetalEnvironment(stage.scene).finally(() => stopTicking?.());
  input.signal.throwIfAborted();
  if (!environment && input.requireEnvironment && reskinsMetals(plan)) {
    throw new Error("The studio's metal environment never reached the pack: its metals would render without reflections.");
  }

  const release = pauseLiveRendering();
  let backend: PackRenderBackend | null = null;
  try {
    backend = await createPackRenderBackend({
      gl: stage.gl,
      scene: stage.scene,
      camera: input.camera,
      exposure,
      postfxConfig,
      orbitTarget: input.orbitTarget,
      config,
      backdrop,
      sceneLook: config.background.kind === "scene",
      environment,
      finish: useMaterialPresetStore.getState().finish,
      slotTokens: input.slotTokens,
      limits: input.limits,
      openVideo: input.openVideo,
    });
    return await runCampaignPack({
      plan,
      backend,
      writer: input.writer,
      signal: input.signal,
      onProgress: input.onProgress,
      buildDocuments: (files, failures) =>
        buildPackDocuments({ plan, config, identity, backgroundLabel: label, origin: input.origin, files, failures, generatedAt }),
    });
  } finally {
    backend?.dispose();
    release();
  }
}
