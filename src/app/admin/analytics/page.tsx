import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAnalyticsDashboard } from "@/features/admin/ui/AdminAnalyticsDashboard";
import {
  fetchAdminTopUsersServer,
  requireAdminAnalyticsServer,
} from "@/lib/admin/server-fetch";
import { fetchCurrentUser } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  title: "Analytics · Admin",
};

export default async function AdminAnalyticsPage() {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login?next=/admin/analytics");
  if (user.role !== "admin") redirect("/dashboard");

  const [analytics, topUsers] = await Promise.all([
    requireAdminAnalyticsServer(),
    fetchAdminTopUsersServer(),
  ]);

  return (
    <AdminAnalyticsDashboard
      userEmail={user.email}
      analytics={analytics}
      topUsers={topUsers ?? []}
    />
  );
}
