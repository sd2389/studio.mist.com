"use client";

import { Search } from "lucide-react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { sceneTitle } from "@/components/dashboard/scene-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import { useScenePages } from "@/features/scene";
import type { LookTemplate } from "@/lib/api/ingest";
import { SCENE_SEARCH_MAX_LENGTH } from "@/lib/api/scenes";
import { cn } from "@/lib/utils";
import { templateSwatches } from "../domain/look-templates";
import { panelLabel } from "./BatchPlanPanel";
import type { LookTemplates } from "./useLookTemplates";

/** Scenes the "Use the look of…" search lists; the search narrows them. */
const SCENES_SHOWN = 6;

function LookOption({
  title,
  selected,
  disabled,
  onSelect,
  children,
}: {
  title: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border px-3 py-2.5 text-left transition-colors disabled:cursor-default",
        selected ? "border-foreground/70 bg-surface" : "border-foreground/10 hover:border-foreground/30 hover:bg-surface/60",
      )}
    >
      <span className="block truncate text-sm font-medium text-foreground">{title}</span>
      {children}
    </button>
  );
}

/** A template's materials by role, in the designer's swatch style; a slot's own is captioned with its name. */
export function TemplateSwatches({ template }: { template: LookTemplate }) {
  const swatches = templateSwatches(template);
  if (swatches.length === 0) return <span className="mt-1 block text-xs text-muted-foreground">No materials: lighting and scene only.</span>;
  return (
    <span className="mt-2 flex flex-wrap gap-1">
      {swatches.map((swatch) => (
        <span key={swatch.key} className="flex w-16 flex-col items-center">
          <span className="w-full truncate text-center font-mono text-[9px] uppercase tracking-[0.14em] text-foreground/45">
            {swatch.caption}
          </span>
          <MaterialSwatch id={swatch.material} label={swatch.label} semantics="static" className="w-full" />
        </span>
      ))}
    </span>
  );
}

/** "Use the look of…": the user's scenes, searched; picking one makes its look a template. */
function SceneLookSearch({ making, onPick, onClose }: { making: boolean; onPick: (sceneId: number) => void; onClose: () => void }) {
  const { search, setSearch, result, loading } = useScenePages(SCENES_SHOWN);
  const scenes = result?.page?.items ?? [];
  const more = result?.page ? result.page.total - scenes.length : 0;

  return (
    <div className="space-y-2 rounded-2xl border border-foreground/10 bg-surface/40 p-3" aria-busy={loading || making}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Use the look of…</p>
        <Button type="button" variant="ghost" size="xs" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search your scenes…"
          aria-label="Search your scenes"
          maxLength={SCENE_SEARCH_MAX_LENGTH}
          className="h-8 rounded-full pl-8 text-xs"
        />
      </div>
      {result?.error ? <p className="text-xs text-destructive">{result.error}</p> : null}
      {!result ? <p className="text-xs text-muted-foreground">Loading your scenes…</p> : null}
      {result && !result.error && scenes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{search.trim() ? "No scenes match." : "No scenes yet: upload one and finish its look first."}</p>
      ) : null}
      {scenes.length > 0 ? (
        <ul className="space-y-1">
          {scenes.map((scene) => (
            <li key={scene.id}>
              <button
                type="button"
                disabled={making}
                onClick={() => onPick(scene.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
              >
                {scene.thumbnail_url ? (
                  <Image src={scene.thumbnail_url} alt="" width={32} height={32} unoptimized className="size-8 rounded-md object-cover" />
                ) : (
                  <span className="size-8 shrink-0 rounded-md bg-muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{sceneTitle(scene)}</span>
                {scene.sku ? <span className="font-mono text-[10px] text-muted-foreground">{scene.sku}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {more > 0 ? <p className="text-[11px] text-muted-foreground">{more} more: search to find them.</p> : null}
    </div>
  );
}

/**
 * The bulk upload's look: the studio's default, or a look template, which each design's scene
 * takes by slot role once converted. "Use the look of…" makes one of a finished scene's look.
 */
export function LookTemplatePicker({ looks, disabled }: { looks: LookTemplates; disabled: boolean }) {
  const [searching, setSearching] = useState(false);

  async function pick(sceneId: number) {
    if (await looks.makeFromScene(sceneId)) setSearching(false);
  }

  return (
    <div className="space-y-2">
      <p className={panelLabel}>Look</p>
      <div role="radiogroup" aria-label="Look" className="space-y-2">
        <LookOption title="Studio default" selected={looks.selectedId === null} disabled={disabled} onSelect={() => looks.select(null)}>
          <span className="mt-0.5 block text-xs text-muted-foreground">Each design keeps the materials its file suggests.</span>
        </LookOption>
        {looks.templates.map((template) => (
          <LookOption
            key={template.id}
            title={template.name}
            selected={looks.selectedId === template.id}
            disabled={disabled}
            onSelect={() => looks.select(template.id)}
          >
            <TemplateSwatches template={template} />
          </LookOption>
        ))}
      </div>
      {searching && !disabled ? (
        <SceneLookSearch making={looks.making} onPick={(sceneId) => void pick(sceneId)} onClose={() => setSearching(false)} />
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setSearching(true)}>
          Use the look of…
        </Button>
      )}
      {looks.making ? <p className="text-xs text-muted-foreground" role="status">Making the template…</p> : null}
      {looks.error ? (
        <p className="text-xs text-destructive" role="alert">
          {looks.error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Materials go by role: metal, gem and accent stones, whatever a design&apos;s layers are called. A slot with a
        material of its own, like a two-tone head, keeps it in designs that have one.
      </p>
    </div>
  );
}
