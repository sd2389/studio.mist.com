"use client";

import type { ReactNode } from "react";
import {
  Circle,
  Code2,
  Download,
  Gem,
  ImageIcon,
  Layers,
  LayoutGrid,
  Move3d,
  ScanLine,
  Settings,
  Sparkles,
  Square,
  Sun,
  Video,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { cn } from "@/lib/utils";
import { EditorAiImageTab } from "./EditorAiImageTab";
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
import { EditorSettingsTab } from "./EditorSettingsTab";
import { EditorVideoTab } from "./EditorVideoTab";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { ModelVariant, SceneVariantsState } from "@/lib/variants/types";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

export type EditorTabId =
  | "settings"
  | "metal-material"
  | "gem-material"
  | "metal-env"
  | "gem-env"
  | "background"
  | "ground"
  | "scene"
  | "position"
  | "pose"
  | "layers"
  | "image"
  | "ai-image"
  | "video"
  | "embed";

type EditorTabRailProps = {
  sceneId: number;
  viewerId: string;
  metadata: UploadMetadata;
  preset: MaterialPresetId;
  lighting: LightingPresetId;
  modelConfig: PersistedModelConfig;
  onModelConfigChange: (config: PersistedModelConfig) => void;
  onMetadataSaved: (metadata: UploadMetadata) => void;
  activeSlot: string | null;
  onActiveSlotChange: (slotId: string) => void;
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
  variantsState: SceneVariantsState;
  variantItems: ModelVariant[];
  canAddVariant: boolean;
  onSaveVariant: () => void;
  onUpdateActiveVariant: () => boolean;
  onSwitchVariant: (variantId: string | null) => void;
  onRenameVariant: (variantId: string, name: string) => void;
  onDeleteVariant: (variantId: string) => void;
  modelUrl: string;
  setBatchModelUrl: (url: string | null) => void;
  defaultTab?: EditorTabId;
  className?: string;
};

function TabPanel({ label, children }: { label: string; children: ReactNode }) {
  return <FeatureErrorBoundary featureName={label}>{children}</FeatureErrorBoundary>;
}

const TAB_ITEMS: { id: EditorTabId; label: string; icon: typeof Settings }[] = [
  { id: "settings", label: "Settings", icon: Settings },
  { id: "metal-material", label: "Metal Material", icon: Circle },
  { id: "gem-material", label: "Gem Material", icon: Gem },
  { id: "metal-env", label: "Metal Env", icon: Sun },
  { id: "gem-env", label: "Gem Env", icon: Sparkles },
  { id: "background", label: "Background", icon: ImageIcon },
  { id: "ground", label: "Ground", icon: Square },
  { id: "scene", label: "Scene", icon: LayoutGrid },
  { id: "position", label: "Position", icon: Move3d },
  { id: "pose", label: "Pose", icon: ScanLine },
  { id: "layers", label: "Layers", icon: Layers },
  { id: "image", label: "Image", icon: Download },
  { id: "ai-image", label: "AI Visuals", icon: Sparkles },
  { id: "video", label: "Video", icon: Video },
  { id: "embed", label: "Embed", icon: Code2 },
];

export function EditorTabRail({
  sceneId,
  viewerId,
  metadata,
  preset,
  lighting,
  modelConfig,
  onModelConfigChange,
  onMetadataSaved,
  activeSlot,
  onActiveSlotChange,
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
  variantsState,
  variantItems,
  canAddVariant,
  onSaveVariant,
  onUpdateActiveVariant,
  onSwitchVariant,
  onRenameVariant,
  onDeleteVariant,
  modelUrl,
  setBatchModelUrl,
  defaultTab = "settings",
  className,
}: EditorTabRailProps) {
  return (
    <Tabs
      defaultValue={defaultTab}
      orientation="vertical"
      className={cn("flex h-full min-h-0 flex-row gap-0", className)}
    >
      <TabsList
        variant="line"
        className="h-full shrink-0 overflow-y-auto rounded-none border-l border-border bg-card px-1 py-3"
        aria-label="Editor tabs"
      >
        {TAB_ITEMS.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="size-10 justify-center px-0 py-0"
              aria-label={tab.label}
              title={tab.label}
            >
              <Icon className="size-[18px]" aria-hidden />
              <span className="sr-only">{tab.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-card">
        <TabsContent value="settings" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Settings">
          <EditorSettingsTab
            sceneId={sceneId}
            viewerId={viewerId}
            initialMetadata={metadata}
            preset={preset}
            lighting={lighting}
            onMetadataSaved={onMetadataSaved}
            variantItems={variantItems}
            activeVariantId={variantsState.activeVariantId}
            canAddVariant={canAddVariant}
            onSaveVariant={onSaveVariant}
            onUpdateActiveVariant={onUpdateActiveVariant}
            onSwitchVariant={onSwitchVariant}
            onRenameVariant={onRenameVariant}
            onDeleteVariant={onDeleteVariant}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="metal-material" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Metal Material">
          <EditorMetalMaterialTab
            activeSlot={activeSlot}
            modelConfig={modelConfig}
            initialMetals={initialMetals}
            initialUserMetals={initialUserMetals}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="gem-material" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Gem Material">
          <EditorGemMaterialTab
            activeSlot={activeSlot}
            modelConfig={modelConfig}
            initialGems={initialGems}
            initialUserGems={initialUserGems}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="metal-env" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Metal Env">
          <EditorEnvironmentTab
            envType="metal_env"
            initialEnvironments={initialMetalEnvironments}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="gem-env" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Gem Env">
          <EditorEnvironmentTab envType="gem_env" initialEnvironments={initialGemEnvironments} />
          </TabPanel>
        </TabsContent>
        <TabsContent value="background" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Background">
          <EditorBackgroundTab
            initialBackgrounds={initialBackgrounds}
            initialUserBackgrounds={initialUserBackgrounds}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="ground" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Ground">
          <EditorGroundTab initialGrounds={initialGrounds} />
          </TabPanel>
        </TabsContent>
        <TabsContent value="scene" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Scene">
          <EditorSceneTab initialPresets={initialScenePresets} />
          </TabPanel>
        </TabsContent>
        <TabsContent value="position" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Position">
          <EditorPositionTab />
          </TabPanel>
        </TabsContent>
        <TabsContent value="pose" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Pose">
          <EditorPoseTab />
          </TabPanel>
        </TabsContent>
        <TabsContent value="layers" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Layers">
          <EditorLayersTab
            modelConfig={modelConfig}
            onModelConfigChange={onModelConfigChange}
            activeSlot={activeSlot}
            onActiveSlotChange={onActiveSlotChange}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="image" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Image export">
          <EditorImageTab
            sceneId={sceneId}
            viewerId={viewerId}
            modelUrl={modelUrl}
            modelConfig={modelConfig}
            variantsState={variantsState}
            variantItems={variantItems}
            onModelConfigChange={onModelConfigChange}
            setBatchModelUrl={setBatchModelUrl}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="ai-image" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="AI Visuals">
            <EditorAiImageTab viewerId={viewerId} />
          </TabPanel>
        </TabsContent>
        <TabsContent value="video" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Video export">
          <EditorVideoTab
            sceneId={sceneId}
            viewerId={viewerId}
            modelUrl={modelUrl}
            modelConfig={modelConfig}
            variantsState={variantsState}
            variantItems={variantItems}
            onModelConfigChange={onModelConfigChange}
            setBatchModelUrl={setBatchModelUrl}
          />
          </TabPanel>
        </TabsContent>
        <TabsContent value="embed" className="m-0 h-full min-h-0 overflow-hidden">
          <TabPanel label="Embed">
          <EditorEmbedTab
            viewerId={viewerId}
            sku={metadata.sku.trim() || undefined}
            displayName={metadata.name.trim() || undefined}
          />
          </TabPanel>
        </TabsContent>
      </div>
    </Tabs>
  );
}
