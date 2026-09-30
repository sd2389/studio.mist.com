import { bundledScene } from "@/lib/bundled-scenes";
import type { Metadata } from "next";
import { fetchSceneByViewerIdServer } from "@/lib/api/server-fetch";
import { ViewerShell } from "@/features/viewer";

type ViewerPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ViewerPageProps): Promise<Metadata> {
  const { id } = await params;
  const scene = bundledScene(id) ?? await fetchSceneByViewerIdServer(id).catch(() => null);
  return {
    title: scene?.name ? `${scene.name} · MIST Studio` : `Viewer · ${id}`,
  };
}

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { id } = await params;
  const initialScene = bundledScene(id) ?? await fetchSceneByViewerIdServer(id).catch(() => null);

  return <ViewerShell key={id} modelId={id} variant="studio" initialScene={initialScene} />;
}
