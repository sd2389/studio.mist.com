"use client";

import { UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardSceneSettingsDialog } from "@/components/dashboard/DashboardSceneSettingsDialog";
import { DashboardScenesPanel } from "@/components/dashboard/DashboardScenesPanel";
import { DashboardToolbar } from "@/components/dashboard/DashboardToolbar";
import { deleteScene, listScenes, type Scene } from "@/features/scene";
import type { UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import { buttonVariants } from "@/components/ui/button";
import { FeatureGate } from "@/features/feature-flags";
import type { DashboardFilterResult, DashboardFilters } from "@/lib/dashboard/filters";
import { cn } from "@/lib/utils";

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  const absSec = Math.abs(diffMs) / 1000;
  for (const [unit, secs] of units) {
    if (absSec >= secs) {
      return rtf.format(Math.round(diffMs / 1000 / secs), unit);
    }
  }
  return "just now";
}

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

  useEffect(() => {
    setScenes(initialScenes);
    setError(initialError);
  }, [initialScenes, initialError]);

  const refreshScenes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listScenes();
      setScenes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenes");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = useCallback(async (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}"? This removes the scene and its renders.`)) return;
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

  const handleMetadataSaved = useCallback((sceneId: number, metadata: UploadMetadata) => {
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
  }, []);

  const hasScenes = !!scenes && scenes.length > 0;
  const showEmptyFiltered = !hasScenes && filterResult.total === 0 && !error;

  return (
    <>
      <FeatureGate feature="upload">
        <div className="mb-10 flex justify-end sm:absolute sm:right-6 sm:top-10 lg:right-0 lg:top-12">
          <Link
            href="/upload-model"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 shrink-0 gap-2 rounded-xl px-5 shadow-md",
            )}
          >
            <UploadCloud className="size-4 shrink-0" aria-hidden />
            Upload New Model
          </Link>
        </div>
      </FeatureGate>

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
