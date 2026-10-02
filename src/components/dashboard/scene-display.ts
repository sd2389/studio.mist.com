import type { Scene } from "@/features/scene";
import { viewerIdFromModelKey } from "@/lib/model-key";

export function viewerHref(scene: Scene) {
  return `/viewer/${encodeURIComponent(viewerIdFromModelKey(scene.model_key))}`;
}

/** The published piece's embed, keyed by SKU like every embed link; none until a SKU publishes it. */
export function embedHref(scene: Scene): string | null {
  const sku = scene.sku?.trim();
  return sku ? `/embed/${encodeURIComponent(sku)}` : null;
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
