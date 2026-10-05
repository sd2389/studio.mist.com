"use client";

import { useCallback, useState } from "react";
import { DashboardSceneSettingsDialog } from "@/components/dashboard/DashboardSceneSettingsDialog";
import { DashboardScenesPanel } from "@/components/dashboard/DashboardScenesPanel";
import { DashboardToolbar } from "@/components/dashboard/DashboardToolbar";
import { deleteScene, listScenes, type Scene } from "@/features/scene";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import type {
  DashboardFilterResult,
  DashboardFilters,
} from "@/lib/dashboard/filters";
import { formatRelativeTime } from "@/lib/relative-time";

type DashboardClientProps = {
  initialScenes: Scene[];
  initialError: string | null;
  filters: DashboardFilters;
  filterResult: DashboardFilterResult;
};

export function DashboardClient({
  initialScenes,
  initialError,
  filters,
  filterResult,
}: DashboardClientProps) {
  const [scenes, setScenes] = useState<Scene[] | null>(initialScenes);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [settingsScene, setSettingsScene] = useState<Scene | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [previousInitial, setPreviousInitial] = useState({ scenes: initialScenes, error: initialError });
  if (previousInitial.scenes !== initialScenes || previousInitial.error !== initialError) {
    setPreviousInitial({ scenes: initialScenes, error: initialError });
    setScenes(initialScenes);
    setError(initialError);
  }

  const refreshScenes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listScenes(filters);
      setScenes(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenes");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleDelete = useCallback(async (id: number, name: string) => {
    if (
      !window.confirm(
        `Delete "${name}"? This removes the scene and its renders.`,
      )
    )
      return;
    try {
      await deleteScene(id);
      setScenes((prev) => (prev ?? []).filter((s) => s.id !== id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed");
    }
  }, []);

  const handleOpenSettings = useCallback((scene: Scene) => {
    setSettingsScene(scene);
    setSettingsOpen(true);
  }, []);

  const handleMetadataSaved = useCallback(
    (sceneId: number, metadata: UploadMetadata) => {
      setScenes((prev) =>
        (prev ?? []).map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                name: metadata.name.trim() || null,
                sku: metadata.sku.trim() || null,
                category: metadata.category || null,
                note: metadata.note.trim() || null,
              }
            : scene,
        ),
      );
    },
    [],
  );

  const hasScenes = !!scenes && scenes.length > 0;
  const showEmptyFiltered = !hasScenes && filterResult.total === 0 && !error;

  return (
    <>
      <DashboardToolbar
        filters={filters}
        total={filterResult.total}
        page={filterResult.page}
        pageCount={filterResult.pageCount}
      />

      <DashboardScenesPanel
        loading={loading}
        scenes={scenes}
        error={error}
        hasScenes={hasScenes}
        showEmptyFiltered={showEmptyFiltered}
        relativeTime={formatRelativeTime}
        onRetry={refreshScenes}
        onDelete={handleDelete}
        onOpenSettings={handleOpenSettings}
      />

      <DashboardSceneSettingsDialog
        scene={settingsScene}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={handleMetadataSaved}
      />
    </>
  );
}
