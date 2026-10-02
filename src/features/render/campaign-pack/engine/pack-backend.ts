import type * as THREE from "three";
import { turntableAngle } from "@/lib/camera-orbit";
import { loadBackdropImage, type ExportBackdrop } from "@/lib/export-backdrop";
import type { ExportLimits } from "@/lib/export-limits";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { createOffscreenRenderSession, encodeCanvas } from "@/lib/offscreen-render";
import type { PersistedSlotTokens } from "@/lib/slot-materials/detect-slots";
import { createMp4FrameEncoder } from "@/lib/video-capture";
import type { ViewerPostFXConfig } from "@/lib/viewer-postfx-config";
import type { FinishId } from "@/stores/material-preset-store";
import { isOverheadAngle } from "../domain/angles";
import { isPackMetalPreset, PACK_LENS_FOV_DEG, packMetalLabel } from "../domain/defaults";
import { frameView } from "../domain/framing";
import type { CampaignPackConfig, PackMetalId, ScopeJob, SpinJob, StillJob, TurntableJob, Vec3 } from "../domain/types";
import {
  applyMetalSkin,
  collectMetalSkinTargets,
  createMetalSkinMaterial,
  type MetalEnvironment,
} from "./metal-skin";
import { createFrameSource } from "./frame-source";
import { collectTracedGems, createScopeSwitch } from "./gem-scope";
import { applyShotCamera, orbitShot, orbitShotCamera, stillCamera, type FramingContext, type OrbitShot } from "./pack-camera";
import { createStageControl } from "../../lib/stage-visibility";
import { sampleModelPoints } from "./scene-points";

/** Everything the runner needs from the GPU; swapped for a fake in tests. */
export type PackRenderBackend = {
  readonly notices: string[];
  setMetal(metal: PackMetalId): Promise<void>;
  renderStill(job: StillJob): Promise<{ jpg: Blob | null; png: Blob | null }>;
  renderSpinFrame(job: SpinJob, index: number): Promise<Blob>;
  renderTurntable(job: TurntableJob, onFrame: (index: number) => void, signal?: AbortSignal): Promise<Blob>;
  /** ASET false-colour image of the stones, top-down on white (PNG). */
  renderScope(job: ScopeJob): Promise<Blob>;
  dispose(): void;
};

export type PackBackendInput = {
  gl: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  exposure: number;
  postfxConfig: ViewerPostFXConfig;
  orbitTarget: Vec3;
  config: CampaignPackConfig;
  /** Clean background for JPGs, spin frames and videos (or behind a background-less scene). */
  backdrop: ExportBackdrop;
  /** Keep the studio set and scene background in opaque outputs. */
  sceneLook: boolean;
  environment: MetalEnvironment | null;
  finish: FinishId;
  slotTokens?: PersistedSlotTokens;
  /** The plan's cap and watermark, applied to every still, frame and video in the pack. */
  limits: ExportLimits;
};

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/**
 * One offscreen renderer (one GPU device, one PostFX pipeline) for the whole pack. Metals are
 * swapped on the export clone's metal meshes only; gem materials stay the shared live ones.
 */
export async function createPackRenderBackend(input: PackBackendInput): Promise<PackRenderBackend> {
  const { config, backdrop } = input;
  const session = await createOffscreenRenderSession({
    gl: input.gl,
    scene: input.scene,
    camera: input.camera,
    width: config.stillSize,
    height: config.stillSize,
    exposure: input.exposure,
    postfxConfig: input.postfxConfig,
    limits: input.limits,
  });
  const backdropImage = await loadBackdropImage(backdrop);
  const gems = collectTracedGems(session.scene);
  const frames = createFrameSource(session, createStageControl(session.scene), {
    sceneLook: input.sceneLook,
    contactShadow: config.contactShadow,
    backdrop,
    backdropImage,
    setGemScope: createScopeSwitch(gems),
  });
  const targets = collectMetalSkinTargets(session.scene, input.slotTokens);
  const materials = new Map<PackMetalId, THREE.Material>();
  const notices: string[] = [];
  const { x, y, z } = input.camera.position;
  const framing: FramingContext = {
    autoFrame: config.autoFrame,
    margin: config.marginPct / 100,
    bounds: sampleModelPoints(session.scene),
    orbitTarget: input.orbitTarget,
    livePosition: [x, y, z],
    liveFovDeg: input.camera.fov,
  };
  if (config.autoFrame && !framing.bounds) notices.push("No visible geometry to frame — used the studio camera.");
  let spin: { jobId: string; shot: OrbitShot } | null = null;

  return {
    notices,
    async setMetal(metal) {
      if (metal === "current") {
        applyMetalSkin(targets, null);
        return;
      }
      if (!isPackMetalPreset(metal)) throw new Error(`Unknown metal preset: ${metal}`);
      if (targets.length === 0 && !notices.some((n) => n.startsWith("No metal"))) {
        notices.push("No metal surfaces were detected on this model — metals render as configured.");
      }
      let material = materials.get(metal);
      if (!material) {
        material = createMetalSkinMaterial(metal, input.finish, input.environment);
        material.name = `CampaignPack-${packMetalLabel(metal)}`;
        materials.set(metal, material);
      }
      applyMetalSkin(targets, material);
    },
    async renderStill(job) {
      session.setSize(job.size, job.size);
      applyShotCamera(session.camera, stillCamera(job.angle, framing, 1));
      const { cutout, flat } = frames.still({
        cutout: Boolean(job.pngPath),
        flat: Boolean(job.jpgPath),
        contactShadow: !isOverheadAngle(job.angle),
      });
      // Encoders snapshot the 2D layers synchronously, before the next capture reuses them.
      const png = cutout ? encodeCanvas(cutout, "png") : null;
      const jpg = flat ? encodeCanvas(flat, "jpeg", config.jpegQuality) : null;
      return { png: png ? await png : null, jpg: jpg ? await jpg : null };
    },
    async renderSpinFrame(job, index) {
      if (!spin || spin.jobId !== job.id) {
        session.setSize(job.size, job.size);
        spin = { jobId: job.id, shot: orbitShot(framing, 1) };
      }
      const angle = turntableAngle(index, job.framePaths.length);
      applyShotCamera(session.camera, orbitShotCamera(spin.shot, angle));
      return encodeCanvas(frames.flat(0), "jpeg", config.jpegQuality);
    },
    async renderTurntable(job, onFrame, signal) {
      session.setSize(job.width, job.height);
      spin = null;
      const shot = orbitShot(framing, job.width / job.height);
      const setup = await createMp4FrameEncoder({ width: job.width, height: job.height, fps: job.fps });
      if (!setup.ok) throw new Error(setup.reason);
      try {
        for (let i = 0; i < job.frameCount; i++) {
          if (signal?.aborted) throw abortError();
          applyShotCamera(session.camera, orbitShotCamera(shot, turntableAngle(i, job.frameCount)));
          await setup.encoder.addFrame(frames.flat(i / job.fps), i);
          onFrame(i);
          if (i % 3 === 2) await nextTick();
        }
        return await setup.encoder.finish();
      } catch (error) {
        await setup.encoder.cancel();
        throw error;
      }
    },
    async renderScope(job) {
      if (gems.materials.length === 0) throw new Error("No ray-traced gems on this piece to scope.");
      session.setSize(job.size, job.size);
      spin = null;
      // Frame the stones, face-up: ASET reads the light return across the table.
      const stones = sampleModelPoints(session.scene, { include: (mesh) => gems.meshes.has(mesh) }) ?? framing.bounds;
      if (!stones) throw new Error("No visible stones to frame for the ASET scope.");
      const placement = frameView({
        points: stones.points,
        center: stones.center,
        direction: [0, 1, 0],
        fovYDeg: PACK_LENS_FOV_DEG,
        aspect: 1,
        margin: Math.max(framing.margin, 0.12),
      });
      applyShotCamera(session.camera, { ...placement, fovDeg: PACK_LENS_FOV_DEG });
      return encodeCanvas(frames.scope(), "png");
    },
    dispose() {
      session.dispose();
      for (const material of materials.values()) material.dispose();
      materials.clear();
    },
  };
}
