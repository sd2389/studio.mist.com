import type { Metadata } from "next";
import { fetchSceneByViewerIdServer } from "@/lib/api/server-fetch";
import { ViewerShell } from "@/features/viewer";

type ViewerPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ViewerPageProps): Promise<Metadata> {
  const { id } = await params;
  const scene = await fetchSceneByViewerIdServer(id).catch(() => null);
  return {
    title: scene?.name ? `${scene.name} · DevJewels Studio` : `Viewer · ${id}`,
  };
}

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { id } = await params;
  const initialScene = await fetchSceneByViewerIdServer(id).catch(() => null);

  return <ViewerShell modelId={id} variant="studio" initialScene={initialScene} />;
}
