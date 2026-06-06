import type { Scene } from "@/features/scene";
import { viewerIdFromModelKey } from "@/lib/model-key";

export function viewerHref(scene: Scene) {
  return `/model/${scene.id}`;
}

export function embedHref(scene: Scene) {
  return `/embed/${encodeURIComponent(viewerIdFromModelKey(scene.model_key))}`;
}

export function sceneLabel(scene: Scene): string {
  const material = scene.material && scene.material !== "original" ? scene.material : null;
  const lighting = scene.lighting || null;
  const parts = [material, lighting].filter(Boolean) as string[];
  return parts.length > 0 ? parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" · ") : "Original";
}

export function sceneTitle(scene: Scene): string {
  return scene.name?.trim() || viewerIdFromModelKey(scene.model_key) || `Scene ${scene.id}`;
}
