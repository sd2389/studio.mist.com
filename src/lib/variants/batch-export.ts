import { getScene } from "@/lib/api/scenes";
import type { SceneDetail } from "@/lib/api/scenes";
import { resolveModelConfigFromScene } from "@/features/editor/lib/hydrate-editor-scene";
import { viewerIdFromModelKey } from "@/lib/model-key";
import { resolveModelUrl } from "@/lib/model-url";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import {
  applyVariantSnapshot,
  captureVariantSnapshot,
  findVariant,
  normalizeVariantsState,
  variantSlug,
} from "@/lib/variants/variant-utils";
import type { ModelVariant, ModelVariantSnapshot, SceneVariantsState } from "@/lib/variants/types";
import { waitForModelReady, waitForRenderFrames } from "@/lib/variants/wait-for-render";
import { resetModelReady } from "@/stores/batch-export-store";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";

export type BatchExportJob = {
  sceneId: number;
  sceneLabel: string;
  viewerId: string;
  modelUrl: string;
  modelConfig: PersistedModelConfig;
  variant: ModelVariant | null;
  snapshot: ModelVariantSnapshot;
};

export type BatchExportContext = {
  sceneId: number;
  viewerId: string;
  modelUrl: string;
  modelConfig: PersistedModelConfig;
  variantsState: SceneVariantsState;
  onModelConfigChange: (config: PersistedModelConfig) => void;
  setBatchModelUrl: (url: string | null) => void;
};

type BuildJobsInput = {
  currentSceneId: number;
  currentViewerId: string;
  currentModelUrl: string;
  currentModelConfig: PersistedModelConfig;
  variantsState: SceneVariantsState;
  selectedVariantIds: string[];
  selectedSceneIds: number[];
  includeCurrentScene?: boolean;
};

/**
 * UI estimate matching buildBatchExportJobs expansion:
 * - selectedVariantIds.length > 0 → that count; else variantsStateItemCount (0 means 1 live snapshot)
 * - scenes = 1 (current) + extraSelectedSceneCount
 */
export function estimateBatchJobCount(input: {
  selectedVariantCount: number;
  variantsStateItemCount: number;
  extraSelectedSceneCount: number;
}): number {
  const variantCount =
    input.selectedVariantCount > 0
      ? input.selectedVariantCount
      : Math.max(1, input.variantsStateItemCount);
  const scenes = 1 + Math.max(0, input.extraSelectedSceneCount);
  return scenes * variantCount;
}

export async function buildBatchExportJobs(input: BuildJobsInput): Promise<BatchExportJob[]> {
  const jobs: BatchExportJob[] = [];
  const variantIds =
    input.selectedVariantIds.length > 0
      ? input.selectedVariantIds
      : input.variantsState.items.map((item) => item.id);

  function pushJobsForScene(
    scene: SceneDetail,
    variants: SceneVariantsState,
    modelConfig: PersistedModelConfig,
  ) {
    const viewerId = viewerIdFromModelKey(scene.model_key);
    const modelUrl = scene.model_url ?? resolveModelUrl(viewerId);
    const label = scene.name?.trim() || scene.sku?.trim() || viewerId;

    if (variantIds.length === 0) {
      const snapshot = liveSnapshotFromScene(scene, modelConfig);
      jobs.push({
        sceneId: scene.id,
        sceneLabel: label,
        viewerId,
        modelUrl,
        modelConfig,
        variant: null,
        snapshot,
      });
      return;
    }

    for (const variantId of variantIds) {
      const variant = findVariant(variants, variantId);
      if (!variant) continue;
      jobs.push({
        sceneId: scene.id,
        sceneLabel: label,
        viewerId,
        modelUrl,
        modelConfig,
        variant,
        snapshot: variant.snapshot,
      });
    }
  }

  const includeCurrent = input.includeCurrentScene !== false;
  if (includeCurrent) {
    const store = useMaterialPresetStore.getState();
    const liveSnapshot = captureVariantSnapshot({
      material: store.preset,
      lighting: store.lighting,
      slotSelections: sanitizeSlotSelections(
        store.slotSelections as Record<string, SlotMaterialRef>,
        input.currentModelConfig,
      ),
      sceneSettings: store.sceneSettings,
      modelConfig: input.currentModelConfig,
    });

    if (variantIds.length === 0) {
      jobs.push({
        sceneId: input.currentSceneId,
        sceneLabel: input.currentViewerId,
        viewerId: input.currentViewerId,
        modelUrl: input.currentModelUrl,
        modelConfig: input.currentModelConfig,
        variant: null,
        snapshot: liveSnapshot,
      });
    } else {
      for (const variantId of variantIds) {
        const variant = findVariant(input.variantsState, variantId);
        if (!variant) continue;
        jobs.push({
          sceneId: input.currentSceneId,
          sceneLabel: input.currentViewerId,
          viewerId: input.currentViewerId,
          modelUrl: input.currentModelUrl,
          modelConfig: input.currentModelConfig,
          variant,
          snapshot: variant.snapshot,
        });
      }
    }
  }

  for (const sceneId of input.selectedSceneIds) {
    const scene = await getScene(sceneId);
    const variants = normalizeVariantsState(scene.variants);
    const modelConfig = resolveModelConfigFromScene(scene);
    const otherVariantIds =
      variants.items.length > 0 ? variants.items.map((item) => item.id) : [];

    if (otherVariantIds.length === 0) {
      pushJobsForScene(scene, variants, modelConfig);
    } else {
      for (const variantId of otherVariantIds) {
        const variant = findVariant(variants, variantId);
        if (!variant) continue;
        const viewerId = viewerIdFromModelKey(scene.model_key);
        const modelUrl = scene.model_url ?? resolveModelUrl(viewerId);
        const label = scene.name?.trim() || scene.sku?.trim() || viewerId;
        jobs.push({
          sceneId: scene.id,
          sceneLabel: label,
          viewerId,
          modelUrl,
          modelConfig,
          variant,
          snapshot: variant.snapshot,
        });
      }
    }
  }

  return jobs;
}

function liveSnapshotFromScene(
  scene: SceneDetail,
  modelConfig: PersistedModelConfig,
): ModelVariantSnapshot {
  const store = useMaterialPresetStore.getState();
  const slotSelections = sanitizeSlotSelections(
    (scene.slot_selections ?? store.slotSelections) as Record<string, SlotMaterialRef>,
    modelConfig,
  );
  return captureVariantSnapshot({
    material: (scene.material ?? store.preset) as MaterialPresetId,
    lighting: (scene.lighting ?? store.lighting) as LightingPresetId,
    slotSelections,
    sceneSettings: scene.scene_settings ?? store.sceneSettings,
    modelConfig,
  });
}

export async function runBatchExportJobs<T>(
  jobs: BatchExportJob[],
  context: BatchExportContext,
  renderOne: (job: BatchExportJob, index: number) => Promise<T>,
): Promise<T[]> {
  if (jobs.length === 0) return [];

  const store = useMaterialPresetStore.getState();
  const restore = {
    preset: store.preset,
    lighting: store.lighting,
    slotSelections: { ...store.slotSelections },
    sceneSettings: structuredClone(store.sceneSettings),
    modelConfig: structuredClone(context.modelConfig),
    modelUrl: context.modelUrl,
  };

  const results: T[] = [];
  let activeConfig = context.modelConfig;
  let loadedUrl = context.modelUrl;

  try {
    for (let index = 0; index < jobs.length; index++) {
      const job = jobs[index]!;

      if (job.modelUrl !== loadedUrl) {
        resetModelReady();
        context.setBatchModelUrl(job.modelUrl);
        await waitForModelReady();
        loadedUrl = job.modelUrl;
      }

      activeConfig = applyVariantSnapshot(job.snapshot, activeConfig, {
        onModelConfigChange: context.onModelConfigChange,
      });
      await waitForRenderFrames(4);
      results.push(await renderOne(job, index));
    }
  } finally {
    store.setPreset(restore.preset);
    store.setLighting(restore.lighting);
    store.replaceSlotSelections(restore.slotSelections);
    store.replaceSceneSettings(restore.sceneSettings);
    context.onModelConfigChange(restore.modelConfig);
    context.setBatchModelUrl(null);
    await waitForRenderFrames(2);
  }

  return results;
}

export function batchFilenamePrefix(job: BatchExportJob): string {
  const scenePart = variantSlug(job.sceneLabel);
  const variantPart = job.variant ? variantSlug(job.variant.name) : "live";
  return `${scenePart}-${variantPart}`;
}
