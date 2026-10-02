import Link from "next/link";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { fetchScenesServer } from "@/lib/api/server-fetch";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import {
  applyDashboardFilters,
  type DashboardFilterResult,
  type DashboardFilters,
} from "@/lib/dashboard/filters";
import { AppHeader } from "@/components/layout/AppHeader";
import type { Scene } from "@/lib/api/scenes";

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
  const modelCredits = initialBilling?.balances.model_credits ?? 0;
  const modelTotal = initialBilling?.allotments.model_credits ?? 0;
  const aiCredits = initialBilling?.balances.ai_image_credits ?? 0;
  const aiTotal = initialBilling?.allotments.ai_image_credits ?? 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader userEmail={userEmail} showAdminLink={isAdmin} />
      <main className="grid min-h-[calc(100dvh-76px)] gap-3 p-3 lg:grid-cols-[248px_1fr]">
        <aside className="ice-panel hidden flex-col overflow-hidden lg:flex">
          <div className="p-6">
            <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">
              Index
            </p>
            {[
              ["Objects", allSceneCount],
              ["Renders", "—"],
              ["Materials", "—"],
              ["Embeds", "—"],
            ].map(([label, value], index) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-foreground/10 py-3.5 text-[10px]"
              >
                <span className="flex items-center gap-2">
                  {index === 0 ? (
                    <i className="size-2 rounded-full bg-foreground" />
                  ) : null}
                  {label}
                </span>
                <span>{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto border-t border-foreground/10 p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">
              Monthly capacity
            </p>
            <p className="mt-2 text-5xl font-light tracking-[-0.07em]">
              {modelCredits}/{modelTotal}
            </p>
            <p className="mt-1 text-xs">Model credits available</p>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/60">
              AI images {aiCredits}/{aiTotal}
            </p>
          </div>
        </aside>
        <section className="ice-panel min-w-0 overflow-hidden p-5 sm:p-8">
          <header className="flex flex-col gap-6 border-b border-foreground/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                Workshop / Objects
              </p>
              <h1 className="mt-7 text-[clamp(3.8rem,7.6vw,7rem)] font-light leading-[0.78] tracking-[-0.08em]">
                <span className="text-foreground/25">
                  {String(allSceneCount).padStart(2, "0")}
                </span>{" "}
                / Objects
              </h1>
            </div>
            <Link
              href="/upload-model"
              className="self-start rounded-full bg-foreground px-6 py-4 font-mono text-[10px] uppercase tracking-[0.24em] text-background sm:self-auto"
            >
              ＋ Add new object
            </Link>
          </header>
          <div className="mt-5">
            <DashboardClient
              initialScenes={initialScenes}
              initialError={initialError}
              filters={filters}
              filterResult={filterResult}
            />
          </div>
        </section>
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
    const resolvedFilters = filters ?? {
      q: "",
      category: "",
      page: 1,
      limit: 10,
    };
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
