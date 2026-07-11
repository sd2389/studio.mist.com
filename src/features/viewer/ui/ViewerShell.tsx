"use client";

import { useGLTF } from "@react-three/drei";
import { motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { modelExtFromUrl } from "@/lib/model-key";
import { AiVisualsModal } from "@/components/modals/AiVisualsModal";
import { ExportModal } from "@/components/modals/ExportModal";
import { HiResExportModal } from "@/components/modals/HiResExportModal";
import { Video360Modal } from "@/components/modals/Video360Modal";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ViewerCanvas } from "./ViewerCanvas";
import { EmbedChrome } from "./EmbedChrome";
import { StudioSidebar } from "./StudioSidebar";
import { StudioTopBar } from "./StudioTopBar";
import { ZoomControls } from "./ZoomControls";
import type { EmbedSettings } from "@/lib/embed-settings";
import { resolveModelUrl } from "@/lib/model-url";
import { getSceneByViewerId, updateSceneByViewerId } from "@/features/scene";
import type { SceneDetail } from "@/lib/api/scenes";
import { fetchSourceCatalog, type SourceCatalogPayload } from "@/lib/source-catalog";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import { buildModelConfigFromSlots, getDefaultSceneSettings } from "@/lib/slot-materials/model-config";
import {
  useMaterialPresetStore,
  type LightingPresetId,
  type MaterialPresetId,
} from "@/stores/material-preset-store";

type ViewerShellProps = {
  modelId: string;
  variant: "studio" | "embed";
  initialScene?: SceneDetail | null;
  embedSettings?: EmbedSettings;
  displayName?: string;
};

export function ViewerShell({
  modelId,
  variant,
  initialScene = null,
  embedSettings,
  displayName,
}: ViewerShellProps) {
  const modelUrl = resolveModelUrl(modelId);
  const preset = useMaterialPresetStore((s) => s.preset);
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const setLighting = useMaterialPresetStore((s) => s.setLighting);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const replaceSlotSelections = useMaterialPresetStore((s) => s.replaceSlotSelections);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const replaceSceneSettings = useMaterialPresetStore((s) => s.replaceSceneSettings);

  const [modelConfig, setModelConfig] = useState(() => buildModelConfigFromSlots([]));
  const [sceneSku, setSceneSku] = useState<string | null>(initialScene?.sku ?? null);
  const [catalog, setCatalog] = useState<SourceCatalogPayload | null>(null);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const applyingPersistedState = useRef(false);
  const persistTimer = useRef<number | null>(null);

  const [aiOpen, setAiOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hiResOpen, setHiResOpen] = useState(false);
  const [video360Open, setVideo360Open] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  useEffect(() => {
    const ext = modelExtFromUrl(modelUrl);
    if (ext === "glb" || ext === "gltf") {
      void useGLTF.preload(modelUrl);
    }
  }, [modelUrl]);

  useEffect(() => {
    let mounted = true;
    void fetchSourceCatalog()
      .then((payload) => {
        if (!mounted) return;
        setCatalog(payload);
      })
      .catch(() => {
        if (!mounted) return;
        setCatalog(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (initialScene) {
      applyingPersistedState.current = true;
      const scene = initialScene;
      const resolvedModelConfig =
        scene.model_config?.slots?.length
          ? scene.model_config
          : buildModelConfigFromSlots(Object.keys(scene.slot_selections ?? {}));
      const safeSelections = sanitizeSlotSelections(
        (scene.slot_selections ?? {}) as Record<string, MaterialPresetId>,
        resolvedModelConfig,
      );
      const incomingPreset = scene.material as MaterialPresetId;
      const incomingLighting = scene.lighting as LightingPresetId;
      setPreset(incomingPreset);
      setLighting(incomingLighting);
      replaceSlotSelections(safeSelections);
      replaceSceneSettings(scene.scene_settings ?? getDefaultSceneSettings());
      setModelConfig(resolvedModelConfig);
      setSceneSku(scene.sku ?? null);
      setSceneLoaded(true);
      window.setTimeout(() => {
        applyingPersistedState.current = false;
      }, 0);
      return;
    }

    let cancelled = false;
    applyingPersistedState.current = true;
    void getSceneByViewerId(modelId)
      .then((scene) => {
        if (cancelled) return;
        const resolvedModelConfig =
          scene.model_config?.slots?.length
            ? scene.model_config
            : buildModelConfigFromSlots(Object.keys(scene.slot_selections ?? {}));
        const safeSelections = sanitizeSlotSelections(
          (scene.slot_selections ?? {}) as Record<string, MaterialPresetId>,
          resolvedModelConfig,
        );
        const incomingPreset = scene.material as MaterialPresetId;
        const incomingLighting = scene.lighting as LightingPresetId;
        setPreset(incomingPreset);
        setLighting(incomingLighting);
        replaceSlotSelections(safeSelections);
        replaceSceneSettings(scene.scene_settings ?? getDefaultSceneSettings());
        setModelConfig(resolvedModelConfig);
        setSceneSku(scene.sku ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setSceneSku(null);
        replaceSceneSettings(getDefaultSceneSettings());
      })
      .finally(() => {
        if (cancelled) return;
        setSceneLoaded(true);
        window.setTimeout(() => {
          applyingPersistedState.current = false;
        }, 0);
      });
    return () => {
      cancelled = true;
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
      }
    };
  }, [initialScene, modelId, replaceSceneSettings, replaceSlotSelections, setLighting, setPreset]);

  const persistPayload = useMemo(
    () => ({
      material: preset,
      lighting,
      model_config: modelConfig,
      slot_selections: sanitizeSlotSelections(slotSelections, modelConfig),
      scene_settings: sceneSettings,
    }),
    [lighting, modelConfig, preset, sceneSettings, slotSelections],
  );

  const resolvedSceneSettings = useMemo(() => {
    if (!catalog?.scenes) return sceneSettings;
    const indexById = new Map(catalog.scenes.map((item) => [item._id, item.value ?? ""]));
    const resolveValue = (value: string | null) => {
      if (!value) return null;
      if (value.includes("/") || value.includes(".")) return value;
      const mapped = indexById.get(value);
      return mapped || value;
    };
    return {
      "ENVIRONMENT-METAL": resolveValue(sceneSettings["ENVIRONMENT-METAL"]),
      "ENVIRONMENT-GEM": resolveValue(sceneSettings["ENVIRONMENT-GEM"]),
      GROUND: resolveValue(sceneSettings.GROUND),
      BACKGROUND: resolveValue(sceneSettings.BACKGROUND),
      VJSON: resolveValue(sceneSettings.VJSON),
      quality_mode: sceneSettings.quality_mode ?? "standard",
    };
  }, [catalog, sceneSettings]);

  useEffect(() => {
    if (!sceneLoaded || applyingPersistedState.current) return;
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void updateSceneByViewerId(modelId, persistPayload).catch(() => undefined);
    }, 350);
  }, [modelId, persistPayload, sceneLoaded]);

  if (variant === "embed") {
    const embedAutoRotate = embedSettings?.autoRotate ?? autoRotate;
    const showChrome = embedSettings?.showChrome ?? true;
    const showZoomControls = embedSettings?.showZoomControls ?? true;
    const chromeOffset = showChrome ? "top-12" : "top-0";

    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-white">
        {showChrome ? (
          <EmbedChrome
            modelId={modelId}
            editorHref={initialScene?.id ? `/model/${initialScene.id}` : undefined}
            displayName={displayName}
            brandingText={embedSettings?.brandingText}
            showTitle={embedSettings?.showTitle ?? true}
            showStudioLink={embedSettings?.showStudioLink ?? true}
          />
        ) : null}
        <div className={`absolute inset-0 ${chromeOffset} min-h-0`}>
          <ViewerCanvas
            modelUrl={modelUrl}
            preset={preset}
            autoRotate={embedAutoRotate}
            lighting={lighting}
            modelConfig={modelConfig}
            sceneSettings={resolvedSceneSettings}
          />
          {showZoomControls ? <ZoomControls /> : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-muted/30 lg:flex-row">
        <aside className="hidden h-full w-80 shrink-0 flex-col border-r border-border bg-card lg:flex xl:w-[360px] 2xl:w-[400px]">
          <StudioSidebar
            modelId={modelId}
            sku={sceneSku}
            modelConfig={modelConfig}
            onOpenAi={() => setAiOpen(true)}
            onOpenExport={() => setExportOpen(true)}
            onOpenHiResExport={() => setHiResOpen(true)}
            onOpenVideo360={() => setVideo360Open(true)}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <StudioTopBar modelId={modelId} sku={sceneSku} />
          <motion.div
            className="relative min-h-0 flex-1"
            initial={{ opacity: 0.88, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <ViewerCanvas
              modelUrl={modelUrl}
              preset={preset}
              autoRotate={autoRotate}
              lighting={lighting}
              modelConfig={modelConfig}
              sceneSettings={resolvedSceneSettings}
            />
            <ZoomControls />
          </motion.div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className="fixed bottom-5 left-4 z-50 gap-2 rounded-full border border-border bg-card text-foreground shadow-sm backdrop-blur-sm lg:hidden"
        onClick={() => setMobileControlsOpen(true)}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Controls
      </Button>

      <Sheet open={mobileControlsOpen} onOpenChange={setMobileControlsOpen}>
        <SheetContent
          side="bottom"
          className="h-[min(85dvh,640px)] border-border bg-card p-0 sm:h-[min(80dvh,720px)]"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base font-semibold text-foreground">Studio controls</SheetTitle>
          </SheetHeader>
          <StudioSidebar
            className="max-h-[calc(min(85dvh,640px)-56px)] sm:max-h-[calc(min(80dvh,720px)-56px)]"
            modelId={modelId}
            sku={sceneSku}
            modelConfig={modelConfig}
            onOpenAi={() => {
              setMobileControlsOpen(false);
              setAiOpen(true);
            }}
            onOpenExport={() => {
              setMobileControlsOpen(false);
              setExportOpen(true);
            }}
            onOpenHiResExport={() => {
              setMobileControlsOpen(false);
              setHiResOpen(true);
            }}
            onOpenVideo360={() => {
              setMobileControlsOpen(false);
              setVideo360Open(true);
            }}
          />
        </SheetContent>
      </Sheet>

      <AiVisualsModal open={aiOpen} onOpenChange={setAiOpen} modelId={modelId} />
      <ExportModal open={exportOpen} onOpenChange={setExportOpen} modelId={modelId} sku={sceneSku} />
      <HiResExportModal open={hiResOpen} onOpenChange={setHiResOpen} modelId={modelId} />
      <Video360Modal open={video360Open} onOpenChange={setVideo360Open} modelId={modelId} />
    </>
  );
}
