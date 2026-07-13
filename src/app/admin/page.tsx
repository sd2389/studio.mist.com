import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin/ui/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount, formatMoneyFromCents } from "@/lib/admin/format";
import {
  fetchAdminTopUsersServer,
  requireAdminAnalyticsServer,
} from "@/lib/admin/server-fetch";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { formatStorageGb } from "@/lib/billing/format";

export const metadata: Metadata = {
  title: "Admin · DevJewels Studio",
  description: "Internal ops console.",
};

export default async function AdminOverviewPage() {
  const user = await requirePageUser("/admin");
  if (user.role !== "admin") redirect("/dashboard");

  const [analytics, topUsers] = await Promise.all([
    requireAdminAnalyticsServer(),
    fetchAdminTopUsersServer(),
  ]);
  const { usage, revenue } = analytics;

  const stats = [
    { label: "Total users", value: formatCount(usage.total_users), href: "/admin/users" },
    { label: "CAD models", value: formatCount(usage.total_cad_models), href: "/admin/analytics" },
    { label: "Embedded", value: formatCount(usage.total_embedded), href: "/admin/analytics" },
    { label: "MRR", value: formatMoneyFromCents(revenue.estimated_mrr_cents), href: "/admin/analytics" },
    { label: "Active subs", value: formatCount(revenue.active_subscriptions), href: "/admin/users" },
    { label: "Renders", value: formatCount(usage.total_renders), href: "/admin/analytics" },
    { label: "Storage", value: formatStorageGb(usage.total_storage_bytes), href: "/admin/analytics" },
    { label: "Features", value: "Manage", href: "/admin/features" },
  ] as const;

  return (
    <AdminShell userEmail={user.email} title="Ops overview">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Platform health at a glance. Open Analytics for usage, revenue, and top users.
        </p>
        <Link href="/admin/analytics" className="text-sm font-medium text-primary hover:underline">
          Full analytics →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">{stat.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {topUsers && topUsers.length > 0 ? (
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Most active users</h2>
            <Link href="/admin/users" className="text-sm text-primary hover:underline">
              All users
            </Link>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">CAD</th>
                  <th className="px-4 py-3 font-medium">Renders</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.slice(0, 5).map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.id}`} className="hover:underline">
                        {row.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.scene_count}</td>
                    <td className="px-4 py-3">{row.render_count}</td>
                    <td className="px-4 py-3">{row.plan_tier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="mt-8 text-sm text-muted-foreground">
        User details, credit adjustments, feature toggles, and Stripe webhooks live in the
        sidebar. Set <code className="rounded bg-muted px-1">ADMIN_EMAILS</code> in backend env
        to bootstrap admin access.
      </p>
    </AdminShell>
  );
}
