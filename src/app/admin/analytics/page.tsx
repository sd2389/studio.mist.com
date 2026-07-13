import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAnalyticsDashboard } from "@/features/admin/ui/AdminAnalyticsDashboard";
import {
  fetchAdminTopUsersServer,
  requireAdminAnalyticsServer,
} from "@/lib/admin/server-fetch";
import { requirePageUser } from "@/lib/auth/require-page-user";

export const metadata: Metadata = {
  title: "Analytics · Admin",
};

export default async function AdminAnalyticsPage() {
  const user = await requirePageUser("/admin/analytics");
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
