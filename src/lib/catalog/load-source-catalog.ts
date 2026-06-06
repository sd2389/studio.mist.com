import "server-only";

import { upstreamFetch } from "@/lib/auth/upstream";
import type {
  BackgroundItem,
  CatalogItem,
  CatalogPage,
  EnvironmentItem,
  GemItem,
  GroundItem,
  MetalItem,
  ScenePresetItem,
} from "@/lib/catalog/types";
import type { SourceCatalogItem, SourceCatalogPayload } from "@/lib/source-catalog";

const PAGE_SIZE = 500;

async function fetchCatalogPage<T extends CatalogItem>(path: string, offset: number): Promise<CatalogPage<T> | null> {
  const res = await upstreamFetch(`${path}?limit=${PAGE_SIZE}&offset=${offset}`);
  if (!res.ok) return null;
  return (await res.json()) as CatalogPage<T>;
}

async function fetchAllCatalogItems<T extends CatalogItem>(path: string): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchCatalogPage<T>(path, offset);
    if (!page) break;
    items.push(...page.items);
    if (page.items.length === 0 || offset + page.items.length >= page.total) break;
    offset += PAGE_SIZE;
  }
  return items;
}

function toSourceItem(
  slug: string,
  label: string,
  type: string,
  category: string,
  swatchUrl: string | null,
  value?: string,
): SourceCatalogItem {
  return {
    _id: slug,
    type,
    category,
    name: label,
    thumbnail: swatchUrl ?? undefined,
    value: value ?? slug,
    isActive: true,
  };
}

function metalToSource(item: MetalItem): SourceCatalogItem {
  return toSourceItem(item.slug, item.label, item.category, item.family, item.swatch_url);
}

function gemToSource(item: GemItem): SourceCatalogItem {
  return toSourceItem(item.slug, item.label, "gem", item.gem_family, item.swatch_url);
}

function environmentToSource(item: EnvironmentItem): SourceCatalogItem {
  const type = item.env_type === "metal_env" ? "environment-metal" : "environment-gem";
  return toSourceItem(item.slug, item.label, type, item.env_type, item.swatch_url ?? item.preview_url);
}

function backgroundToSource(item: BackgroundItem): SourceCatalogItem {
  return toSourceItem(item.slug, item.label, "background", "background", item.swatch_url);
}

function groundToSource(item: GroundItem): SourceCatalogItem {
  return toSourceItem(item.slug, item.label, "ground", "ground", item.swatch_url);
}

function scenePresetToSource(item: ScenePresetItem): SourceCatalogItem {
  return toSourceItem(item.slug, item.label, "scene-preset", "vjson", item.swatch_url);
}

/** Load the owned catalog as a legacy-compatible source payload (SSR + API route). */
export async function loadSourceCatalogServer(): Promise<SourceCatalogPayload | null> {
  try {
    const [metals, gems, environments, backgrounds, grounds, scenePresets] = await Promise.all([
      fetchAllCatalogItems<MetalItem>("/catalog/metals"),
      fetchAllCatalogItems<GemItem>("/catalog/gems"),
      fetchAllCatalogItems<EnvironmentItem>("/catalog/environments"),
      fetchAllCatalogItems<BackgroundItem>("/catalog/backgrounds"),
      fetchAllCatalogItems<GroundItem>("/catalog/grounds"),
      fetchAllCatalogItems<ScenePresetItem>("/catalog/scene-presets"),
    ]);

    const metalItems = metals.map(metalToSource);
    const gemItems = gems.map(gemToSource);
    const sceneItems = [
      ...environments.map(environmentToSource),
      ...backgrounds.map(backgroundToSource),
      ...grounds.map(groundToSource),
      ...scenePresets.map(scenePresetToSource),
    ];

    return {
      metals: metalItems,
      gems: gemItems,
      scenes: sceneItems,
      counts: {
        metals: metalItems.length,
        gems: gemItems.length,
        scenes: sceneItems.length,
      },
    };
  } catch {
    return null;
  }
}
