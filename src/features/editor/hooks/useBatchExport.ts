"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBillingAccount } from "@/lib/billing/client";
import type { PlanFeatures } from "@/lib/billing/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import {
  batchJobTarget,
  buildBatchExportJobs,
  estimateBatchJobCount,
  type BatchExportContext,
  type BatchJobTarget,
} from "@/lib/variants/batch-export";
import type { ModelVariant, SceneVariantsState } from "@/lib/variants/types";

/** What the Images and Videos tabs get from the edit panel: the piece, and its variants for batches. */
export type BatchExportTabProps = {
  sceneId: number;
  viewerId: string;
  modelUrl: string;
  modelConfig: PersistedModelConfig;
  variantsState: SceneVariantsState;
  variantItems: ModelVariant[];
  onModelConfigChange: (config: PersistedModelConfig) => void;
  setBatchModelUrl: (url: string | null) => void;
};

export type BatchExport = ReturnType<typeof useBatchExport>;

/** How one job of a batch went; a failed job doesn't stop the others. */
export type BatchTileResult =
  | { ok: true; label: string }
  | { ok: false; label: string; message: string };

/**
 * A batch export's picks (variants of this piece, other models), the jobs they make, and
 * whether the plan allows batch export at all.
 */
export function useBatchExport({
  sceneId,
  viewerId,
  modelUrl,
  modelConfig,
  variantsState,
  variantItems,
  onModelConfigChange,
  setBatchModelUrl,
}: BatchExportTabProps) {
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([]);
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures | null>(null);

  useEffect(() => {
    fetchBillingAccount()
      .then((account) => setPlanFeatures(account.features))
      .catch(() => {});
  }, []);

  const batchExportEnabled = planFeatures?.batch_export_enabled !== false;

  const estimatedJobCount = useMemo(
    () =>
      estimateBatchJobCount({
        selectedVariantCount: selectedVariantIds.length,
        variantsStateItemCount: variantItems.length,
        extraSelectedSceneCount: selectedSceneIds.length,
      }),
    [selectedSceneIds.length, selectedVariantIds.length, variantItems.length],
  );

  const batchContext: BatchExportContext = useMemo(
    () => ({
      sceneId,
      viewerId,
      modelUrl,
      modelConfig,
      variantsState,
      onModelConfigChange,
      setBatchModelUrl,
    }),
    [modelConfig, modelUrl, onModelConfigChange, sceneId, setBatchModelUrl, variantsState, viewerId],
  );

  // The same function until the picks or the piece change, so the server targets are read only then.
  const buildJobs = useCallback(
    () =>
      buildBatchExportJobs({
        currentSceneId: sceneId,
        currentViewerId: viewerId,
        currentModelUrl: modelUrl,
        currentModelConfig: modelConfig,
        variantsState,
        selectedVariantIds,
        selectedSceneIds,
      }),
    [modelConfig, modelUrl, sceneId, selectedSceneIds, selectedVariantIds, variantsState, viewerId],
  );

  return {
    sceneId,
    selectedVariantIds,
    setSelectedVariantIds,
    selectedSceneIds,
    setSelectedSceneIds,
    batchExportEnabled,
    estimatedJobCount,
    batchContext,
    buildJobs,
  };
}

type TargetsRead = { build: BatchExport["buildJobs"]; targets: BatchJobTarget[] | null; error: string | null };

/**
 * The batch as server targets (ADR 0005): one per scene and variant picked, read again when the
 * picks change, so the batch can be priced before it starts. Null while they are read, and
 * while `enabled` is off; `error` when another model's variants couldn't be read.
 */
export function useBatchTargets(batch: BatchExport, enabled: boolean) {
  const { buildJobs, sceneId } = batch;
  const [read, setRead] = useState<TargetsRead | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    buildJobs()
      .then((jobs) => {
        if (active) setRead({ build: buildJobs, targets: jobs.map((job) => batchJobTarget(job, sceneId)), error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "The picked models couldn't be read";
        setRead({ build: buildJobs, targets: null, error: message });
      });
    return () => {
      active = false;
    };
  }, [buildJobs, enabled, sceneId]);

  const current = enabled && read?.build === buildJobs ? read : null;
  return { targets: current?.targets ?? null, error: current?.error ?? null };
}
