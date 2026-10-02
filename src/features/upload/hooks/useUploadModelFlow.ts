"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { fetchMe } from "@/lib/auth/client";
import { isAuthRequiredError } from "@/lib/auth/is-auth-required-error";
import { viewerIdFromModelKey } from "@/lib/model-key";
import { DEFAULT_JEWELRY_CATEGORY } from "@/lib/upload/categories";
import { decimateModelRoot } from "@/lib/upload/decimate-model";
import {
  applyLayerRename,
  applyLayerVisibility,
  buildLayerRows,
  syncModelConfigFromLayers,
  type LayerRow,
} from "@/lib/upload/layer-state";
import { skuFromFilename, stemFromFilename } from "@/lib/upload/metadata-from-filename";
import { captureClientException, logClientEvent } from "@/lib/observability/sentry";
import { persistUploadedModel } from "@/lib/upload/persist-model";
import { overPolyLimitMessage, type ParsedUpload } from "@/features/upload/lib/parsed-upload";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import { useModelIngest } from "@/features/upload/hooks/useModelIngest";
import { usePolygonCap } from "@/features/upload/hooks/usePolygonCap";

export type UploadPhase = "idle" | "parsing" | "ready" | "saving" | "error";

const EMPTY_METADATA: UploadMetadata = {
  name: "",
  sku: "",
  category: DEFAULT_JEWELRY_CATEGORY,
  note: "",
};

export function useUploadModelFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [parsed, setParsed] = useState<ParsedUpload | null>(null);
  const [layers, setLayers] = useState<LayerRow[]>([]);
  const [metadata, setMetadata] = useState<UploadMetadata>(EMPTY_METADATA);
  const [error, setError] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [decimating, setDecimating] = useState(false);
  /** Bumped when geometry changes in place (decimation) so the preview re-clones it. */
  const [previewRevision, setPreviewRevision] = useState(0);
  const { maxPolygons, planLabel, known: capKnown, refresh: refreshPolygonCap } = usePolygonCap();
  const pendingSaveAfterAuthRef = useRef(false);
  /** Serializes Save: acquired before fetchMe, held through auth dialog / persist. */
  const saveFlowActiveRef = useRef(false);

  const hiddenSlots = useMemo(
    () => new Set(layers.filter((layer) => !layer.visible).map((layer) => layer.slotId)),
    [layers],
  );
  const slotIds = useMemo(() => layers.map((layer) => layer.slotId), [layers]);
  // A signed-out visitor may be on a paid plan: Save stays open so they can sign in, and the
  // real cap is checked once it is known (see handleAuthSuccess).
  const overPolyLimit = capKnown && parsed != null && parsed.polyCount > maxPolygons;
  const busy = phase === "parsing" || phase === "saving" || decimating;

  const reset = useCallback(() => {
    setPhase("idle");
    setParsed(null);
    setLayers([]);
    setMetadata(EMPTY_METADATA);
    setError(null);
    setSkuError(null);
    setSaveProgress(0);
    setSaveMessage(null);
    setAuthDialogOpen(false);
    pendingSaveAfterAuthRef.current = false;
    saveFlowActiveRef.current = false;
  }, []);

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

  const requestSignInForSave = useCallback(() => {
    pendingSaveAfterAuthRef.current = true;
    setAuthDialogOpen(true);
    setPhase("ready");
    setSaveMessage(null);
    setSaveProgress(0);
    setError(null);
  }, []);

  const persistReadyModel = useCallback(async () => {
    if (!parsed) return;
    const trimmedName = metadata.name.trim();
    const trimmedSku = metadata.sku.trim();

    setPhase("saving");
    setError(null);
    setSkuError(null);
    setSaveProgress(10);
    setSaveMessage("Converting to GLB…");
    logClientEvent("upload.save.start", { sku: trimmedSku, name: trimmedName });

    try {
      const syncedConfig = syncModelConfigFromLayers(parsed.modelConfig, parsed.preloaded.root, layers);
      setSaveProgress(35);
      setSaveMessage("Uploading model…");
      const result = await persistUploadedModel({
        file: parsed.file,
        preloaded: parsed.preloaded,
        modelConfig: syncedConfig,
        slotSelections: parsed.slotSelections,
        sceneSettings: parsed.sceneSettings,
        polygonCount: parsed.polyCount,
        metadata: {
          name: trimmedName,
          sku: trimmedSku,
          category: metadata.category,
          note: metadata.note.trim(),
        },
      });
      setSaveProgress(100);
      setSaveMessage("Opening studio…");
      logClientEvent("upload.save.done", { sceneId: result.sceneId, sku: trimmedSku });
      router.push(`/viewer/${encodeURIComponent(viewerIdFromModelKey(result.modelKey))}`);
    } catch (err) {
      if (isAuthRequiredError(err)) {
        requestSignInForSave();
        return;
      }
      captureClientException(err, { stage: "upload.save", sku: trimmedSku });
      const message = err instanceof Error ? err.message : "Save failed";
      if (/sku/i.test(message) && /exist/i.test(message)) setSkuError(message);
      else setError(message);
      setPhase("ready");
      setSaveMessage(null);
      setSaveProgress(0);
    }
  }, [layers, metadata, parsed, requestSignInForSave, router]);

  const handleSave = useCallback(async () => {
    if (!parsed) return;
    const trimmedName = metadata.name.trim();
    const trimmedSku = metadata.sku.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!trimmedSku) {
      setSkuError("SKU is required.");
      return;
    }
    if (overPolyLimit) {
      setError(overPolyLimitMessage(planLabel, maxPolygons));
      return;
    }
    if (saveFlowActiveRef.current) return;
    saveFlowActiveRef.current = true;

    try {
      await fetchMe();
    } catch (err) {
      if (isAuthRequiredError(err)) {
        requestSignInForSave();
        return;
      }
      saveFlowActiveRef.current = false;
      setError(err instanceof Error ? err.message : "Could not verify session");
      return;
    }

    try {
      await persistReadyModel();
    } finally {
      if (!pendingSaveAfterAuthRef.current) {
        saveFlowActiveRef.current = false;
      }
    }
  }, [maxPolygons, metadata.name, metadata.sku, overPolyLimit, parsed, persistReadyModel, planLabel, requestSignInForSave]);

  const handleAuthDialogOpenChange = useCallback((open: boolean) => {
    setAuthDialogOpen(open);
    if (!open) {
      pendingSaveAfterAuthRef.current = false;
      saveFlowActiveRef.current = false;
    }
  }, []);

  const handleAuthSuccess = useCallback(async () => {
    setAuthDialogOpen(false);
    const shouldRetry = pendingSaveAfterAuthRef.current;
    pendingSaveAfterAuthRef.current = false;
    if (!shouldRetry) return;

    try {
      // The plan just signed into, not the one this render saw (the guest fallback).
      const cap = await refreshPolygonCap();
      if (parsed != null && parsed.polyCount > cap.maxPolygons) {
        setError(overPolyLimitMessage(cap.planLabel, cap.maxPolygons));
        return;
      }
      await persistReadyModel();
    } finally {
      if (!pendingSaveAfterAuthRef.current) {
        saveFlowActiveRef.current = false;
      }
    }
  }, [parsed, persistReadyModel, refreshPolygonCap]);

  return {
    phase,
    parsed,
    layers,
    metadata,
    setMetadata,
    error,
    skuError,
    saveProgress,
    saveMessage,
    authDialogOpen,
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
    handleSave,
    handleAuthDialogOpenChange,
    handleAuthSuccess,
  };
}
