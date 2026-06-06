"use client";

import Link from "next/link";
import { AdminShell } from "@/features/admin/ui/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytesShort, formatCount, formatMoneyFromCents } from "@/lib/admin/format";
import type { AdminAnalytics, TopUserRow } from "@/lib/admin/types";
import { formatStorageGb } from "@/lib/billing/format";

type AdminAnalyticsDashboardProps = {
  userEmail: string;
  analytics: AdminAnalytics;
  topUsers: TopUserRow[];
};

type StatCard = {
  label: string;
  value: string;
  hint?: string;
  href?: string;
};

function StatGrid({ title, description, stats }: { title: string; description?: string; stats: StatCard[] }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const card = (
            <Card className={stat.href ? "transition-colors hover:border-primary/40" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tracking-tight">{stat.value}</p>
                {stat.hint ? <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p> : null}
              </CardContent>
            </Card>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href}>
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          );
        })}
      </div>
    </section>
  );
}

export function AdminAnalyticsDashboard({
  userEmail,
  analytics,
  topUsers,
}: AdminAnalyticsDashboardProps) {
  const { usage, revenue } = analytics;

  const userStats: StatCard[] = [
    { label: "Total users", value: formatCount(usage.total_users), href: "/admin/users" },
    { label: "Active users", value: formatCount(usage.active_users), href: "/admin/users" },
    { label: "New users (7d)", value: formatCount(usage.new_users_7d), hint: `${usage.new_users_30d} in 30d` },
    {
      label: "Paid plans",
      value: formatCount(
        usage.users_by_tier
          .filter((t) => t.tier !== "free")
          .reduce((sum, t) => sum + t.count, 0),
      ),
      hint: usage.users_by_tier.map((t) => `${t.label} ${t.count}`).join(" · "),
      href: "/admin/users",
    },
  ];

  const productStats: StatCard[] = [
    { label: "Total CAD models", value: formatCount(usage.total_cad_models), hint: `${usage.cad_models_7d} uploaded in 7d` },
    { label: "Embedded / published", value: formatCount(usage.total_embedded), hint: "Models with SKU" },
    { label: "Total renders", value: formatCount(usage.total_renders), hint: `${usage.renders_7d} in 7d` },
    { label: "Platform storage", value: formatStorageGb(usage.total_storage_bytes), hint: formatBytesShort(usage.total_storage_bytes) },
  ];

  const revenueStats: StatCard[] = [
    {
      label: "Recurring revenue (MRR)",
      value: formatMoneyFromCents(revenue.estimated_mrr_cents),
      hint: revenue.stripe_configured ? "Estimated from active subs" : "Stripe not configured",
    },
    {
      label: "Active subscriptions",
      value: formatCount(revenue.active_subscriptions),
      hint: `Grow ${revenue.grow_subscriptions} · Studio ${revenue.studio_subscriptions}`,
      href: "/admin/users",
    },
    {
      label: "Invoices paid (30d)",
      value: formatCount(revenue.invoice_paid_events_30d),
      href: "/admin/events",
    },
    {
      label: "Checkouts (30d)",
      value: formatCount(revenue.checkout_completed_30d),
      href: "/admin/events",
    },
  ];

  return (
    <AdminShell userEmail={userEmail} title="Analytics">
      <div className="space-y-10">
        <StatGrid title="Users" description="Accounts and signups across the platform." stats={userStats} />
        <StatGrid title="Usage" description="CAD uploads, embeds, renders, and storage." stats={productStats} />
        <StatGrid title="Revenue" description="Subscription MRR and recent billing activity." stats={revenueStats} />

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Top users by activity</h2>
              <p className="text-sm text-muted-foreground">Ranked by CAD model count, then renders.</p>
            </div>
            <Link href="/admin/users" className="text-sm text-primary hover:underline">
              View all users
            </Link>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">CAD models</th>
                  <th className="px-4 py-3 font-medium">Renders</th>
                  <th className="px-4 py-3 font-medium">Storage</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${row.id}`} className="font-medium hover:underline">
                        {row.email}
                      </Link>
                      {row.name ? <p className="text-xs text-muted-foreground">{row.name}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{row.plan_tier}</Badge>
                    </td>
                    <td className="px-4 py-3">{row.scene_count}</td>
                    <td className="px-4 py-3">{row.render_count}</td>
                    <td className="px-4 py-3">{formatStorageGb(row.storage_bytes_used)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={row.is_active ? "default" : "destructive"}>
                        {row.is_active ? "Active" : "Off"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>{analytics.contact_unread_hint} contact messages</span>
          <span>·</span>
          <span>{analytics.recent_webhook_count} webhooks in 7d</span>
        </div>
      </div>
    </AdminShell>
  );
}
