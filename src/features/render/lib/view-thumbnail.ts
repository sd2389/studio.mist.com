import { setSceneThumbnail, type Scene } from "@/features/scene";
import { captureViewThumbnail } from "./view-capture";

/**
 * "Set as thumbnail" (ADR 0005): the live view, at most 1024 px on its longest side, becomes the
 * scene's thumbnail (`PUT /scenes/{id}/thumbnail`). Free and unmarked: it is no render, and no
 * bigger than a screenshot. Answers the scene, or null before the viewer draws.
 */
export async function setThumbnailFromView(sceneId: number): Promise<Scene | null> {
  const image = await captureViewThumbnail();
  return image ? setSceneThumbnail(sceneId, image) : null;
}
