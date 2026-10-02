import { apiDelete, apiGet, apiPatch } from "@/lib/api/client";
import type { BackgroundItem, EnvironmentItem, GemItem, GroundItem, MetalItem } from "@/lib/catalog/types";
import type { UserMaterialItem } from "@/lib/library/types";
import type { ProductSpecs } from "@/lib/product-specs/types";
import type {
  PersistedModelConfig,
  SceneSettingsBuckets,
} from "@/lib/slot-materials/model-config";
import type { SceneVariantsState } from "@/lib/variants/types";

export type Scene = {
  id: number;
  name: string | null;
  sku: string | null;
  category: string | null;
  note: string | null;
  model_key: string;
  material: string;
  lighting: string;
  model_config: PersistedModelConfig;
  slot_selections: Record<string, string>;
  scene_settings: SceneSettingsBuckets;
  variants?: SceneVariantsState;
  product_specs?: ProductSpecs;
  model_url: string | null;
  thumbnail_key: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
  render_count: number;
};

export type Render = {
  id: number;
  scene_id: number;
  key: string;
  bytes: number;
  kind: string;
  material: string | null;
  lighting: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  url: string | null;
};

/**
 * The catalogue items and library materials a scene's saved look names, sent with the scene
 * so a view that only displays it (the embed) draws it without the auth-gated catalogue.
 */
export type SceneLook = {
  environments: EnvironmentItem[];
  backgrounds: BackgroundItem[];
  grounds: GroundItem[];
  metals: MetalItem[];
  gems: GemItem[];
  user_materials: UserMaterialItem[];
};

export type SceneDetail = Omit<Scene, "render_count"> & { renders: Render[]; look?: SceneLook };

export type ScenePatch = Partial<{
  name: string;
  sku: string;
  category: string;
  note: string;
  material: string;
  lighting: string;
  model_config: PersistedModelConfig;
  slot_selections: Record<string, string>;
  scene_settings: SceneSettingsBuckets;
  variants?: SceneVariantsState;
  product_specs?: ProductSpecs;
}>;

export function listScenes(): Promise<Scene[]> {
  return apiGet<Scene[]>("/api/scenes");
}

export function getScene(id: number): Promise<SceneDetail> {
  return apiGet<SceneDetail>(`/api/scenes/${id}`);
}

export function updateScene(id: number, patch: ScenePatch): Promise<Scene> {
  return apiPatch<Scene>(`/api/scenes/${id}`, patch);
}

export function getSceneByViewerId(viewerId: string): Promise<SceneDetail> {
  return apiGet<SceneDetail>(`/api/scenes/by-model/${encodeURIComponent(viewerId)}`);
}

export function updateSceneByViewerId(viewerId: string, patch: ScenePatch): Promise<Scene> {
  return apiPatch<Scene>(`/api/scenes/by-model/${encodeURIComponent(viewerId)}`, patch);
}

export function deleteScene(id: number): Promise<void> {
  return apiDelete<void>(`/api/scenes/${id}`);
}
