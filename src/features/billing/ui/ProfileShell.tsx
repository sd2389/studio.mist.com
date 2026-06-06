"use client";

import { CreditCard, Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatCredits, formatStorageGb, storagePercent } from "@/lib/billing/format";
import { openBillingPortal, startSubscriptionCheckout } from "@/lib/billing/client";
import type { UserBillingSnapshot } from "@/lib/billing/types";
import { logOut } from "@/lib/auth/client";
import type { AuthUser } from "@/lib/auth/types";

type ProfileShellProps = {
  initialUser: AuthUser;
  initialBilling: UserBillingSnapshot;
};

export function ProfileShell({ initialUser, initialBilling }: ProfileShellProps) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [billing] = useState(initialBilling);
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState((user as AuthUser & { phone?: string | null }).phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { balances, allotments, features } = billing;
  const storagePct = storagePercent(balances.storage_bytes_used, balances.storage_bytes_limit);

  async function saveProfile() {
    setBusy("profile");
    setProfileMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setUser(json);
      setProfileMsg("Profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function changePassword() {
    setBusy("password");
    setPasswordMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Password change failed");
      setPasswordMsg(json.message ?? "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      await logOut();
      router.push("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Password change failed");
    } finally {
      setBusy(null);
    }
  }

  async function handlePortal() {
    setBusy("portal");
    setError(null);
    try {
      const url = await openBillingPortal();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing portal");
      setBusy(null);
    }
  }

  async function handleUpgrade() {
    setBusy("upgrade");
    setError(null);
    try {
      const res = await fetch("/api/billing/pricing");
      const catalog = await res.json();
      const grow = catalog.plans?.find((p: { tier: string }) => p.tier === "grow");
      if (!grow?.stripe_price_id) {
        throw new Error("Stripe is not configured for subscriptions yet.");
      }
      const url = await startSubscriptionCheckout(grow.stripe_price_id);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-app-canvas">
      <AppHeader userEmail={user.email} showAdminLink={user.role === "admin"} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <header className="mb-10 space-y-2">
          <h1 className="font-display text-4xl font-normal italic tracking-tight text-foreground">
            Profile
          </h1>
          <p className="text-muted-foreground">Plan, credits, and account settings.</p>
        </header>

        {error ? (
          <p className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Plan details</CardTitle>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {billing.plan_label}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {billing.period_start && billing.period_end ? (
                <p className="text-sm text-muted-foreground">
                  Billing period: {new Date(billing.period_start).toLocaleDateString()} –{" "}
                  {new Date(billing.period_end).toLocaleDateString()}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Free tier — upgrade for 8K exports and more credits.</p>
              )}
              <div className="flex flex-wrap gap-3">
                {billing.plan_tier === "free" ? (
                  <Button onClick={handleUpgrade} disabled={busy === "upgrade"}>
                    {busy === "upgrade" ? <Loader2 className="size-4 animate-spin" /> : null}
                    Upgrade to Grow
                  </Button>
                ) : null}
                {billing.has_active_subscription ? (
                  <Button variant="outline" onClick={handlePortal} disabled={busy === "portal"}>
                    <CreditCard className="size-4" />
                    Manage billing
                  </Button>
                ) : null}
                <Button variant="outline" asChild>
                  <Link href="/pricing">View all plans</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Available credits</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  label: "Model credits",
                  remaining: balances.model_credits,
                  total: allotments.model_credits,
                },
                {
                  label: "AI image credits",
                  remaining: balances.ai_image_credits,
                  total: allotments.ai_image_credits,
                },
                {
                  label: "Custom materials",
                  remaining: balances.custom_material_credits,
                  total: allotments.custom_material_credits,
                },
                {
                  label: "Custom assets",
                  remaining: balances.custom_asset_credits,
                  total: allotments.custom_asset_credits,
                },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatCredits(item.remaining, item.total)}
                  </p>
                  <Progress
                    value={Math.min(
                      100,
                      Math.round(
                        ((item.total - item.remaining) / Math.max(item.total, 1)) * 100,
                      ),
                    )}
                  />
                </div>
              ))}
              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm font-medium text-foreground">Storage</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatStorageGb(balances.storage_bytes_used)} /{" "}
                  {formatStorageGb(balances.storage_bytes_limit)}
                </p>
                <Progress value={storagePct} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plan features</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <li>Max variants per model: {features.max_variants_per_model}</li>
                <li>Max image resolution: {features.max_image_resolution}px</li>
                <li>Watermark exports: {features.watermark_exports ? "Yes" : "No"}</li>
                <li>Batch export: {features.batch_export_enabled ? "Yes" : "Upgrade required"}</li>
                <li>8K video: {features.video_8k_enabled ? "Yes" : "Upgrade required"}</li>
                <li>3D embed: {features.embed_enabled ? "Yes" : "No"}</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Update information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-phone">Phone</Label>
                <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button onClick={saveProfile} disabled={busy === "profile"}>
                {busy === "profile" ? <Loader2 className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
              {profileMsg ? <p className="text-sm text-muted-foreground">{profileMsg}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Change password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={changePassword} disabled={busy === "password"}>
                {busy === "password" ? <Loader2 className="size-4 animate-spin" /> : null}
                Update password
              </Button>
              {passwordMsg ? <p className="text-sm text-muted-foreground">{passwordMsg}</p> : null}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={async () => {
                await logOut();
                router.push("/login");
              }}
            >
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
