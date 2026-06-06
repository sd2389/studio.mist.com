import { create } from "zustand";
import type { UserMaterialItem } from "@/lib/library/types";

type UserLibraryState = {
  materialsById: Record<number, UserMaterialItem>;
  hydrateMaterials: (items: UserMaterialItem[]) => void;
  upsertMaterial: (item: UserMaterialItem) => void;
  removeMaterial: (id: number) => void;
  getMaterial: (id: number) => UserMaterialItem | undefined;
};

export const useUserLibraryStore = create<UserLibraryState>((set, get) => ({
  materialsById: {},
  hydrateMaterials: (items) =>
    set({
      materialsById: Object.fromEntries(items.map((item) => [item.id, item])),
    }),
  upsertMaterial: (item) =>
    set((state) => ({
      materialsById: { ...state.materialsById, [item.id]: item },
    })),
  removeMaterial: (id) =>
    set((state) => {
      const next = { ...state.materialsById };
      delete next[id];
      return { materialsById: next };
    }),
  getMaterial: (id) => get().materialsById[id],
}));
