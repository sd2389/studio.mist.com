"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LayoutDashboard, SlidersHorizontal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ViewerCanvas } from "@/features/viewer/ui/ViewerCanvas";
import { useSceneVariants } from "@/features/variants";
import { ViewportBackground } from "@/features/viewer/ui/ViewportBackground";
import { ZoomControls } from "@/features/viewer/ui/ZoomControls";
import type {
  BackgroundItem,
  CatalogPage,
  EnvironmentItem,
  GemItem,
  GroundItem,
  MetalItem,
  ScenePresetItem,
} from "@/lib/catalog/types";
import type { LibraryPage, UserAssetItem, UserMaterialItem } from "@/lib/library/types";
import { hydrateUserLibraryStore } from "@/features/editor/lib/hydrate-user-library";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { BG_BY_LIGHTING } from "@/lib/viewer-lighting";
import type { SceneDetail } from "@/lib/api/scenes";
import type { SourceCatalogPayload } from "@/lib/source-catalog";
import { viewerIdFromModelKey } from "@/lib/model-key";
import { buildEditorLayerRows } from "@/lib/upload/editor-layer-rows";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useEditorSceneState } from "../hooks/useEditorSceneState";
import { EditorTabRail } from "./EditorTabRail";
import { metadataFromScene } from "./EditorSettingsTab";
import { ViewportControls } from "./ViewportControls";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";

type ModelEditorShellProps = {
  sceneId: number;
  initialScene: SceneDetail;
  initialCatalog?: SourceCatalogPayload | null;
  initialMetals?: CatalogPage<MetalItem> | null;
  initialGems?: CatalogPage<GemItem> | null;
  initialMetalEnvironments?: CatalogPage<EnvironmentItem> | null;
  initialGemEnvironments?: CatalogPage<EnvironmentItem> | null;
  initialBackgrounds?: CatalogPage<BackgroundItem> | null;
  initialGrounds?: CatalogPage<GroundItem> | null;
  initialScenePresets?: CatalogPage<ScenePresetItem> | null;
  initialUserMetals?: LibraryPage<UserMaterialItem> | null;
  initialUserGems?: LibraryPage<UserMaterialItem> | null;
  initialUserBackgrounds?: LibraryPage<UserAssetItem> | null;
};

export function ModelEditorShell({
  sceneId,
  initialScene,
  initialCatalog = null,
  initialMetals = null,
  initialGems = null,
  initialMetalEnvironments = null,
  initialGemEnvironments = null,
  initialBackgrounds = null,
  initialGrounds = null,
  initialScenePresets = null,
  initialUserMetals = null,
  initialUserGems = null,
  initialUserBackgrounds = null,
}: ModelEditorShellProps) {
  const libraryHydratedRef = useRef(false);
  if (!libraryHydratedRef.current) {
    hydrateUserLibraryStore(initialUserMetals, initialUserGems);
    if (initialMetals?.items.length) {
      useCatalogParamsStore.getState().registerMetals(
        initialMetals.items.map((item) => ({ slug: item.slug, params: item.params })),
      );
    }
    if (initialGems?.items.length) {
      useCatalogParamsStore.getState().registerGems(
        initialGems.items.map((item) => ({ slug: item.slug, params: item.params })),
      );
    }
    libraryHydratedRef.current = true;
  }

  const viewerId = viewerIdFromModelKey(initialScene.model_key);
  const {
    modelUrl,
    preset,
    lighting,
    autoRotate,
    modelConfig,
    setModelConfig,
    resolvedSceneSettings,
    resolvedSceneCatalog,
  } = useEditorSceneState({
    sceneId,
    viewerId,
    initialScene,
    initialCatalog,
    initialSceneCatalog: {
      environments: {
        items: [
          ...(initialMetalEnvironments?.items ?? []),
          ...(initialGemEnvironments?.items ?? []),
        ],
        total:
          (initialMetalEnvironments?.total ?? 0) + (initialGemEnvironments?.total ?? 0),
        limit:
          (initialMetalEnvironments?.limit ?? 0) + (initialGemEnvironments?.limit ?? 0),
        offset: 0,
      },
      backgrounds: initialBackgrounds,
      grounds: initialGrounds,
      presets: initialScenePresets,
    },
  });

  const [metadata, setMetadata] = useState<UploadMetadata>(() => metadataFromScene(initialScene));
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [screenshotToast, setScreenshotToast] = useState<string | null>(null);
  const [batchModelUrl, setBatchModelUrl] = useState<string | null>(null);

  const {
    variantsState,
    items: variantItems,
    canAdd: canAddVariant,
    activeVariantId,
    saveVariant,
    updateActiveVariant,
    switchVariant,
    deleteVariant,
    renameVariantById,
  } = useSceneVariants({
    sceneId,
    initialScene,
    modelConfig,
    onModelConfigChange: setModelConfig,
  });

  const effectiveModelUrl = batchModelUrl ?? modelUrl;

  const layerRows = useMemo(() => buildEditorLayerRows(modelConfig), [modelConfig]);
  const resolvedActiveSlot = activeSlot ?? layerRows[0]?.slotId ?? null;

  const displayName = metadata.name.trim() || initialScene.name || viewerId;

  const handleScreenshot = (dataUrl: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${viewerId}-viewport.png`;
    a.click();
    setScreenshotToast("Screenshot saved");
    window.setTimeout(() => setScreenshotToast(null), 2200);
  };

  const tabRail = (
    <EditorTabRail
      sceneId={sceneId}
      viewerId={viewerId}
      metadata={metadata}
      preset={preset}
      lighting={lighting}
      modelConfig={modelConfig}
      onModelConfigChange={setModelConfig}
      onMetadataSaved={setMetadata}
      activeSlot={resolvedActiveSlot}
      onActiveSlotChange={setActiveSlot}
      initialMetals={initialMetals}
      initialGems={initialGems}
      initialMetalEnvironments={initialMetalEnvironments}
      initialGemEnvironments={initialGemEnvironments}
      initialBackgrounds={initialBackgrounds}
      initialGrounds={initialGrounds}
      initialScenePresets={initialScenePresets}
      initialUserMetals={initialUserMetals}
      initialUserGems={initialUserGems}
      initialUserBackgrounds={initialUserBackgrounds}
      variantsState={variantsState}
      variantItems={variantItems}
      canAddVariant={canAddVariant}
      onSaveVariant={() => saveVariant()}
      onUpdateActiveVariant={updateActiveVariant}
      onSwitchVariant={switchVariant}
      onRenameVariant={renameVariantById}
      onDeleteVariant={deleteVariant}
      modelUrl={modelUrl}
      setBatchModelUrl={setBatchModelUrl}
      className="h-full"
    />
  );

  return (
    <>
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-muted/30 lg:flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <Link
                href="/dashboard"
                className="inline-flex text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              >
                DevJewels Studio
              </Link>
              <p className="truncate text-base font-semibold text-foreground sm:text-lg">{displayName}</p>
              {metadata.sku ? (
                <p className="truncate text-[10px] text-muted-foreground sm:text-xs">SKU · {metadata.sku}</p>
              ) : null}
              {activeVariantId ? (
                <p className="truncate text-[10px] text-primary sm:text-xs">
                  Variant · {variantItems.find((item) => item.id === activeVariantId)?.name}
                </p>
              ) : null}
            </div>
            <Link
              href="/dashboard"
              className={cn(
                "hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex",
              )}
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Dashboard
            </Link>
          </header>

          <motion.div
            className="relative min-h-0 flex-1"
            initial={{ opacity: 0.88, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <ViewportBackground
              backgroundItem={resolvedSceneCatalog.backgroundItem}
              customBackground={resolvedSceneSettings.customBackground}
              fallbackColor={BG_BY_LIGHTING[lighting]}
            />
            <ViewerCanvas
              modelUrl={effectiveModelUrl}
              preset={preset}
              autoRotate={autoRotate}
              lighting={lighting}
              modelConfig={modelConfig}
              sceneSettings={resolvedSceneSettings}
              metalEnvironment={resolvedSceneCatalog.metalEnvironment}
              gemEnvironment={resolvedSceneCatalog.gemEnvironment}
              backgroundItem={resolvedSceneCatalog.backgroundItem}
              groundItem={resolvedSceneCatalog.groundItem}
            />
            <ViewportControls onScreenshot={handleScreenshot} />
            <ZoomControls />
            {screenshotToast ? (
              <p
                className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground shadow-md"
                role="status"
              >
                {screenshotToast}
              </p>
            ) : null}
          </motion.div>
        </div>

        <aside className="hidden h-full w-[min(380px,34vw)] shrink-0 border-l border-border bg-card lg:flex">
          {tabRail}
        </aside>
      </div>

      <Button
        type="button"
        size="lg"
        className="fixed bottom-5 right-4 z-50 gap-2 rounded-full border border-border bg-card text-foreground shadow-sm backdrop-blur-sm lg:hidden"
        onClick={() => setMobilePanelOpen(true)}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Editor
      </Button>

      <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
        <SheetContent
          side="right"
          className="w-[min(100vw,380px)] border-border bg-card p-0"
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base font-semibold text-foreground">Model editor</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100dvh-56px)]">{tabRail}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
