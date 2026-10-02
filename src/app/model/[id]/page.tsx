import { notFound, redirect } from "next/navigation";
import { fetchSceneByIdServer } from "@/lib/api/server-fetch";
import { viewerIdFromModelKey } from "@/lib/model-key";

type ModelPageProps = {
  params: Promise<{ id: string }>;
};

/** The editor now lives in the studio's Edit tab; old /model/:id links land there. */
export default async function ModelPage({ params }: ModelPageProps) {
  const { id } = await params;
  const sceneId = Number(id);
  if (!Number.isFinite(sceneId)) notFound();
  const scene = await fetchSceneByIdServer(sceneId).catch(() => null);
  if (!scene) notFound();
  redirect(`/viewer/${encodeURIComponent(viewerIdFromModelKey(scene.model_key))}`);
}
