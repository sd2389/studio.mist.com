import { Layers, Sparkles } from "lucide-react";
import Link from "next/link";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { sceneTitle } from "@/components/dashboard/scene-display";
import { fetchScenesServer } from "@/lib/api/server-fetch";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import {
  applyDashboardFilters,
  type DashboardFilterResult,
  type DashboardFilters,
} from "@/lib/dashboard/filters";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Scene } from "@/lib/api/scenes";

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

type DashboardShellProps = {
  initialScenes: Scene[];
  initialError: string | null;
  filters: DashboardFilters;
  filterResult: DashboardFilterResult;
  allSceneCount: number;
  initialBilling: UserBillingSnapshot | null;
  userEmail?: string | null;
  isAdmin?: boolean;
};

export function DashboardShell({
  initialScenes,
  initialError,
  filters,
  filterResult,
  allSceneCount,
  initialBilling,
  userEmail,
  isAdmin,
}: DashboardShellProps) {
  const modelCreditsRemaining = initialBilling?.balances.model_credits ?? 0;
  const modelCreditsTotal = initialBilling?.allotments.model_credits ?? 0;
  const modelCreditsUsed = Math.max(0, modelCreditsTotal - modelCreditsRemaining);
  const modelPct = modelCreditsTotal
    ? Math.min(100, Math.round((modelCreditsUsed / modelCreditsTotal) * 100))
    : 0;

  const aiCreditsRemaining = initialBilling?.balances.ai_image_credits ?? 0;
  const aiCreditsTotal = initialBilling?.allotments.ai_image_credits ?? 0;
  const aiCreditsUsed = Math.max(0, aiCreditsTotal - aiCreditsRemaining);
  const aiPct = aiCreditsTotal
    ? Math.min(100, Math.round((aiCreditsUsed / aiCreditsTotal) * 100))
    : 0;
  const planLabel = initialBilling?.plan_label ?? "Free";

  const recent = initialScenes.slice(0, 2);

  return (
    <div className="relative isolate min-h-[100dvh] bg-app-canvas">
      <AppHeader userEmail={userEmail} showAdminLink={isAdmin} />
      <main
        id="dashboard-main"
        aria-labelledby="dashboard-title"
        className="relative"
      >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 size-[420px] rounded-full bg-primary/[0.06] blur-3xl dark:bg-primary/[0.12]" />
        <div className="absolute -right-32 top-1/3 size-[380px] rounded-full bg-[oklch(0.72_0.06_280)]/[0.07] blur-3xl dark:bg-[oklch(0.55_0.06_280)]/[0.15]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background/80 to-transparent dark:from-background/60" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
        <header className="relative mb-10 flex flex-col gap-6 border-b border-border/60 pb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-4">
            <Link
              href="/"
              className="inline-flex text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
            >
              DevJewels Studio
            </Link>
            <div className="space-y-2">
              <h1
                id="dashboard-title"
                className="font-display text-4xl font-normal italic leading-[1.08] tracking-tight text-foreground sm:text-5xl"
              >
                Workshop
              </h1>
              <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                Manage uploads, refine materials, and ship renders — everything tied to your scenes
                stays in sync.
              </p>
            </div>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 py-1 text-foreground shadow-sm backdrop-blur-sm dark:bg-card/70">
                <Layers className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span className="font-medium tabular-nums">{allSceneCount}</span>
                <span>{allSceneCount === 1 ? "scene" : "scenes"}</span>
              </span>
              <span className="hidden text-muted-foreground/80 sm:inline">in your library</span>
            </p>
          </div>
        </header>

        <section
          className="mb-12 grid gap-4 lg:grid-cols-[1fr_min(100%,320px)]"
          aria-label="Credits and activity"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="rounded-2xl border-border/70 bg-card/85 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-[2px] dark:bg-card/90 dark:ring-white/[0.06]">
              <CardContent className="space-y-5 p-6 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Model credits
                    </p>
                    <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                      {modelCreditsRemaining}
                      <span className="text-lg font-normal text-muted-foreground">
                        {" "}
                        / {modelCreditsTotal}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">Available model uploads</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full border-primary/25 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-foreground dark:bg-primary/[0.12]"
                  >
                    {planLabel} plan
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Progress value={modelPct} aria-label={`${modelPct} percent of model allowance used`} />
                  <p className="text-sm text-muted-foreground">
                    <span className="tabular-nums">{modelCreditsUsed}</span> credits used this cycle
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/70 bg-card/85 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-[2px] dark:bg-card/90 dark:ring-white/[0.06]">
              <CardContent className="space-y-5 p-6 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      AI image credits
                    </p>
                    <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                      {aiCreditsRemaining}
                      <span className="text-lg font-normal text-muted-foreground">
                        {" "}
                        / {aiCreditsTotal}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">AI background generations</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="rounded-full border-primary/25 bg-primary/[0.06] px-3 py-1 text-xs font-medium text-foreground dark:bg-primary/[0.12]"
                  >
                    {planLabel} plan
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Progress value={aiPct} aria-label={`${aiPct} percent of AI image allowance used`} />
                  <p className="text-sm text-muted-foreground">
                    <span className="tabular-nums">{aiCreditsUsed}</span> AI images used this cycle
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl border-border/70 bg-muted/35 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-[2px] dark:bg-muted/25 dark:ring-white/[0.05]">
            <CardContent className="flex flex-col justify-center gap-4 p-6 sm:p-7">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                Recent activity
              </p>
              {recent.length > 0 ? (
                <ul className="space-y-3 text-sm leading-snug text-muted-foreground">
                  {recent.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0"
                    >
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {sceneTitle(s)}
                      </span>
                      <time className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {formatRelativeTime(s.updated_at)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Upload or open a scene — recent edits will appear here.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <DashboardClient
          initialScenes={initialScenes}
          initialError={initialError}
          filters={filters}
          filterResult={filterResult}
        />
      </div>
    </main>
    </div>
  );
}

export async function loadDashboardData(filters?: DashboardFilters): Promise<{
  initialScenes: Scene[];
  initialError: string | null;
  filterResult: DashboardFilterResult;
  allSceneCount: number;
}> {
  try {
    const allScenes = await fetchScenesServer();
    const resolvedFilters = filters ?? { q: "", category: "", page: 1, limit: 10 };
    const filterResult = applyDashboardFilters(allScenes, resolvedFilters);
    return {
      initialScenes: filterResult.scenes,
      initialError: null,
      filterResult,
      allSceneCount: allScenes.length,
    };
  } catch (e) {
    return {
      initialScenes: [],
      initialError: e instanceof Error ? e.message : "Failed to load scenes",
      filterResult: {
        scenes: [],
        total: 0,
        page: 1,
        pageCount: 1,
        limit: filters?.limit ?? 10,
      },
      allSceneCount: 0,
    };
  }
}
