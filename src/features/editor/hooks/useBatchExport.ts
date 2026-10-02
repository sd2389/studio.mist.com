"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchBillingAccount } from "@/lib/billing/client";
import type { PlanFeatures } from "@/lib/billing/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import {
  buildBatchExportJobs,
  estimateBatchJobCount,
  type BatchExportContext,
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

  function buildJobs() {
    return buildBatchExportJobs({
      currentSceneId: sceneId,
      currentViewerId: viewerId,
      currentModelUrl: modelUrl,
      currentModelConfig: modelConfig,
      variantsState,
      selectedVariantIds,
      selectedSceneIds,
    });
  }

  return {
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
