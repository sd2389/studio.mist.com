"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { modelExtFromUrl, viewerIdFromModelKey } from "@/lib/model-key";
import { AiVisualsModal } from "@/components/modals/AiVisualsModal";
import { ExportModal } from "@/components/modals/ExportModal";
import { HiResExportModal } from "@/components/modals/HiResExportModal";
import { Video360Modal } from "@/components/modals/Video360Modal";
import { ViewerCanvas } from "./ViewerCanvas";
import { EmbedChrome } from "./EmbedChrome";
import { EmbedShopperMaterials } from "./EmbedShopperMaterials";
import { StudioPrimaryBar } from "./StudioPrimaryBar";
import { StudioSidebar } from "./StudioSidebar";
import { StudioTopBar } from "./StudioTopBar";
import { ZoomControls } from "./ZoomControls";
import { useStudioPrimaryPanel } from "./useStudioPrimaryPanel";
import { shouldPersistViewerScene } from "@/features/viewer/domain/viewer-scene-persist";
import { cn } from "@/lib/utils";
import type { EmbedSettings } from "@/lib/embed-settings";
import { resolveModelUrl } from "@/lib/model-url";
import { getSceneByViewerId, updateSceneByViewerId } from "@/features/scene";
import type { SceneDetail } from "@/lib/api/scenes";
import {
  fetchSourceCatalog,
  type SourceCatalogPayload,
} from "@/lib/source-catalog";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import {
  buildModelConfigFromSlots,
  getDefaultSceneSettings,
} from "@/lib/slot-materials/model-config";
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
  const replaceSlotSelections = useMaterialPresetStore(
    (s) => s.replaceSlotSelections,
  );
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const replaceSceneSettings = useMaterialPresetStore(
    (s) => s.replaceSceneSettings,
  );

  const [modelConfig, setModelConfig] = useState(() =>
    buildModelConfigFromSlots([]),
  );
  const [sceneSku, setSceneSku] = useState<string | null>(
    initialScene?.sku ?? null,
  );
  const [catalog, setCatalog] = useState<SourceCatalogPayload | null>(null);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const applyingPersistedState = useRef(false);
  const persistTimer = useRef<number | null>(null);
  const { panel, setPanel } = useStudioPrimaryPanel("metal");

  const [aiOpen, setAiOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hiResOpen, setHiResOpen] = useState(false);
  const [video360Open, setVideo360Open] = useState(false);

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
      const resolvedModelConfig = scene.model_config?.slots?.length
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
        const resolvedModelConfig = scene.model_config?.slots?.length
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
  }, [
    initialScene,
    modelId,
    replaceSceneSettings,
    replaceSlotSelections,
    setLighting,
    setPreset,
  ]);

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
    const indexById = new Map(
      catalog.scenes.map((item) => [item._id, item.value ?? ""]),
    );
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
    if (!shouldPersistViewerScene(variant)) return;
    if (!sceneLoaded || applyingPersistedState.current) return;
    if (persistTimer.current !== null)
      window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void updateSceneByViewerId(modelId, persistPayload).catch(
        () => undefined,
      );
    }, 350);
  }, [modelId, persistPayload, sceneLoaded, variant]);

  const sidebarProps = {
    modelId,
    sku: sceneSku,
    modelConfig,
    panel,
    onPanelChange: setPanel,
    onOpenAi: () => setAiOpen(true),
    onOpenExport: () => setExportOpen(true),
    onOpenHiResExport: () => setHiResOpen(true),
    onOpenVideo360: () => setVideo360Open(true),
  };

  if (variant === "embed") {
    const embedAutoRotate = embedSettings?.autoRotate ?? autoRotate;
    const showChrome = embedSettings?.showChrome ?? true;
    const showZoomControls = embedSettings?.showZoomControls ?? true;

    return (
      <div className="studio-stage flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F4F2EE]">
        {showChrome ? (
          <EmbedChrome
            modelId={modelId}
            editorHref={
              initialScene?.model_key
                ? `/viewer/${encodeURIComponent(viewerIdFromModelKey(initialScene.model_key))}`
                : undefined
            }
            displayName={displayName}
            brandingText={embedSettings?.brandingText}
            showTitle={embedSettings?.showTitle ?? true}
            showStudioLink={embedSettings?.showStudioLink ?? true}
          />
        ) : null}
        <div className="relative min-h-0 flex-1">
          <ViewerCanvas
            modelUrl={modelUrl}
            preset={preset}
            autoRotate={embedAutoRotate}
            lighting={lighting}
            modelConfig={modelConfig}
            sceneSettings={resolvedSceneSettings}
          />
          {showZoomControls ? <ZoomControls variant="embed" /> : null}
        </div>
        <EmbedShopperMaterials modelConfig={modelConfig} />
      </div>
    );
  }

  return (
    <>
      <div className="studio-stage flex h-[100dvh] flex-col overflow-hidden bg-[#F4F2EE] text-[#212121] md:flex-row">
        <aside
          className={cn(
            "flex min-h-0 flex-col border-black/10 bg-[#F4F2EE]",
            "order-2 max-h-[50vh] border-t",
            "md:order-1 md:h-full md:max-h-none md:w-[280px] md:shrink-0 md:border-r md:border-t-0",
            panel === null && "hidden md:flex",
          )}
        >
          <div className="flex shrink-0 justify-center pb-1 pt-2 md:hidden">
            <div className="h-1 w-10 rounded-full bg-black/15" aria-hidden />
          </div>
          <StudioSidebar chrome="responsive" className="min-h-0 flex-1" {...sidebarProps} />
        </aside>

        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">
          <div className="h-[52px] shrink-0">
            <StudioTopBar modelId={modelId} sku={sceneSku} />
          </div>
          <div className="relative min-h-0 flex-1 bg-studio-canvas">
            <ViewerCanvas
              modelUrl={modelUrl}
              preset={preset}
              autoRotate={autoRotate}
              lighting={lighting}
              modelConfig={modelConfig}
              sceneSettings={resolvedSceneSettings}
            />
            <ZoomControls />
          </div>
        </div>

        <StudioPrimaryBar
          active={panel}
          onChange={setPanel}
          collapsible
          className="order-3 border-t border-black/10 md:hidden"
        />
      </div>

      <AiVisualsModal
        open={aiOpen}
        onOpenChange={setAiOpen}
        modelId={modelId}
      />
      <ExportModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        modelId={modelId}
        sku={sceneSku}
      />
      <HiResExportModal
        open={hiResOpen}
        onOpenChange={setHiResOpen}
        modelId={modelId}
      />
      <Video360Modal
        open={video360Open}
        onOpenChange={setVideo360Open}
        modelId={modelId}
      />
    </>
  );
}
