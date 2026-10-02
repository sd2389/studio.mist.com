"use client";

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_JEWELRY_CATEGORY } from "@/lib/upload/categories";
import { decimateModelRoot } from "@/lib/upload/decimate-model";
import {
  applyLayerRename,
  applyLayerVisibility,
  buildLayerRows,
  type LayerRow,
} from "@/lib/upload/layer-state";
import { skuFromFilename, stemFromFilename } from "@/lib/upload/metadata-from-filename";
import { captureClientException } from "@/lib/observability/sentry";
import { overPolyLimitMessage, type ParsedUpload } from "@/features/upload/lib/parsed-upload";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import { useModelIngest } from "@/features/upload/hooks/useModelIngest";
import { usePolygonCap } from "@/features/upload/hooks/usePolygonCap";
import { useUploadSave } from "@/features/upload/hooks/useUploadSave";

export type UploadPhase = "idle" | "parsing" | "ready" | "saving" | "error";

const EMPTY_METADATA: UploadMetadata = {
  name: "",
  sku: "",
  category: DEFAULT_JEWELRY_CATEGORY,
  note: "",
};

export function useUploadModelFlow() {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [parsed, setParsed] = useState<ParsedUpload | null>(null);
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [metadata, setMetadata] = useState<UploadMetadata>(EMPTY_METADATA);
  const [error, setError] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [decimating, setDecimating] = useState(false);
  /** Bumped when geometry changes in place (decimation) so the preview re-clones it. */
  const [previewRevision, setPreviewRevision] = useState(0);
  const { maxPolygons, planLabel, known: capKnown, refresh: refreshPolygonCap } = usePolygonCap();

  const hiddenSlots = useMemo(
    () => new Set(layers.filter((layer) => !layer.visible).map((layer) => layer.slotId)),
    [layers],
  );
  const slotIds = useMemo(() => layers.map((layer) => layer.slotId), [layers]);
  // A signed-out visitor may be on a paid plan: Save stays open so they can sign in, and the
  // real cap is checked once it is known (see handleAuthSuccess).
  const overPolyLimit = capKnown && parsed != null && parsed.polyCount > maxPolygons;
  const busy = phase === "parsing" || phase === "saving" || decimating;
  const save = useUploadSave({
    parsed,
    layers,
    metadata,
    overPolyLimit,
    maxPolygons,
    planLabel,
    refreshPolygonCap,
    setPhase,
    setError,
    setSkuError,
  });
  const { resetSave } = save;

  const reset = useCallback(() => {
    setPhase("idle");
    setParsed(null);
    setLayers([]);
    setMetadata(EMPTY_METADATA);
    setError(null);
    setSkuError(null);
    resetSave();
  }, [resetSave]);

  const startParsing = useCallback(() => {
    setPhase("parsing");
    setError(null);
    setSkuError(null);
  }, []);

  const acceptParsed = useCallback((next: ParsedUpload) => {
    setParsed(next);
    setLayers(
      buildLayerRows(
        next.preloaded.root,
        next.modelConfig.slotTokens ?? {},
        next.modelConfig.slotRenames ?? {},
        next.modelConfig.materialProps ?? {},
      ),
    );
    setMetadata({
      name: stemFromFilename(next.file.name),
      sku: skuFromFilename(next.file.name),
      category: DEFAULT_JEWELRY_CATEGORY,
      note: "",
    });
    setPhase("ready");
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    setPhase("error");
  }, []);

  const { parseStatus, ingestFiles, ingestFile, handleSample } = useModelIngest({
    onStart: startParsing,
    onParsed: acceptParsed,
    onError: showError,
  });

  const handleRename = useCallback(
    (rawName: string, nextSlotId: string) => {
      if (!parsed) return;
      const nextConfig = applyLayerRename(parsed.modelConfig, parsed.preloaded.root, rawName, nextSlotId);
      setParsed({ ...parsed, modelConfig: nextConfig });
      setLayers(
        buildLayerRows(
          parsed.preloaded.root,
          nextConfig.slotTokens ?? {},
          nextConfig.slotRenames ?? {},
          nextConfig.materialProps ?? {},
        ),
      );
    },
    [parsed],
  );

  const handleToggleVisibility = useCallback(
    (slotId: string, visible: boolean) => {
      if (!parsed) return;
      const nextConfig = applyLayerVisibility(parsed.modelConfig, slotId, visible);
      setParsed({ ...parsed, modelConfig: nextConfig });
      setLayers((prev) =>
        prev.map((layer) => (layer.slotId === slotId ? { ...layer, visible } : layer)),
      );
    },
    [parsed],
  );

  const handleDecimate = useCallback(async () => {
    if (!parsed || decimating) return;
    setDecimating(true);
    try {
      const nextCount = await decimateModelRoot(parsed.preloaded.root, maxPolygons);
      setParsed({ ...parsed, polyCount: nextCount });
      setPreviewRevision((revision) => revision + 1);
      setError(nextCount > maxPolygons ? overPolyLimitMessage(planLabel, maxPolygons) : null);
    } catch (err) {
      captureClientException(err, { stage: "upload.decimate" });
      setError(err instanceof Error ? err.message : "Decimation failed");
    } finally {
      setDecimating(false);
    }
  }, [decimating, maxPolygons, parsed, planLabel]);

  return {
    phase,
    parsed,
    layers,
    metadata,
    setMetadata,
    error,
    skuError,
    saveProgress: save.saveProgress,
    saveMessage: save.saveMessage,
    authDialogOpen: save.authDialogOpen,
    hiddenSlots,
    slotIds,
    overPolyLimit,
    maxPolygons,
    planLabel,
    busy,
    decimating,
    parseStatus,
    previewRevision,
    reset,
    ingestFile,
    ingestFiles,
    showError,
    handleSample,
    handleRename,
    handleToggleVisibility,
    handleDecimate,
    handleSave: save.handleSave,
    handleAuthDialogOpenChange: save.handleAuthDialogOpenChange,
    handleAuthSuccess: save.handleAuthSuccess,
  };
}
