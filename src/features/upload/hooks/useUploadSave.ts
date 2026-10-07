"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { fetchMe } from "@/lib/auth/client";
import { isAuthRequiredError } from "@/lib/auth/is-auth-required-error";
import { viewerIdFromModelKey } from "@/lib/model-key";
import { convertParsedUpload } from "@/lib/upload/convert-upload";
import type { LayerRow } from "@/lib/upload/layer-state";
import { captureClientException, logClientEvent } from "@/lib/observability/sentry";
import { persistUploadedModel } from "@/lib/upload/persist-model";
import { overPolyLimitMessage, type ParsedUpload } from "@/lib/upload/parsed-upload";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import type { PolygonCap } from "@/features/upload/hooks/usePolygonCap";

type UploadSaveInput = {
  parsed: ParsedUpload | null;
  layers: LayerRow[];
  metadata: UploadMetadata;
  /** Over the cap this render knows of; Save refuses then. */
  overPolyLimit: boolean;
  maxPolygons: number;
  planLabel: string;
  refreshPolygonCap: PolygonCap["refresh"];
  setPhase: (phase: "saving" | "ready") => void;
  setError: (message: string | null) => void;
  setSkuError: (message: string | null) => void;
};

/**
 * Saving an upload: checks the metadata and the plan's polygon cap, asks a signed-out visitor
 * to sign in and then retries, converts and uploads the model, and opens it in the studio.
 */
export function useUploadSave({
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
}: UploadSaveInput) {
  const router = useRouter();
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const pendingSaveAfterAuthRef = useRef(false);
  /** Serializes Save: acquired before fetchMe, held through auth dialog / persist. */
  const saveFlowActiveRef = useRef(false);

  const resetSave = useCallback(() => {
    setSaveProgress(0);
    setSaveMessage(null);
    setAuthDialogOpen(false);
    pendingSaveAfterAuthRef.current = false;
    saveFlowActiveRef.current = false;
  }, []);

  const requestSignInForSave = useCallback(() => {
    pendingSaveAfterAuthRef.current = true;
    setAuthDialogOpen(true);
    setPhase("ready");
    setSaveMessage(null);
    setSaveProgress(0);
    setError(null);
  }, [setError, setPhase]);

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
      const converted = await convertParsedUpload(parsed, layers);
      if (converted.warnings.length > 0) logClientEvent("upload.save.warnings", { warnings: converted.warnings });
      setSaveProgress(35);
      setSaveMessage("Uploading model…");
      const result = await persistUploadedModel(converted, {
        name: trimmedName,
        sku: trimmedSku,
        category: metadata.category,
        note: metadata.note.trim(),
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
  }, [layers, metadata, parsed, requestSignInForSave, router, setError, setPhase, setSkuError]);

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
  }, [
    maxPolygons,
    metadata.name,
    metadata.sku,
    overPolyLimit,
    parsed,
    persistReadyModel,
    planLabel,
    requestSignInForSave,
    setError,
    setSkuError,
  ]);

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
  }, [parsed, persistReadyModel, refreshPolygonCap, setError]);

  return {
    saveProgress,
    saveMessage,
    authDialogOpen,
    resetSave,
    handleSave,
    handleAuthDialogOpenChange,
    handleAuthSuccess,
  };
}
