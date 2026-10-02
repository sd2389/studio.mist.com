import * as THREE from "three";
import { readViewportBackdrop, WHITE_BACKDROP, type ExportBackdrop } from "@/lib/export-backdrop";
import type { PersistedSlotTokens } from "@/lib/slot-materials/detect-slots";
import { getHiresRefs, pauseLiveRendering } from "@/stores/hires-export-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useOrbitControlsStore } from "@/stores/orbit-controls-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { assertCampaignPackAllowed, loadExportPlan } from "../../lib/export-plan";
import { sceneHasStudioSet } from "../../lib/stage-visibility";
import { buildPackDocuments } from "../domain/documents";
import { planCampaignPack } from "../domain/plan";
import type {
  CampaignPackConfig,
  PackBackground,
  PackIdentity,
  SavedPoseLike,
  Vec3,
} from "../domain/types";
import { probeMetalEnvironment } from "./environment-probe";
import { sceneHasTracedGems } from "./gem-scope";
import { createPackRenderBackend, type PackRenderBackend } from "./pack-backend";
import { runCampaignPack, type PackProgress, type PackRunResult } from "./runner";

export type StudioPackInput = {
  config: CampaignPackConfig;
  identity: PackIdentity;
  savedPoses: SavedPoseLike[];
  slotTokens?: PersistedSlotTokens;
  signal: AbortSignal;
  onProgress: (progress: PackProgress) => void;
};

export type ResolvedBackdrop = { backdrop: ExportBackdrop; label: string };

function describeBackdrop(backdrop: ExportBackdrop): string {
  if (backdrop.kind === "color") return backdrop.color;
  if (backdrop.kind === "image") return "scene image";
  return backdrop.kind === "linear-gradient" ? "scene linear gradient" : "scene radial gradient";
}

/** The studio's current background as a flat backdrop: solid colour, CSS gradient or image. */
export function readSceneBackdrop(): ExportBackdrop | null {
  const refs = getHiresRefs();
  if (!refs) return null;
  const background = refs.scene.background;
  if (background instanceof THREE.Color) return { kind: "color", color: `#${background.getHexString()}` };
  return readViewportBackdrop(refs.gl.domElement);
}

export type StudioLook = { backdrop: ExportBackdrop | null; hasStudioSet: boolean; hasTracedGems: boolean };

/** What the studio shows right now: backdrop, whether a styled set is on stage, traced gems. */
export function readStudioLook(): StudioLook {
  const scene = getHiresRefs()?.scene;
  return {
    backdrop: readSceneBackdrop(),
    hasStudioSet: sceneHasStudioSet(scene),
    hasTracedGems: sceneHasTracedGems(scene),
  };
}

export function resolvePackBackdrop(background: PackBackground): ResolvedBackdrop {
  if (background.kind === "custom") {
    return { backdrop: { kind: "color", color: background.color }, label: background.color.toUpperCase() };
  }
  if (background.kind === "scene") {
    const scene = readSceneBackdrop();
    if (scene) return { backdrop: scene, label: describeBackdrop(scene) };
  }
  return { backdrop: WHITE_BACKDROP, label: "#FFFFFF (white)" };
}

function orbitTarget(): Vec3 {
  const target = useOrbitControlsStore.getState().controls?.target;
  return target ? [target.x, target.y, target.z] : [0, 0, 0];
}

/**
 * Plans and renders a campaign pack against the live studio scene. The live viewport is
 * paused (not modified) for the duration; everything renders on one offscreen renderer.
 * Packs are a Grow and Studio feature: on any other plan this refuses before rendering.
 */
export async function runStudioCampaignPack(input: StudioPackInput): Promise<PackRunResult> {
  const exportPlan = await loadExportPlan();
  assertCampaignPackAllowed(exportPlan);
  const refs = getHiresRefs();
  if (!refs) throw new Error("Open a model first — the 3D scene must be loaded.");
  if (!(refs.camera instanceof THREE.PerspectiveCamera)) {
    throw new Error("Campaign packs need the studio's perspective camera.");
  }
  const plan = planCampaignPack(input.config, {
    identity: input.identity,
    savedPoses: input.savedPoses,
    hasTracedGems: sceneHasTracedGems(refs.scene),
  });
  if (plan.jobs.length === 0) throw new Error("Nothing to render — pick at least one metal and one output.");

  const { exposure, postfxConfig } = getRenderFidelity();
  const { backdrop, label } = resolvePackBackdrop(input.config.background);
  // Probe before pausing: the probe needs the live environment applicator to run.
  const environment = await probeMetalEnvironment(refs.scene);
  if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");

  const release = pauseLiveRendering();
  let backend: PackRenderBackend | null = null;
  try {
    backend = await createPackRenderBackend({
      gl: refs.gl,
      scene: refs.scene,
      camera: refs.camera,
      exposure,
      postfxConfig,
      orbitTarget: orbitTarget(),
      config: input.config,
      backdrop,
      sceneLook: input.config.background.kind === "scene",
      environment,
      finish: useMaterialPresetStore.getState().finish,
      slotTokens: input.slotTokens,
      limits: exportPlan,
    });
    const generatedAt = new Date();
    return await runCampaignPack({
      plan,
      backend,
      signal: input.signal,
      onProgress: input.onProgress,
      modifiedAt: generatedAt,
      buildDocuments: (files, failures) =>
        buildPackDocuments({
          plan,
          config: input.config,
          identity: input.identity,
          backgroundLabel: label,
          origin: window.location.origin,
          files,
          failures,
          generatedAt,
        }),
    });
  } finally {
    backend?.dispose();
    release();
  }
}
