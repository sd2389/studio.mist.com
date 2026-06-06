"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Gem, MoreHorizontal, Plus, Settings2, Trash2, UploadCloud } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Scene } from "@/features/scene";
import { ScenePreview } from "@/components/dashboard/ScenePreview";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { FeatureGate } from "@/features/feature-flags";
import { cn } from "@/lib/utils";
import { embedHref, sceneLabel, sceneTitle, viewerHref } from "./scene-display";

type Props = {
  loading: boolean;
  scenes: Scene[] | null;
  error: string | null;
  hasScenes: boolean;
  showEmptyFiltered: boolean;
  relativeTime: (iso: string) => string;
  onRetry: () => void;
  onDelete: (id: number, displayName: string) => void;
  onOpenSettings: (scene: Scene) => void;
};

function SceneCardPreview({ scene }: { scene: Scene }) {
  if (scene.thumbnail_url) {
    return (
      <Image
        src={scene.thumbnail_url}
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-cover"
        unoptimized
      />
    );
  }
  return <ScenePreview modelKey={scene.model_key} />;
}

export function DashboardScenesPanel({
  loading,
  scenes,
  error,
  hasScenes,
  showEmptyFiltered,
  relativeTime,
  onRetry,
  onDelete,
  onOpenSettings,
}: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <section aria-labelledby="scenes-heading">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2
            id="scenes-heading"
            className="font-display text-2xl font-normal italic tracking-tight text-foreground sm:text-3xl"
          >
            Your scenes
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Open in the editor, share embeds, or remove drafts you don&apos;t need.
          </p>
        </div>
        <nav
          aria-label="Scene shortcuts"
          className="flex flex-wrap items-center gap-2 sm:justify-end"
        >
          <FeatureGate feature="gallery">
            <Link
              href="/gallery"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-10 min-h-11 rounded-full px-4 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Gallery
            </Link>
          </FeatureGate>
          <FeatureGate feature="stones">
            <Link
              href="/stones"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-10 min-h-11 rounded-full px-4 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              Cuts
            </Link>
          </FeatureGate>
          <Link
            href="/viewer/clearcoat"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-10 min-h-11 gap-2 rounded-full border-border/80 bg-card/60 px-4 shadow-sm backdrop-blur-sm hover:bg-card",
            )}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            New from demo
          </Link>
        </nav>
      </div>

      {loading && !scenes ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading scenes">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden rounded-2xl border-border/60 bg-card/80 shadow-sm">
              <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-muted to-muted/40" />
              <CardContent className="space-y-3 p-5">
                <div className="h-5 w-2/3 animate-pulse rounded-md bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded-md bg-muted/80" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="rounded-2xl border-destructive/25 bg-card shadow-sm ring-1 ring-destructive/10">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-base font-semibold text-foreground">Couldn&apos;t load your scenes</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{error}</p>
            <Button type="button" className="min-h-11 rounded-xl px-6" onClick={() => void onRetry()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : showEmptyFiltered ? (
        <Card className="rounded-2xl border-dashed border-border/80 bg-muted/20 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center sm:p-14">
            <p className="font-display text-xl italic text-foreground">No models match your filters</p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Try a different search term or category, or upload a new model.
            </p>
          </CardContent>
        </Card>
      ) : !hasScenes ? (
        <Card className="rounded-2xl border-dashed border-border/80 bg-muted/20 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]">
          <CardContent className="flex flex-col items-center gap-6 p-10 text-center sm:p-14">
            <div
              className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-primary/20"
              aria-hidden
            >
              <Gem className="size-7" strokeWidth={1.25} />
            </div>
            <div className="max-w-md space-y-2">
              <p className="font-display text-xl italic text-foreground">Start with a model</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Upload GLB, STL, or Rhino 3DM — parsed in your browser, then saved with layer controls.
              </p>
            </div>
            <Link
              href="/upload-model"
              className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 rounded-xl px-6 shadow-md")}
            >
              <UploadCloud className="size-4 shrink-0" aria-hidden />
              Upload New Model
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(scenes ?? []).map((scene, i) => (
            <motion.div
              key={scene.id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { delay: Math.min(i, 8) * 0.045, duration: 0.28, ease: [0.22, 1, 0.36, 1] }
              }
            >
              <Card className="group/card overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm ring-1 ring-black/[0.03] transition-[box-shadow,border-color] duration-200 hover:border-primary/30 hover:shadow-lg dark:ring-white/[0.06] dark:hover:border-primary/40">
                <div className="relative aspect-[4/3] bg-gradient-to-br from-stone-100 via-neutral-50 to-stone-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:from-stone-900/40 dark:via-neutral-900/30 dark:to-stone-950/50 dark:shadow-none">
                  <div className="absolute inset-0">
                    <SceneCardPreview scene={scene} />
                  </div>
                  <Badge className="pointer-events-none absolute left-3 top-3 border-0 bg-card/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground shadow-md backdrop-blur-sm dark:bg-card/90">
                    {scene.category?.trim() || sceneLabel(scene)}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-3 top-3 size-9 rounded-full bg-card/90 text-muted-foreground shadow-md backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive dark:bg-card/80"
                    aria-label={`Delete ${sceneTitle(scene)}`}
                    onClick={() => void onDelete(scene.id, sceneTitle(scene))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-semibold leading-tight text-foreground">{sceneTitle(scene)}</p>
                      {scene.sku?.trim() ? (
                        <p className="truncate text-xs text-muted-foreground">SKU · {scene.sku.trim()}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Updated{" "}
                        <time className="tabular-nums">{relativeTime(scene.updated_at)}</time>
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon" }),
                          "size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        aria-label={`Actions for ${sceneTitle(scene)}`}
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="border-border bg-popover text-popover-foreground" align="end">
                        <DropdownMenuItem className="p-0">
                          <Link
                            href={viewerHref(scene)}
                            className="flex w-full min-h-10 items-center px-3 py-2 text-sm focus-visible:outline-none"
                          >
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => onOpenSettings(scene)}
                        >
                          <Settings2 className="size-3.5" aria-hidden />
                          Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem className="p-0">
                          <Link
                            href={embedHref(scene)}
                            className="flex w-full min-h-10 items-center px-3 py-2 text-sm focus-visible:outline-none"
                          >
                            Share embed
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => void onDelete(scene.id, sceneTitle(scene))}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Separator className="bg-border/70" />
                  <div className="flex gap-2">
                    <Link
                      href={viewerHref(scene)}
                      className={cn(
                        buttonVariants({ size: "default" }),
                        "h-10 min-h-11 flex-1 rounded-xl shadow-sm transition-shadow hover:shadow-md",
                      )}
                    >
                      Edit
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 min-h-11 flex-1 rounded-xl border-border/80"
                      onClick={() => onOpenSettings(scene)}
                    >
                      Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
