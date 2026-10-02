"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { Chip } from "@/components/ui/chip";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import { useSceneVariants } from "@/features/variants";
import type { SceneDetail } from "@/lib/api/scenes";
import type { EditCatalogs } from "@/lib/catalog/edit-catalogs";
import { productSpecsFromScene } from "@/lib/product-specs/defaults";
import { suggestProductSpecsFromMaterials } from "@/lib/product-specs/suggest-from-materials";
import type { ProductSpecs } from "@/lib/product-specs/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { buildEditorLayerRows } from "@/lib/upload/editor-layer-rows";
import { cn } from "@/lib/utils";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { hydrateUserLibraryStore } from "../lib/hydrate-user-library";
import { EditorBackgroundTab } from "./EditorBackgroundTab";
import { EditorEmbedTab } from "./EditorEmbedTab";
import { EditorEnvironmentTab } from "./EditorEnvironmentTab";
import { EditorGemMaterialTab } from "./EditorGemMaterialTab";
import { EditorGroundTab } from "./EditorGroundTab";
import { EditorImageTab } from "./EditorImageTab";
import { EditorLayersTab } from "./EditorLayersTab";
import { EditorMetalMaterialTab } from "./EditorMetalMaterialTab";
import { EditorPoseTab } from "./EditorPoseTab";
import { EditorPositionTab } from "./EditorPositionTab";
import { EditorSceneTab } from "./EditorSceneTab";
import { EditorSettingsTab, metadataFromScene } from "./EditorSettingsTab";
import { EditorSpecsTab } from "./EditorSpecsTab";
import { EditorVideoTab } from "./EditorVideoTab";

type SectionId =
  | "details"
  | "specs"
  | "metals"
  | "gems"
  | "metal-env"
  | "gem-env"
  | "background"
  | "ground"
  | "scenes"
  | "position"
  | "pose"
  | "layers"
  | "images"
  | "videos"
  | "embed";

const GROUPS: { label: string; sections: { id: SectionId; label: string }[] }[] = [
  {
    label: "Product",
    sections: [
      { id: "details", label: "Details" },
      { id: "specs", label: "Specs" },
    ],
  },
  {
    label: "Look",
    sections: [
      { id: "metals", label: "Metals" },
      { id: "gems", label: "Gems" },
      { id: "metal-env", label: "Metal light" },
      { id: "gem-env", label: "Gem light" },
      { id: "background", label: "Background" },
      { id: "ground", label: "Ground" },
      { id: "scenes", label: "Scenes" },
    ],
  },
  {
    label: "Arrange",
    sections: [
      { id: "position", label: "Position" },
      { id: "pose", label: "Camera" },
      { id: "layers", label: "Layers" },
    ],
  },
  {
    label: "Publish",
    sections: [
      { id: "images", label: "Image batch" },
      { id: "videos", label: "Video batch" },
      { id: "embed", label: "Embed" },
    ],
  },
];

type SceneEditPanelProps = {
  scene: SceneDetail;
  viewerId: string;
  modelUrl: string;
  modelConfig: PersistedModelConfig;
  onModelConfigChange: (config: PersistedModelConfig) => void;
  catalogs: EditCatalogs;
  /** Batch exports swap the model in the view while they render each variant. */
  onBatchModelUrlChange: (url: string | null) => void;
};

/**
 * Everything a saved scene can edit beyond the studio's quick pickers — product details and
 * variants, specs, the full catalogues and the user's library, placement and camera, layers,
 * batch exports and embed settings — as one panel of the studio sidebar.
 */
export function SceneEditPanel({
  scene,
  viewerId,
  modelUrl,
  modelConfig,
  onModelConfigChange,
  catalogs,
  onBatchModelUrlChange,
}: SceneEditPanelProps) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const [group, setGroup] = useState(0);
  const [section, setSection] = useState<SectionId>("details");
  const [metadata, setMetadata] = useState<UploadMetadata>(() => metadataFromScene(scene));
  const [productSpecs, setProductSpecs] = useState<ProductSpecs>(() => productSpecsFromScene(scene));
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  useEffect(() => {
    hydrateUserLibraryStore(catalogs.userMetals, catalogs.userGems);
    const params = useCatalogParamsStore.getState();
    if (catalogs.metals?.items.length) {
      params.registerMetals(catalogs.metals.items.map((item) => ({ slug: item.slug, params: item.params })));
    }
    if (catalogs.gems?.items.length) {
      params.registerGems(catalogs.gems.items.map((item) => ({ slug: item.slug, params: item.params })));
    }
  }, [catalogs]);

  const variants = useSceneVariants({ sceneId: scene.id, initialScene: scene, modelConfig, onModelConfigChange });
  const layerRows = useMemo(() => buildEditorLayerRows(modelConfig), [modelConfig]);
  const slot = activeSlot ?? layerRows[0]?.slotId ?? null;
  const bySlug = <T extends { slug: string }>(items: T[] | undefined) => new Map((items ?? []).map((item) => [item.slug, item]));
  const metalsBySlug = useMemo(() => bySlug(catalogs.metals?.items), [catalogs.metals]);
  const gemsBySlug = useMemo(() => bySlug(catalogs.gems?.items), [catalogs.gems]);

  const batch = {
    sceneId: scene.id,
    viewerId,
    modelUrl,
    modelConfig,
    variantsState: variants.variantsState,
    variantItems: variants.items,
    onModelConfigChange,
    setBatchModelUrl: onBatchModelUrlChange,
  };

  const content: Record<SectionId, () => ReactNode> = {
    details: () => (
      <EditorSettingsTab
        sceneId={scene.id}
        viewerId={viewerId}
        initialMetadata={metadata}
        preset={preset}
        lighting={lighting}
        onMetadataSaved={setMetadata}
        variantItems={variants.items}
        activeVariantId={variants.variantsState.activeVariantId}
        canAddVariant={variants.canAdd}
        onSaveVariant={() => variants.saveVariant()}
        onUpdateActiveVariant={variants.updateActiveVariant}
        onSwitchVariant={variants.switchVariant}
        onRenameVariant={variants.renameVariantById}
        onDeleteVariant={variants.deleteVariant}
      />
    ),
    specs: () => (
      <EditorSpecsTab
        sceneId={scene.id}
        initialSpecs={productSpecs}
        onSpecsSaved={setProductSpecs}
        onSuggestFromMaterials={(current) =>
          suggestProductSpecsFromMaterials({
            specs: current,
            slotSelections: useMaterialPresetStore.getState().slotSelections,
            modelConfig,
            metalsBySlug,
            gemsBySlug,
          })
        }
      />
    ),
    metals: () => (
      <EditorMetalMaterialTab activeSlot={slot} modelConfig={modelConfig} initialMetals={catalogs.metals} initialUserMetals={catalogs.userMetals} />
    ),
    gems: () => (
      <EditorGemMaterialTab activeSlot={slot} modelConfig={modelConfig} initialGems={catalogs.gems} initialUserGems={catalogs.userGems} />
    ),
    "metal-env": () => <EditorEnvironmentTab envType="metal_env" initialEnvironments={catalogs.metalEnvironments} />,
    "gem-env": () => <EditorEnvironmentTab envType="gem_env" initialEnvironments={catalogs.gemEnvironments} />,
    background: () => <EditorBackgroundTab initialBackgrounds={catalogs.backgrounds} initialUserBackgrounds={catalogs.userBackgrounds} />,
    ground: () => <EditorGroundTab initialGrounds={catalogs.grounds} />,
    scenes: () => <EditorSceneTab initialPresets={catalogs.scenePresets} />,
    position: () => <EditorPositionTab />,
    pose: () => <EditorPoseTab />,
    layers: () => (
      <EditorLayersTab modelConfig={modelConfig} onModelConfigChange={onModelConfigChange} activeSlot={slot} onActiveSlotChange={setActiveSlot} />
    ),
    images: () => <EditorImageTab {...batch} />,
    videos: () => <EditorVideoTab {...batch} />,
    embed: () => (
      <EditorEmbedTab viewerId={viewerId} sku={metadata.sku.trim() || undefined} displayName={metadata.name.trim() || undefined} />
    ),
  };
  const sectionLabel = GROUPS.flatMap((g) => g.sections).find((s) => s.id === section)?.label ?? "Edit";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-foreground/10 px-4 py-3">
        <div role="tablist" aria-label="Edit groups" className="grid grid-cols-4 gap-0.5 rounded-md border border-foreground/10 bg-surface/40 p-0.5">
          {GROUPS.map((g, i) => (
            <button
              key={g.label}
              type="button"
              role="tab"
              aria-selected={group === i}
              onClick={() => {
                setGroup(i);
                setSection(g.sections[0]!.id);
              }}
              className={cn(
                "rounded px-1 py-1 font-mono text-[10px] uppercase tracking-[0.24em] transition-colors",
                group === i ? "bg-foreground text-background" : "text-foreground/50 hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={`${GROUPS[group]!.label} sections`}>
          {GROUPS[group]!.sections.map((s) => (
            <Chip key={s.id} selected={section === s.id} onClick={() => setSection(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FeatureErrorBoundary featureName={sectionLabel}>{content[section]()}</FeatureErrorBoundary>
      </div>
    </div>
  );
}
