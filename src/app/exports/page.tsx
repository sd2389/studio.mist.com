import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { ExportJobsPanel, ExportPlanNote, exportPlanFromSnapshot } from "@/features/render";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { formatCredits } from "@/lib/billing/format";
import { fetchBillingAccountServer } from "@/lib/billing/server-fetch";
import { isFeatureEnabledServer } from "@/lib/feature-flags/server-fetch";

// The flag is read for every request: a build that can't reach the API would prerender a 404.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Exports · MIST Studio",
  description: "Stills and videos rendered on our servers: progress, credits and downloads.",
};

export default async function ExportsPage() {
  // There is no Exports page until server exports are switched on.
  if (!(await isFeatureEnabledServer("server_exports"))) notFound();
  const user = await requirePageUser("/exports");
  const billing = await fetchBillingAccountServer();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader userEmail={user.email} showAdminLink={user.role === "admin"} />
      <main className="p-3">
        <section className="ice-panel mx-auto min-w-0 max-w-4xl overflow-hidden p-5 sm:p-8">
          <header className="flex flex-col gap-6 border-b border-foreground/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                Workshop / Exports
              </p>
              <h1 className="mt-7 text-[clamp(3rem,6vw,5.5rem)] font-light leading-[0.8] tracking-[-0.08em]">
                Exports
              </h1>
            </div>
            {billing ? (
              <div className="space-y-2 sm:max-w-xs sm:text-right">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/60">
                  Render credits{" "}
                  {formatCredits(billing.balances.render_credits, billing.allotments.render_credits)}
                </p>
                <ExportPlanNote plan={exportPlanFromSnapshot(billing)} />
              </div>
            ) : null}
          </header>
          <ExportJobsPanel className="mt-6" />
        </section>
      </main>
    </div>
  );
}
