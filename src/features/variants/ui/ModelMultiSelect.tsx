"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScenePages } from "@/features/scene";
import { SCENE_SEARCH_MAX_LENGTH, scenePageCount, type Scene } from "@/lib/api/scenes";
import { cn } from "@/lib/utils";

const MODELS_PER_PAGE = 20;

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
  const { search, setSearch, query, result, loading, showPage } = useScenePages(MODELS_PER_PAGE);

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((value) => value !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (!result) {
    return <p className="text-xs text-muted-foreground">Loading models…</p>;
  }

  const page = result.page;
  const scenes = (page?.items ?? []).filter((scene) => scene.id !== currentSceneId);
  const onlyThisModel = !query.q && !search && page !== undefined && page.total <= 1 && scenes.length === 0;
  if (onlyThisModel) {
    return (
      <p className="text-xs text-muted-foreground">
        No other models in your library. Upload more to batch across models.
      </p>
    );
  }

  return (
    <div className="space-y-2" aria-busy={loading}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Select models
        </p>
        {selectedIds.length > 0 ? (
          <p className="text-[10px] text-muted-foreground">{selectedIds.length} selected</p>
        ) : null}
      </div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search models…"
          aria-label="Search models"
          maxLength={SCENE_SEARCH_MAX_LENGTH}
          disabled={disabled}
          className="h-8 pl-8 text-xs"
        />
      </div>
      {result.error ? (
        <p className="text-xs text-destructive">{result.error}</p>
      ) : (
        <ModelList
          scenes={scenes}
          emptyText={query.q ? "No models match your search." : "No other models on this page."}
          selectedIds={selectedIds}
          onToggle={toggle}
          disabled={disabled}
        />
      )}
      {page ? (
        <ModelPager
          page={page.page}
          pageCount={scenePageCount(page)}
          disabled={disabled || loading}
          onShow={showPage}
        />
      ) : null}
    </div>
  );
}

function ModelList({
  scenes,
  emptyText,
  selectedIds,
  onToggle,
  disabled,
}: {
  scenes: Scene[];
  emptyText: string;
  selectedIds: number[];
  onToggle: (id: number) => void;
  disabled: boolean;
}) {
  if (scenes.length === 0) {
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</p>;
  }
  return (
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
              onChange={() => onToggle(scene.id)}
            />
            <span className="truncate">{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function ModelPager({
  page,
  pageCount,
  disabled,
  onShow,
}: {
  page: number;
  pageCount: number;
  disabled: boolean;
  onShow: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        Page <span className="tabular-nums text-foreground">{page}</span> of{" "}
        <span className="tabular-nums">{pageCount}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Previous page of models"
          disabled={disabled || page <= 1}
          onClick={() => onShow(page - 1)}
        >
          <ChevronLeft className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Next page of models"
          disabled={disabled || page >= pageCount}
          onClick={() => onShow(page + 1)}
        >
          <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
