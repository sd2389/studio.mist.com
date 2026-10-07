import type { SceneLook } from "@/lib/api/scenes";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { useUserLibraryStore } from "@/stores/user-library-store";

/**
 * Makes a look's catalogue and library materials resolvable by the slot materials and their
 * swatches. The embed has no catalogue or library access, the studio's Edit tab loads first pages
 * only, and the bulk upload page's look templates bring their own (`LookTemplate.look`).
 */
export function registerLookMaterials(look: SceneLook | null | undefined): void {
  if (!look) return;
  const catalog = useCatalogParamsStore.getState();
  catalog.registerMetals(look.metals);
  catalog.registerGems(look.gems);
  const library = useUserLibraryStore.getState();
  for (const material of look.user_materials) library.upsertMaterial(material);
}
