import { create } from "zustand";

type CatalogParamsState = {
  metals: Record<string, Record<string, unknown>>;
  gems: Record<string, Record<string, unknown>>;
  registerMetal: (slug: string, params: Record<string, unknown>) => void;
  registerGem: (slug: string, params: Record<string, unknown>) => void;
  registerMetals: (items: Array<{ slug: string; params: Record<string, unknown> }>) => void;
  registerGems: (items: Array<{ slug: string; params: Record<string, unknown> }>) => void;
  getMetalParams: (slug: string) => Record<string, unknown> | null;
  getGemParams: (slug: string) => Record<string, unknown> | null;
};

export const useCatalogParamsStore = create<CatalogParamsState>((set, get) => ({
  metals: {},
  gems: {},
  registerMetal: (slug, params) =>
    set((state) => ({ metals: { ...state.metals, [slug]: params } })),
  registerGem: (slug, params) =>
    set((state) => ({ gems: { ...state.gems, [slug]: params } })),
  registerMetals: (items) =>
    set((state) => ({
      metals: {
        ...state.metals,
        ...Object.fromEntries(items.map((item) => [item.slug, item.params])),
      },
    })),
  registerGems: (items) =>
    set((state) => ({
      gems: {
        ...state.gems,
        ...Object.fromEntries(items.map((item) => [item.slug, item.params])),
      },
    })),
  getMetalParams: (slug) => get().metals[slug] ?? null,
  getGemParams: (slug) => get().gems[slug] ?? null,
}));
