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
    <div className="min-h-dvh bg-[#d8d5cd] text-[#10100f]">
      <AppHeader userEmail={userEmail} showAdminLink={isAdmin} />
      <main className="grid min-h-[calc(100dvh-70px)] lg:grid-cols-[260px_1fr]">
        <aside className="hidden flex-col border-r border-black lg:flex">
          <div className="p-6">
            <p className="mb-5 text-[9px] font-black uppercase tracking-[0.2em]">
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
                className="flex items-center justify-between border-b border-black/25 py-3 text-[11px] uppercase"
              >
                <span className="flex items-center gap-2">
                  {index === 0 ? <i className="size-2 bg-[#ef5b2a]" /> : null}
                  {label}
                </span>
                <span>{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto border-t border-black p-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em]">
              Monthly capacity
            </p>
            <p className="mt-1 text-5xl font-black tracking-[-0.07em]">
              {modelCredits}/{modelTotal}
            </p>
            <p className="mt-1 text-xs">Model credits available</p>
            <p className="mt-5 text-[9px] uppercase tracking-[0.14em] text-black/60">
              AI images {aiCredits}/{aiTotal}
            </p>
          </div>
        </aside>
        <section className="min-w-0 p-5 sm:p-7">
          <header className="flex flex-col gap-6 border-b border-black pb-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#ef5b2a]">
                Workshop / Objects
              </p>
              <h1 className="mt-6 text-[clamp(4rem,8vw,7.5rem)] font-black uppercase leading-[0.72] tracking-[-0.085em]">
                {String(allSceneCount).padStart(2, "0")} / Objects
              </h1>
            </div>
            <Link
              href="/upload-model"
              className="self-start bg-black px-5 py-4 text-[9px] font-black uppercase tracking-[0.16em] text-white sm:self-auto"
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
