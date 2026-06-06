"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminShell } from "@/features/admin/ui/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCredits, formatStorageGb } from "@/lib/billing/format";
import type { AdminUserDetail, CreditKind } from "@/lib/admin/types";

type AdminUserDetailShellProps = {
  userEmail: string;
  initial: AdminUserDetail;
};

const CREDIT_KINDS: { value: CreditKind; label: string }[] = [
  { value: "model", label: "Model credits" },
  { value: "ai", label: "AI image credits" },
  { value: "custom_material", label: "Custom material credits" },
  { value: "custom_asset", label: "Custom asset credits" },
  { value: "storage", label: "Storage (bytes delta)" },
];

export function AdminUserDetailShell({ userEmail, initial }: AdminUserDetailShellProps) {
  const [detail, setDetail] = useState(initial);
  const [kind, setKind] = useState<CreditKind>("model");
  const [delta, setDelta] = useState("5");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { billing, usage } = detail;
  const { balances, allotments } = billing;

  async function toggleActive() {
    setBusy("active");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${detail.id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !detail.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setDetail(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function adjustCredits() {
    setBusy("credits");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${detail.id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          delta: Number(delta),
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Adjustment failed");
      setDetail(json);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adjustment failed");
    } finally {
      setBusy(null);
    }
  }

  async function resetAllotments() {
    setBusy("reset");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${detail.id}/reset-allotments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: billing.plan_tier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reset failed");
      setDetail(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  async function impersonate() {
    if (!confirm(`Sign in as ${detail.email}? Your admin session will be replaced.`)) return;
    setBusy("impersonate");
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${detail.id}/impersonate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Impersonation failed");
      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impersonation failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell userEmail={userEmail} title={detail.email} backHref="/admin/users">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-base">Account</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant={detail.is_active ? "default" : "destructive"}>
                  {detail.is_active ? "Active" : "Disabled"}
                </Badge>
                <Badge variant="outline">{detail.role}</Badge>
                <Badge variant="secondary">{billing.plan_label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground">{detail.name ?? "—"}</span>
                {detail.phone ? ` · ${detail.phone}` : ""}
              </p>
              <p>{detail.scene_count} models · joined {new Date(detail.created_at).toLocaleDateString()}</p>
              {billing.stripe_customer_id ? (
                <p className="font-mono text-xs">Stripe: {billing.stripe_customer_id}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <QuotaLine label="CAD models" value={String(usage.scene_count)} />
              <QuotaLine label="Embedded (SKU)" value={String(usage.embedded_count)} />
              <QuotaLine label="Renders" value={String(usage.render_count)} />
              <QuotaLine label="Storage" value={formatStorageGb(usage.storage_bytes_used)} />
              <QuotaLine
                label="Model credits left"
                value={`${usage.model_credits_remaining} / ${usage.model_credits_allotment}`}
              />
              <QuotaLine
                label="AI credits left"
                value={`${usage.ai_credits_remaining} / ${usage.ai_credits_allotment}`}
              />
              {usage.last_scene_at ? (
                <QuotaLine
                  label="Last model activity"
                  value={new Date(usage.last_scene_at).toLocaleString()}
                />
              ) : null}
              {usage.last_render_at ? (
                <QuotaLine
                  label="Last render"
                  value={new Date(usage.last_render_at).toLocaleString()}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Credits & storage</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <QuotaLine
                label="Model"
                value={formatCredits(balances.model_credits, allotments.model_credits)}
              />
              <QuotaLine
                label="AI image"
                value={formatCredits(balances.ai_image_credits, allotments.ai_image_credits)}
              />
              <QuotaLine
                label="Custom material"
                value={formatCredits(
                  balances.custom_material_credits,
                  allotments.custom_material_credits,
                )}
              />
              <QuotaLine
                label="Custom asset"
                value={formatCredits(balances.custom_asset_credits, allotments.custom_asset_credits)}
              />
              <QuotaLine
                label="Storage"
                value={`${formatStorageGb(balances.storage_bytes_used)} / ${formatStorageGb(balances.storage_bytes_limit)}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.recent_adjustments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No manual adjustments yet.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.recent_adjustments.map((row) => (
                    <li key={row.id} className="rounded-md border border-border/60 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {row.kind} {row.delta >= 0 ? "+" : ""}
                          {row.delta}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{row.reason}</p>
                      <p className="text-xs text-muted-foreground">by {row.admin_email}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Adjust credits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Kind</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as CreditKind)}
                >
                  {CREDIT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Delta (+ grant / − deduct)</Label>
                <Input value={delta} onChange={(e) => setDelta(e.target.value)} type="number" />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Refund for failed upload"
                />
              </div>
              <Button className="w-full" disabled={!!busy} onClick={adjustCredits}>
                Apply adjustment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ops actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" disabled={!!busy} onClick={resetAllotments}>
                Reset allotments to plan
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={toggleActive}>
                {detail.is_active ? "Disable account" : "Enable account"}
              </Button>
              <Button variant="secondary" disabled={!!busy} onClick={impersonate}>
                Impersonate user
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/dashboard">Back to workshop</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function QuotaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
