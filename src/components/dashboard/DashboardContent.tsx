"use client";

import { motion } from "framer-motion";
import { MoreHorizontal, Plus, Sparkles, Trash2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UploadModal } from "@/components/modals/UploadModal";
import { ScenePreview } from "@/components/dashboard/ScenePreview";
import { ModelUploadZone } from "@/components/upload/ModelUploadZone";
import { deleteScene } from "@/lib/api/scenes";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { listScenes, type Scene } from "@/lib/api/scenes";
// keep deleteScene import grouped above near other API imports
// (import handled in the block above)
import { FREE_CREDITS, PRO_CREDITS } from "@/lib/dummy-dashboard";
import { viewerIdFromModelKey } from "@/lib/model-key";
import { cn } from "@/lib/utils";

function viewerHref(scene: Scene) {
  return `/viewer/${encodeURIComponent(viewerIdFromModelKey(scene.model_key))}`;
}

function embedHref(scene: Scene) {
  return `/embed/${encodeURIComponent(viewerIdFromModelKey(scene.model_key))}`;
}

function sceneLabel(scene: Scene): string {
  const material = scene.material && scene.material !== "original" ? scene.material : null;
  const lighting = scene.lighting || null;
  const parts = [material, lighting].filter(Boolean) as string[];
  return parts.length > 0 ? parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" · ") : "Original";
}

function sceneTitle(scene: Scene): string {
  return scene.name?.trim() || viewerIdFromModelKey(scene.model_key) || `Scene ${scene.id}`;
}

const RTF = typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
  ? new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  : null;

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = d.getTime() - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  if (!RTF) return d.toLocaleDateString();

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];

  for (const [unit, secs] of units) {
    if (absSec >= secs) {
      const value = Math.round(diffMs / 1000 / secs);
      return RTF.format(value, unit);
    }
  }
  return "just now";
}

export function DashboardContent() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const creditsUsed = 12;
  const creditsTotal = FREE_CREDITS;
  const pct = Math.min(100, Math.round((creditsUsed / creditsTotal) * 100));

  const load = useCallback(async () => {
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

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (id: number, name: string) => {
      if (!window.confirm(`Delete "${name}"? This removes the scene and its renders.`)) return;
      try {
        await deleteScene(id);
        setScenes((prev) => (prev ?? []).filter((s) => s.id !== id));
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [],
  );

  const hasScenes = !!scenes && scenes.length > 0;
  const recent = scenes?.slice(0, 2) ?? [];

  return (
    <div className="relative min-h-[100dvh] bg-app-canvas">
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground"
            >
              DevJewels Studio
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Your jewelry scenes, synced from the API.</p>
          </div>
          <Button
            type="button"
            className="gap-2"
            onClick={() => setUploadOpen(true)}
          >
            <UploadCloud className="size-4" aria-hidden />
            Upload model
          </Button>
        </header>

        <section className="mb-10 grid gap-4 lg:grid-cols-[1fr_280px]">
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Credits</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {creditsTotal - creditsUsed}{" "}
                    <span className="text-base font-normal text-muted-foreground">/ {creditsTotal} free</span>
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-border text-muted-foreground"
                >
                  Pro: {PRO_CREDITS} / mo
                </Badge>
              </div>
              <Progress value={pct} />
              <p className="text-xs text-muted-foreground">{creditsUsed} renders used this cycle</p>
            </CardContent>
          </Card>

          <Card className="border-border bg-muted/40 shadow-sm">
            <CardContent className="flex flex-col justify-center gap-3 p-6">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="size-4 text-primary" aria-hidden />
                Recent activity
              </p>
              {loading && recent.length === 0 ? (
                <ul className="space-y-2 text-xs">
                  <li className="h-3 animate-pulse rounded bg-muted" />
                  <li className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                </ul>
              ) : recent.length > 0 ? (
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {recent.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span className="truncate">{sceneTitle(s)}</span>
                      <span className="shrink-0 text-muted-foreground/80">{relativeTime(s.updated_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Your scenes</h2>
            <div className="flex items-center gap-1">
              <Link
                href="/gallery"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-muted-foreground hover:text-foreground",
                )}
              >
                Gallery
              </Link>
              <Link
                href="/stones"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-muted-foreground hover:text-foreground",
                )}
              >
                Cuts
              </Link>
              <Link
                href="/viewer/clearcoat"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-muted-foreground hover:text-foreground",
                )}
              >
                <Plus className="size-4" aria-hidden />
                New from demo
              </Link>
            </div>
          </div>

          {loading && !scenes ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="overflow-hidden border-border bg-card shadow-sm">
                  <div className="aspect-[4/3] animate-pulse bg-muted" />
                  <CardContent className="space-y-3 p-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <p className="text-sm font-medium text-foreground">Couldn&apos;t load your scenes</p>
                <p className="text-xs text-muted-foreground">{error}</p>
                <Button type="button" size="sm" onClick={() => void load()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : !hasScenes ? (
            <Card className="border-border bg-card shadow-sm">
              <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  No scenes yet — upload your first model
                </p>
                <ModelUploadZone variant="compact" />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(scenes ?? []).map((scene, i) => (
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                >
                  <Card className="group overflow-hidden border-border bg-card shadow-sm transition hover:border-border hover:shadow-md">
                    <div className="relative aspect-[4/3] bg-gradient-to-br from-stone-100 via-neutral-50 to-stone-200">
                      <div className="absolute inset-0">
                        <ScenePreview modelKey={scene.model_key} />
                      </div>
                      <Badge className="pointer-events-none absolute left-3 top-3 border-0 bg-card/90 text-[10px] text-foreground shadow-sm">
                        {sceneLabel(scene)}
                      </Badge>
                    </div>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{sceneTitle(scene)}</p>
                          <p className="text-xs text-muted-foreground">
                            Updated {relativeTime(scene.updated_at)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "icon-sm" }),
                              "text-muted-foreground",
                            )}
                            aria-label="Scene actions"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="border-border bg-popover text-popover-foreground">
                            <DropdownMenuItem className="p-0">
                              <Link href={viewerHref(scene)} className="flex w-full px-1.5 py-1">
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="p-0">
                              <Link href={embedHref(scene)} className="flex w-full px-1.5 py-1">
                                Share embed
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2 text-destructive focus:text-destructive"
                              onClick={() => void handleDelete(scene.id, sceneTitle(scene))}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Separator className="bg-border" />
                      <div className="flex gap-2">
                        <Link
                          href={viewerHref(scene)}
                          className={cn(
                            buttonVariants({ size: "sm" }),
                            "flex-1",
                          )}
                        >
                          Edit
                        </Link>
                        <Button type="button" variant="outline" size="sm" className="flex-1 border-border">
                          Remix
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      <UploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

