import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { loadDashboardData } from "@/components/dashboard/load-dashboard-data";
import { parseDashboardSearchParams } from "@/lib/dashboard/filters";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { fetchBillingAccountServer } from "@/lib/billing/server-fetch";
import { fetchFeatureFlagsServer, isFeatureEnabled } from "@/lib/feature-flags/server-fetch";

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
  const [{ initialScenes, initialError, filterResult, allSceneCount }, billing, flags] = await Promise.all([
    loadDashboardData(filters),
    fetchBillingAccountServer(),
    // Unreadable flags take their defaults: both of these are off then.
    fetchFeatureFlagsServer().catch(() => null),
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
      showExports={isFeatureEnabled(flags, "server_exports")}
      showBulkUpload={isFeatureEnabled(flags, "bulk_pipeline")}
    />
  );
}
