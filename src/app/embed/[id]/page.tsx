import { ViewerShell } from "@/features/viewer";
import { FeatureDisabledPage } from "@/features/feature-flags";
import { fetchSceneByEmbedIdServer } from "@/lib/api/server-fetch";
import { parseEmbedUrlParams, resolveEmbedSettings } from "@/lib/embed-settings";
import { fetchFeatureFlagsServer, isFeatureEnabled } from "@/lib/feature-flags/server-fetch";
import { viewerIdFromModelKey } from "@/lib/model-key";

type EmbedPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmbedPage({ params, searchParams }: EmbedPageProps) {
  // Fail open when the flags service is unreachable (matches isFeatureEnabled(null)).
  const flags = await fetchFeatureFlagsServer().catch(() => null);
  if (!isFeatureEnabled(flags, "embed")) {
    return <FeatureDisabledPage title="Embed unavailable" />;
  }

  const { id } = await params;
  const query = await searchParams;
  const initialScene = await fetchSceneByEmbedIdServer(id).catch(() => null);
  const viewerId = initialScene
    ? viewerIdFromModelKey(initialScene.model_key)
    : id;
  const displayName = initialScene?.name?.trim() || initialScene?.sku?.trim() || viewerId;
  const embedSettings = resolveEmbedSettings(
    initialScene?.scene_settings?.embed,
    parseEmbedUrlParams(query),
  );

  return (
    <ViewerShell
      modelId={viewerId}
      variant="embed"
      initialScene={initialScene}
      embedSettings={embedSettings}
      displayName={displayName}
    />
  );
}
