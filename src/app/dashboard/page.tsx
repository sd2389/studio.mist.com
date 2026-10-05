import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { loadDashboardData } from "@/components/dashboard/load-dashboard-data";
import { parseDashboardSearchParams } from "@/lib/dashboard/filters";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { fetchBillingAccountServer } from "@/lib/billing/server-fetch";
import { isFeatureEnabledServer } from "@/lib/feature-flags/server-fetch";

export const metadata: Metadata = {
  title: "Workshop · MIST Studio",
  description: "Your jewelry scenes, credits, and uploads — synced from the API.",
};

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requirePageUser("/dashboard");
  const params = await searchParams;
  const filters = parseDashboardSearchParams(params);
  const [{ initialScenes, initialError, filterResult, allSceneCount }, billing, showExports] =
    await Promise.all([
      loadDashboardData(filters),
      fetchBillingAccountServer(),
      isFeatureEnabledServer("server_exports"),
    ]);

  return (
    <DashboardShell
      initialScenes={initialScenes}
      initialError={initialError}
      filters={filters}
      filterResult={filterResult}
      allSceneCount={allSceneCount}
      initialBilling={billing}
      userEmail={user.email}
      isAdmin={user.role === "admin"}
      showExports={showExports}
    />
  );
}
