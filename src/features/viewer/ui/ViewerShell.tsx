"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { modelExtFromUrl, viewerIdFromModelKey } from "@/lib/model-key";
import { ViewerCanvas } from "./ViewerCanvas";
import { EmbedChrome } from "./EmbedChrome";
import { EmbedShopperMaterials } from "./EmbedShopperMaterials";
import { StudioPrimaryBar } from "./StudioPrimaryBar";
import { StudioSidebar } from "./StudioSidebar";
import { useStudioModals } from "./useStudioModals";
import { ViewportBackground } from "./ViewportBackground";
import { SceneEditPanel } from "@/features/editor/ui/SceneEditPanel";
import {
  buildSceneCatalogIndex,
  lookupBackground,
  lookupEnvironment,
  lookupGround,
} from "@/features/editor/hooks/useSceneCatalogIndex";
import type { EditCatalogs } from "@/lib/catalog/edit-catalogs";
import { LIGHTING_PRESETS } from "@/lib/viewer-lighting";
import { StudioTopBar } from "./StudioTopBar";
import { ZoomControls } from "./ZoomControls";
import { useStudioPrimaryPanel } from "./useStudioPrimaryPanel";
import { shouldPersistViewerScene } from "@/features/viewer/domain/viewer-scene-persist";
import { resolveSceneSettings } from "../domain/resolve-scene-settings";
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

/** A scene's model config, rebuilt from its slot selections for scenes saved before configs had slots. */
function resolveModelConfig(scene: SceneDetail) {
  return scene.model_config?.slots?.length
    ? scene.model_config
    : buildModelConfigFromSlots(Object.keys(scene.slot_selections ?? {}));
}

type ViewerShellProps = {
  modelId: string;
  variant: "studio" | "embed";
  initialScene?: SceneDetail | null;
  embedSettings?: EmbedSettings;
  displayName?: string;
  /** Catalogues the scene's look and the Edit tab draw from. */
  catalogs?: EditCatalogs | null;
  /** Show the Edit tab: a saved scene with someone signed in (the API enforces ownership). */
  editable?: boolean;
};

export function ViewerShell({
  modelId,
  variant,
  initialScene = null,
  embedSettings,
  displayName,
  catalogs = null,
  editable = false,
}: ViewerShellProps) {
  const sceneModelUrl = initialScene?.model_url ?? resolveModelUrl(modelId);
  // Batch exports swap the model in the view while they render each variant.
  const [batchModelUrl, setBatchModelUrl] = useState<string | null>(null);
  const modelUrl = batchModelUrl ?? sceneModelUrl;
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
    initialScene ? resolveModelConfig(initialScene) : buildModelConfigFromSlots([]),
  );
  const [sceneSku, setSceneSku] = useState<string | null>(
    initialScene?.sku ?? null,
  );
  const [catalog, setCatalog] = useState<SourceCatalogPayload | null>(null);
  const [sceneLoaded, setSceneLoaded] = useState(Boolean(initialScene));
  const applyingPersistedState = useRef(false);
  const persistTimer = useRef<number | null>(null);
  const { panel, setPanel } = useStudioPrimaryPanel("metal");


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
      const resolvedModelConfig = resolveModelConfig(scene);
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
        const resolvedModelConfig = resolveModelConfig(scene);
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

  const resolvedSceneSettings = useMemo(
    () => resolveSceneSettings(sceneSettings, catalog?.scenes),
    [catalog, sceneSettings],
  );

  useEffect(() => {
    if (!shouldPersistViewerScene(variant) || modelId === "mist-solitaire" || modelId === "clearcoat") return;
    if (!sceneLoaded || applyingPersistedState.current) return;
    if (persistTimer.current !== null)
      window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void updateSceneByViewerId(modelId, persistPayload).catch(
        () => undefined,
      );
    }, 350);
  }, [modelId, persistPayload, sceneLoaded, variant]);

  const { openers, modals } = useStudioModals(modelId, sceneSku);

  // Catalogue environments, background and ground the scene was saved with (Edit tab).
  const sceneCatalog = useMemo(
    () =>
      buildSceneCatalogIndex({
        environments: {
          items: [...(catalogs?.metalEnvironments?.items ?? []), ...(catalogs?.gemEnvironments?.items ?? [])],
          total: 0,
          limit: 0,
          offset: 0,
        },
        backgrounds: catalogs?.backgrounds,
        grounds: catalogs?.grounds,
        presets: catalogs?.scenePresets,
      }),
    [catalogs],
  );
  const catalogLook = {
    metalEnvironment: lookupEnvironment(sceneCatalog, sceneSettings["ENVIRONMENT-METAL"]),
    gemEnvironment: lookupEnvironment(sceneCatalog, sceneSettings["ENVIRONMENT-GEM"]),
    backgroundItem: lookupBackground(sceneCatalog, sceneSettings.BACKGROUND),
    groundItem: lookupGround(sceneCatalog, sceneSettings.GROUND),
  };
  const editPanel =
    editable && initialScene?.id && catalogs ? (
      <SceneEditPanel
        scene={initialScene}
        viewerId={modelId}
        modelUrl={sceneModelUrl}
        modelConfig={modelConfig}
        onModelConfigChange={setModelConfig}
        catalogs={catalogs}
        onBatchModelUrlChange={setBatchModelUrl}
      />
    ) : undefined;

  const sidebarProps = {
    modelId,
    sku: sceneSku,
    displayName: displayName ?? initialScene?.name ?? null,
    modelConfig,
    panel,
    onPanelChange: setPanel,
    ...openers,
    editPanel,
  };

  if (variant === "embed") {
    const embedAutoRotate = embedSettings?.autoRotate ?? autoRotate;
    const showChrome = embedSettings?.showChrome ?? true;
    const showZoomControls = embedSettings?.showZoomControls ?? true;

    return (
      <div className="studio-stage flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
        {showChrome ? (
          <EmbedChrome
            modelId={modelId}
            editorHref={
              initialScene?.model_key
                ? `/viewer/${encodeURIComponent(viewerIdFromModelKey(initialScene.model_key))}`
                : undefined
            }
            displayName={displayName ?? initialScene?.name ?? undefined}
            brandingText={embedSettings?.brandingText}
            showTitle={embedSettings?.showTitle ?? true}
            showStudioLink={embedSettings?.showStudioLink ?? false}
          />
        ) : null}
        <div className="relative min-h-0 flex-1">
          {catalogLook.backgroundItem ? (
            <ViewportBackground
              backgroundItem={catalogLook.backgroundItem}
              customBackground={resolvedSceneSettings.customBackground}
              fallbackColor={LIGHTING_PRESETS[lighting].background}
            />
          ) : null}
          <ViewerCanvas
            modelUrl={modelUrl}
            preset={preset}
            autoRotate={embedAutoRotate}
            lighting={lighting}
            modelConfig={modelConfig}
            sceneSettings={resolvedSceneSettings}
            {...catalogLook}
          />
          {showZoomControls ? <ZoomControls variant="embed" touchLayout /> : null}
        </div>
        <EmbedShopperMaterials modelConfig={modelConfig} />
      </div>
    );
  }

  return (
    <>
      <div className="studio-stage flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground md:flex-row">
        <aside
          className={cn(
            "flex min-h-0 flex-col border-foreground/10 bg-background",
            "order-2 max-h-[50vh] border-t",
            "md:order-1 md:h-full md:max-h-none md:shrink-0 md:border-r md:border-t-0",
            panel === "edit" ? "md:w-[380px]" : "md:w-[280px]",
            panel === null && "hidden md:flex",
          )}
        >
          <div className="flex shrink-0 justify-center pb-1 pt-2 md:hidden">
            <div className="h-1 w-10 rounded-full bg-foreground/15" aria-hidden />
          </div>
          <StudioSidebar chrome="responsive" className="min-h-0 flex-1" {...sidebarProps} />
        </aside>

        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">
          <div className="h-[52px] shrink-0">
            <StudioTopBar modelId={modelId} sku={sceneSku} displayName={displayName ?? initialScene?.name} />
          </div>
          <div className="relative min-h-0 flex-1 bg-studio-canvas">
            {catalogLook.backgroundItem ? (
              <ViewportBackground
                backgroundItem={catalogLook.backgroundItem}
                customBackground={resolvedSceneSettings.customBackground}
                fallbackColor={LIGHTING_PRESETS[lighting].background}
              />
            ) : null}
            <ViewerCanvas
              modelUrl={modelUrl}
              preset={preset}
              autoRotate={autoRotate}
              lighting={lighting}
              modelConfig={modelConfig}
              sceneSettings={resolvedSceneSettings}
              {...catalogLook}
            />
            <ZoomControls />
          </div>
        </div>

        <StudioPrimaryBar
          active={panel}
          onChange={setPanel}
          collapsible
          withEdit={Boolean(editPanel)}
          className="order-3 border-t border-foreground/10 md:hidden"
        />
      </div>

      {modals}
    </>
  );
}
