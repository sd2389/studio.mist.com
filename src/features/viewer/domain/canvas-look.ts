import {
  backgroundColorForCanvas,
  groundParamsFromItem,
  resolveEnvironmentUrl,
} from "@/lib/catalog/scene-appearance";
import type { BackgroundItem, EnvironmentItem, GroundItem } from "@/lib/catalog/types";
import type { GemStudioPreset } from "@/lib/gem-gpu/gem-studio-environment";
import type { SceneSettingsBuckets } from "@/lib/slot-materials/model-config";
import { resolveSourceAssetUrl } from "@/lib/source-catalog";
import { LIGHTING_PRESETS } from "@/lib/viewer-lighting";
import { degreesToRadians, envIntensityMultiplier, envRotationDegrees } from "@/lib/viewer-scene";
import { resolveSceneSetup, sceneSetupBackground, type SceneSetup } from "@/features/scene-setups";
import type { LightingPresetId } from "@/stores/material-preset-store";

export type CanvasLookInput = {
  lighting: LightingPresetId;
  sceneSettings?: SceneSettingsBuckets;
  metalEnvironment: EnvironmentItem | null;
  gemEnvironment: EnvironmentItem | null;
  backgroundItem: BackgroundItem | null;
  groundItem: GroundItem | null;
};

export type CanvasLook = {
  photometric: boolean;
  metal: { file: string; rotation: number; intensity: number };
  /** `file: null` lights gems with the procedural jewelry tent. */
  gem: { file: string | null; tent: GemStudioPreset; rotation: number; intensity: number };
  /** Canvas clear colour; `null` leaves the canvas transparent over a CSS backdrop. */
  background: string | null;
  /** Colour reflective floors dissolve into when the canvas itself is transparent. */
  floorBackground: string;
  ambient: number;
  spot: number;
  exposure: number;
  stage: SceneSetup;
};

type EnvironmentKind = "metal" | "gem";

function environmentPose(input: CanvasLookInput, kind: EnvironmentKind, item: EnvironmentItem | null) {
  const advanced = input.sceneSettings?.advanced;
  return {
    rotation: degreesToRadians(envRotationDegrees(advanced, kind, item?.default_rotation ?? 0)),
    intensity: envIntensityMultiplier(advanced, kind, item?.default_intensity ?? 1),
  };
}

/** Catalog item first, then a legacy slug on the scene, then (metals only) the lighting preset's HDR. */
function environmentFile(input: CanvasLookInput, kind: EnvironmentKind): string | null {
  const item = kind === "metal" ? input.metalEnvironment : input.gemEnvironment;
  const legacy = input.sceneSettings?.[kind === "metal" ? "ENVIRONMENT-METAL" : "ENVIRONMENT-GEM"];
  const presetHdr = LIGHTING_PRESETS[input.lighting].hdr;
  if (item) return resolveEnvironmentUrl(item, presetHdr);
  if (legacy) return resolveSourceAssetUrl(legacy);
  // Gems default to the procedural jewelry tent rather than any HDR file.
  return kind === "metal" ? presetHdr : null;
}

function contactShadowOpacity(input: CanvasLookInput): number {
  const ground = groundParamsFromItem(input.groundItem);
  const legacyGroundNone = input.sceneSettings?.GROUND?.toLowerCase().includes("none");
  return !ground.enabled || legacyGroundNone ? 0 : ground.opacity;
}

/**
 * Everything the viewer canvas needs to light and dress a piece, resolved from the saved
 * look: environments, backdrop, lights, exposure and the studio set. A chosen studio scene
 * brings its own backdrop and gem tent; the default sweep follows the lighting preset and
 * the catalog selections.
 */
export function resolveCanvasLook(input: CanvasLookInput): CanvasLook {
  const { lighting, sceneSettings } = input;
  const photometric = sceneSettings?.quality_mode === "photometric";
  const setup = resolveSceneSetup(sceneSettings?.sceneSetup);
  const isDefaultSet = setup.id === "studio";

  const fallbackBackground = photometric ? "#E8E4DC" : LIGHTING_PRESETS[lighting].background;
  const background =
    sceneSetupBackground(setup) ??
    backgroundColorForCanvas(input.backgroundItem, sceneSettings?.customBackground, fallbackBackground);

  const exposureBase = LIGHTING_PRESETS[lighting].exposure * (photometric ? 0.92 : 1) * setup.exposure;
  const exposureOverride = sceneSettings?.advanced?.exposure;

  return {
    photometric,
    metal: { file: environmentFile(input, "metal")!, ...environmentPose(input, "metal", input.metalEnvironment) },
    gem: {
      file: environmentFile(input, "gem"),
      tent: isDefaultSet ? LIGHTING_PRESETS[lighting].gemTent : setup.gemTent,
      ...environmentPose(input, "gem", input.gemEnvironment),
    },
    background,
    floorBackground: background ?? fallbackBackground,
    ambient: LIGHTING_PRESETS[lighting].ambient * (photometric ? 0.74 : 1),
    spot: LIGHTING_PRESETS[lighting].spot * (photometric ? 1.08 : 1),
    exposure: typeof exposureOverride === "number" ? exposureBase * exposureOverride : exposureBase,
    stage: isDefaultSet ? { ...setup, floor: { kind: "shadow", opacity: contactShadowOpacity(input) } } : setup,
  };
}
