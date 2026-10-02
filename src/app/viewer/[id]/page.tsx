import { bundledScene } from "@/lib/bundled-scenes";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fetchSceneByViewerIdServer } from "@/lib/api/server-fetch";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { loadEditCatalogsServer, loadLookCatalogsServer } from "@/lib/catalog/edit-catalogs";
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
  const bundled = bundledScene(id);
  const initialScene = bundled ?? await fetchSceneByViewerIdServer(id).catch(() => null);
  // Saved scenes get the Edit tab when someone is signed in; the API still enforces ownership.
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  const editable = Boolean(!bundled && initialScene && signedIn);
  const catalogs = editable ? await loadEditCatalogsServer() : initialScene ? await loadLookCatalogsServer(initialScene) : null;

  return (
    <ViewerShell key={id} modelId={id} variant="studio" initialScene={initialScene} catalogs={catalogs} editable={editable} />
  );
}
