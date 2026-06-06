import type { LibraryPage, UserMaterialItem } from "@/lib/library/types";
import { useUserLibraryStore } from "@/stores/user-library-store";

export function hydrateUserLibraryStore(
  ...pages: Array<LibraryPage<UserMaterialItem> | null | undefined>
): void {
  const items = pages.flatMap((page) => page?.items ?? []);
  if (items.length === 0) return;
  useUserLibraryStore.getState().hydrateMaterials(items);
}
