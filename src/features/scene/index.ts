/**
 * Scene feature — persisted viewer state API (backend via Next proxy).
 * Import from `@/features/scene` only from outside this folder.
 */
export {
  deleteScene,
  getScene,
  getSceneByViewerId,
  listScenes,
  updateScene,
  updateSceneByViewerId,
} from "@/lib/api/scenes";
export type {
  Render,
  Scene,
  SceneDetail,
  ScenePatch,
} from "@/lib/api/scenes";
