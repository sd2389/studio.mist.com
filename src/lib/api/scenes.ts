import { apiDelete, apiGet, apiPatch, apiPutFile } from "@/lib/api/client";
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

/** The longest search `GET /scenes` takes. */
export const SCENE_SEARCH_MAX_LENGTH = 200;

/** `GET /scenes` filters: `q` searches name, SKU, note and category; `limit` is at most 100. */
export type SceneListParams = Partial<{
  q: string;
  category: string;
  page: number;
  limit: number;
}>;

/** One page of the signed-in user's scenes, newest first; `total` counts every match. */
export type SceneListPage = {
  items: Scene[];
  total: number;
  page: number;
  limit: number;
};

/** Pages a scene list fills at its page size; never fewer than one. */
export function scenePageCount(page: Pick<SceneListPage, "total" | "limit">): number {
  return Math.max(1, Math.ceil(page.total / page.limit));
}

/** The query string for `GET /scenes`, with only the filters that are set. */
export function sceneListSearch(params: SceneListParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function listScenes(params: SceneListParams = {}): Promise<SceneListPage> {
  return apiGet<SceneListPage>(`/api/scenes${sceneListSearch(params)}`);
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

/** The largest thumbnail the API takes (`PUT /scenes/{id}/thumbnail`). */
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/**
 * Makes `image`, a PNG, JPEG or WebP of at most 1024 px a side, the scene's thumbnail: free and
 * unmarked, kept as WebP and published with the scene. Answers the scene with its new thumbnail.
 */
export function setSceneThumbnail(id: number, image: Blob): Promise<Scene> {
  return apiPutFile<Scene>(`/api/scenes/${id}/thumbnail`, image);
}
