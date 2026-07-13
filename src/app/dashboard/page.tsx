import type { Metadata } from "next";
import { DashboardShell, loadDashboardData } from "@/components/dashboard/DashboardShell";
import { parseDashboardSearchParams } from "@/lib/dashboard/filters";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { fetchBillingAccountServer } from "@/lib/billing/server-fetch";

export const metadata: Metadata = {
  title: "Workshop · DevJewels Studio",
  description: "Your jewelry scenes, credits, and uploads — synced from the API.",
};

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requirePageUser("/dashboard");
  const params = await searchParams;
  const filters = parseDashboardSearchParams(params);
  const [{ initialScenes, initialError, filterResult, allSceneCount }, billing] =
    await Promise.all([loadDashboardData(filters), fetchBillingAccountServer()]);

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
    />
  );
}
