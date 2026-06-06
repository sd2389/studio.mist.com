"use client";

import { useMemo } from "react";
import type {
  BackgroundItem,
  CatalogPage,
  EnvironmentItem,
  GroundItem,
  ScenePresetItem,
} from "@/lib/catalog/types";

export type SceneCatalogIndex = {
  environments: Map<string, EnvironmentItem>;
  backgrounds: Map<string, BackgroundItem>;
  grounds: Map<string, GroundItem>;
  presets: Map<string, ScenePresetItem>;
};

export type SceneCatalogInitial = {
  environments?: CatalogPage<EnvironmentItem> | null;
  backgrounds?: CatalogPage<BackgroundItem> | null;
  grounds?: CatalogPage<GroundItem> | null;
  presets?: CatalogPage<ScenePresetItem> | null;
};

function indexBySlug<T extends { slug: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.slug, item]));
}

export function buildSceneCatalogIndex(initial: SceneCatalogInitial): SceneCatalogIndex {
  return {
    environments: indexBySlug(initial.environments?.items ?? []),
    backgrounds: indexBySlug(initial.backgrounds?.items ?? []),
    grounds: indexBySlug(initial.grounds?.items ?? []),
    presets: indexBySlug(initial.presets?.items ?? []),
  };
}

export function useSceneCatalogIndex(initial: SceneCatalogInitial): SceneCatalogIndex {
  return useMemo(() => buildSceneCatalogIndex(initial), [initial]);
}

export function lookupEnvironment(
  index: SceneCatalogIndex,
  slug: string | null | undefined,
): EnvironmentItem | null {
  if (!slug) return null;
  return index.environments.get(slug) ?? null;
}

export function lookupBackground(
  index: SceneCatalogIndex,
  slug: string | null | undefined,
): BackgroundItem | null {
  if (!slug) return null;
  return index.backgrounds.get(slug) ?? null;
}

export function lookupGround(
  index: SceneCatalogIndex,
  slug: string | null | undefined,
): GroundItem | null {
  if (!slug) return null;
  return index.grounds.get(slug) ?? null;
}

export function lookupScenePreset(
  index: SceneCatalogIndex,
  slug: string | null | undefined,
): ScenePresetItem | null {
  if (!slug) return null;
  return index.presets.get(slug) ?? null;
}
