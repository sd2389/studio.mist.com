"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { modelExtFromUrl, viewerIdFromModelKey } from "@/lib/model-key";
import { EmbedChrome } from "./EmbedChrome";
import { StudioPrimaryBar } from "./StudioPrimaryBar";
import { StudioSidebar } from "./StudioSidebar";
import { useSavedScene } from "./useSavedScene";
import { useStudioModals } from "./useStudioModals";
import { ViewerStage } from "./ViewerStage";
import { SceneEditPanel } from "@/features/editor/ui/SceneEditPanel";
import {
  lookupBackground,
  lookupEnvironment,
  lookupGround,
} from "@/lib/catalog/scene-catalog-index";
import type { EditCatalogs } from "@/lib/catalog/edit-catalogs";
import { StudioTopBar } from "./StudioTopBar";
import { ZoomControls } from "./ZoomControls";
import { useStudioPrimaryPanel } from "./useStudioPrimaryPanel";
import { resolveSceneSettings } from "../domain/resolve-scene-settings";
import { buildLookCatalogIndex } from "../domain/saved-look";
import { cn } from "@/lib/utils";
import type { EmbedSettings } from "@/lib/embed-settings";
import { resolveModelUrl } from "@/lib/model-url";
import type { SceneDetail } from "@/lib/api/scenes";
import {
  fetchSourceCatalog,
  type SourceCatalogPayload,
} from "@/lib/source-catalog";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

type ViewerShellProps = {
  modelId: string;
  variant: "studio" | "embed";
  initialScene?: SceneDetail | null;
  embedSettings?: EmbedSettings;
  displayName?: string;
  /** Catalogue pages the Edit tab browses; the scene brings the items its own look uses. */
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
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);

  const [catalog, setCatalog] = useState<SourceCatalogPayload | null>(null);
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

  const { modelConfig, setModelConfig, sceneSku, sceneLook } = useSavedScene({
    modelId,
    variant,
    initialScene,
  });

  const resolvedSceneSettings = useMemo(
    () => resolveSceneSettings(sceneSettings, catalog?.scenes),
    [catalog, sceneSettings],
  );

  const { openers, modals } = useStudioModals(modelId, sceneSku);

  // Catalogue environments, background and ground the look names, from the scene or the Edit tab.
  const sceneCatalog = useMemo(() => buildLookCatalogIndex(catalogs, sceneLook), [catalogs, sceneLook]);
  const catalogLook = {
    metalEnvironment: lookupEnvironment(sceneCatalog, sceneSettings["ENVIRONMENT-METAL"]),
    gemEnvironment: lookupEnvironment(sceneCatalog, sceneSettings["ENVIRONMENT-GEM"]),
    backgroundItem: lookupBackground(sceneCatalog, sceneSettings.BACKGROUND),
    groundItem: lookupGround(sceneCatalog, sceneSettings.GROUND),
  };
  const stage = {
    modelUrl,
    preset,
    lighting,
    modelConfig,
    sceneSettings: resolvedSceneSettings,
    ...catalogLook,
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
    return (
      <EmbedView
        modelId={modelId}
        initialScene={initialScene}
        embedSettings={embedSettings}
        displayName={displayName}
        stage={stage}
        autoRotate={autoRotate}
      />
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
          <ViewerStage {...stage} autoRotate={autoRotate}>
            <ZoomControls />
          </ViewerStage>
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

type EmbedViewProps = {
  modelId: string;
  initialScene: SceneDetail | null;
  embedSettings?: EmbedSettings;
  displayName?: string;
  stage: Omit<ComponentProps<typeof ViewerStage>, "autoRotate" | "children">;
  /** The studio's own setting, for embeds that don't choose. */
  autoRotate: boolean;
};

/** The view-only embed: the stage with zoom controls, under optional title chrome. */
function EmbedView({ modelId, initialScene, embedSettings, displayName, stage, autoRotate }: EmbedViewProps) {
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
      <ViewerStage {...stage} autoRotate={embedAutoRotate}>
        {showZoomControls ? <ZoomControls variant="embed" touchLayout /> : null}
      </ViewerStage>
    </div>
  );
}
