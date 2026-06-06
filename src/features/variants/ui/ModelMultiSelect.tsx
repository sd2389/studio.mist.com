"use client";

import { useEffect, useState } from "react";
import { listScenes, type Scene } from "@/lib/api/scenes";
import { cn } from "@/lib/utils";

type ModelMultiSelectProps = {
  currentSceneId: number;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

export function ModelMultiSelect({
  currentSceneId,
  selectedIds,
  onChange,
  disabled = false,
}: ModelMultiSelectProps) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void listScenes()
      .then((items) => {
        if (!mounted) return;
        setScenes(items.filter((scene) => scene.id !== currentSceneId));
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load models");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [currentSceneId]);

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((value) => value !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading models…</p>;
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  if (scenes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No other models in your library. Upload more to batch across models.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Select models
      </p>
      <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {scenes.map((scene) => {
          const checked = selectedIds.includes(scene.id);
          const label = scene.name?.trim() || scene.sku?.trim() || `Model ${scene.id}`;
          return (
            <label
              key={scene.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                checked ? "bg-primary/10 text-foreground" : "hover:bg-muted",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(scene.id)}
              />
              <span className="truncate">{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
