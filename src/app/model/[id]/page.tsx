import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelEditorShell } from "@/features/editor";
import {
  fetchBackgroundsCatalogServer,
  fetchEnvironmentsCatalogServer,
  fetchGemsCatalogServer,
  fetchGroundsCatalogServer,
  fetchMetalsCatalogServer,
  fetchScenePresetsCatalogServer,
} from "@/lib/catalog/load-catalog-server";
import {
  fetchUserAssetsServer,
  fetchUserMaterialsServer,
} from "@/lib/library/load-library-server";
import { fetchSceneByIdServer, fetchSourceCatalogServer } from "@/lib/api/server-fetch";

type ModelPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ModelPageProps): Promise<Metadata> {
  const { id } = await params;
  const sceneId = Number(id);
  if (!Number.isFinite(sceneId)) {
    return { title: "Model · DevJewels Studio" };
  }
  const scene = await fetchSceneByIdServer(sceneId).catch(() => null);
  return {
    title: scene?.name ? `${scene.name} · DevJewels Studio` : `Model · ${id}`,
  };
}

export default async function ModelPage({ params }: ModelPageProps) {
  const { id } = await params;
  const sceneId = Number(id);
  if (!Number.isFinite(sceneId)) notFound();

  const [
    scene,
    catalog,
    initialMetals,
    initialGems,
    initialMetalEnvironments,
    initialGemEnvironments,
    initialBackgrounds,
    initialGrounds,
    initialScenePresets,
    initialUserMetals,
    initialUserGems,
    initialUserBackgrounds,
  ] = await Promise.all([
    fetchSceneByIdServer(sceneId),
    fetchSourceCatalogServer(),
    fetchMetalsCatalogServer(),
    fetchGemsCatalogServer(),
    fetchEnvironmentsCatalogServer({ env_type: "metal_env" }),
    fetchEnvironmentsCatalogServer({ env_type: "gem_env" }),
    fetchBackgroundsCatalogServer(),
    fetchGroundsCatalogServer(),
    fetchScenePresetsCatalogServer(),
    fetchUserMaterialsServer({ kind: "metal" }),
    fetchUserMaterialsServer({ kind: "gem" }),
    fetchUserAssetsServer({ asset_type: "background" }),
  ]);
  if (!scene) notFound();

  return (
    <ModelEditorShell
      sceneId={sceneId}
      initialScene={scene}
      initialCatalog={catalog}
      initialMetals={initialMetals}
      initialGems={initialGems}
      initialMetalEnvironments={initialMetalEnvironments}
      initialGemEnvironments={initialGemEnvironments}
      initialBackgrounds={initialBackgrounds}
      initialGrounds={initialGrounds}
      initialScenePresets={initialScenePresets}
      initialUserMetals={initialUserMetals}
      initialUserGems={initialUserGems}
      initialUserBackgrounds={initialUserBackgrounds}
    />
  );
}
