"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { fetchMe } from "@/lib/auth/client";
import { isAuthRequiredError } from "@/lib/auth/is-auth-required-error";
import { inspectModelFromFile } from "@/lib/convert/to-glb";
import type { LoadedModel } from "@/lib/convert/types";
import { viewerIdFromModelKey } from "@/lib/model-key";
import {
  buildModelConfigFromSlots,
  getDefaultSceneSettings,
  type PersistedModelConfig,
} from "@/lib/slot-materials/model-config";
import { DEFAULT_JEWELRY_CATEGORY } from "@/lib/upload/categories";
import { countPolygons, POLY_WARN_THRESHOLD } from "@/lib/upload/count-polygons";
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
import { isSupportedModelFile, persistUploadedModel } from "@/lib/upload/persist-model";
import { fetchSampleModelFile, type SampleModel } from "@/lib/upload/sample-models";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";

export type UploadPhase = "idle" | "parsing" | "ready" | "saving" | "error";

type ParsedUpload = {
  file: File;
  preloaded: LoadedModel;
  modelConfig: PersistedModelConfig;
  slotSelections: Record<string, string>;
  sceneSettings: ReturnType<typeof getDefaultSceneSettings>;
  polyCount: number;
};

const EMPTY_METADATA: UploadMetadata = {
  name: "",
  sku: "",
  category: DEFAULT_JEWELRY_CATEGORY,
  note: "",
};

function buildParsedUpload(file: File, inspected: Awaited<ReturnType<typeof inspectModelFromFile>>): ParsedUpload {
  const polyCount = countPolygons(inspected.loaded.root);
  const slots = Object.keys(inspected.loaded.slotTokens);
  const slotNames =
    slots.length > 0
      ? slots
      : Object.keys(inspected.materialProps).length > 0
        ? Object.keys(inspected.materialProps)
        : ["Metal 01"];

  const modelConfig = buildModelConfigFromSlots(slotNames);
  modelConfig.slotTokens = inspected.loaded.slotTokens;
  modelConfig.materialProps = inspected.materialProps;

  return {
    file,
    preloaded: inspected.loaded,
    modelConfig,
    slotSelections: modelConfig.defaultMaterials,
    sceneSettings: getDefaultSceneSettings(),
    polyCount,
  };
}

function parseErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Could not parse model";
  if (err.message.includes("Rhino") || err.message.includes("3dm")) {
    return "Could not parse this .3dm file. Check that it is a valid Rhino model with at least one mesh.";
  }
  return err.message;
}

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
  const [decimated, setDecimated] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const pendingSaveAfterAuthRef = useRef(false);
  /** Serializes Save: acquired before fetchMe, held through auth dialog / persist. */
  const saveFlowActiveRef = useRef(false);

  const hiddenSlots = useMemo(
    () => new Set(layers.filter((layer) => !layer.visible).map((layer) => layer.slotId)),
    [layers],
  );
  const slotIds = useMemo(() => layers.map((layer) => layer.slotId), [layers]);
  const showPolyWarning = parsed != null && parsed.polyCount > POLY_WARN_THRESHOLD && !decimated;
  const busy = phase === "parsing" || phase === "saving";

  const reset = useCallback(() => {
    setPhase("idle");
    setParsed(null);
    setLayers([]);
    setMetadata(EMPTY_METADATA);
    setError(null);
    setSkuError(null);
    setSaveProgress(0);
    setSaveMessage(null);
    setDecimated(false);
    setAuthDialogOpen(false);
    pendingSaveAfterAuthRef.current = false;
    saveFlowActiveRef.current = false;
  }, []);

  const ingestFile = useCallback(async (file: File) => {
    if (!isSupportedModelFile(file)) {
      setError("Supports GLB, glTF, STL, and 3DM only.");
      setPhase("error");
      return;
    }
    setPhase("parsing");
    setError(null);
    setSkuError(null);
    setDecimated(false);
    logClientEvent("upload.parse.start", { filename: file.name, size: file.size });
    try {
      const inspected = await inspectModelFromFile(file);
      const nextParsed = buildParsedUpload(file, inspected);
      const layerRows = buildLayerRows(
        nextParsed.preloaded.root,
        nextParsed.modelConfig.slotTokens ?? {},
        nextParsed.modelConfig.slotRenames ?? {},
        nextParsed.modelConfig.materialProps ?? {},
      );
      setParsed(nextParsed);
      setLayers(layerRows);
      setMetadata({
        name: stemFromFilename(file.name),
        sku: skuFromFilename(file.name),
        category: DEFAULT_JEWELRY_CATEGORY,
        note: "",
      });
      logClientEvent("upload.parse.done", {
        filename: file.name,
        polyCount: nextParsed.polyCount,
        slotCount: layerRows.length,
      });
      setPhase("ready");
    } catch (err) {
      captureClientException(err, { stage: "upload.parse", filename: file.name });
      setError(parseErrorMessage(err));
      setPhase("error");
    }
  }, []);

  const handleSample = useCallback(
    async (sample: SampleModel) => {
      try {
        const file = await fetchSampleModelFile(sample);
        await ingestFile(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load sample");
        setPhase("error");
      }
    },
    [ingestFile],
  );

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

  const handleDecimate = useCallback(() => {
    if (!parsed) return;
    const nextCount = decimateModelRoot(parsed.preloaded.root, POLY_WARN_THRESHOLD);
    setParsed({ ...parsed, polyCount: nextCount });
    setDecimated(true);
  }, [parsed]);

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
  }, [metadata.name, metadata.sku, parsed, persistReadyModel, requestSignInForSave]);

  const handleAuthDialogOpenChange = useCallback((open: boolean) => {
    setAuthDialogOpen(open);
    if (!open) {
      pendingSaveAfterAuthRef.current = false;
      saveFlowActiveRef.current = false;
    }
  }, []);

  const handleAuthSuccess = useCallback(() => {
    setAuthDialogOpen(false);
    const shouldRetry = pendingSaveAfterAuthRef.current;
    pendingSaveAfterAuthRef.current = false;
    if (!shouldRetry) return;
    void persistReadyModel().finally(() => {
      if (!pendingSaveAfterAuthRef.current) {
        saveFlowActiveRef.current = false;
      }
    });
  }, [persistReadyModel]);

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
    showPolyWarning,
    busy,
    reset,
    ingestFile,
    handleSample,
    handleRename,
    handleToggleVisibility,
    handleDecimate,
    handleSave,
    handleAuthDialogOpenChange,
    handleAuthSuccess,
  };
}
