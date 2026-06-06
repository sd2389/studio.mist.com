"use client";

import { useMemo, useState } from "react";
import { AdminShell } from "@/features/admin/ui/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { FeatureFlagRow, FeatureFlagsAdminResponse } from "@/lib/feature-flags/types";

type AdminFeaturesShellProps = {
  userEmail: string;
  initial: FeatureFlagsAdminResponse;
};

export function AdminFeaturesShell({ userEmail, initial }: AdminFeaturesShellProps) {
  const [features, setFeatures] = useState(initial.features);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, FeatureFlagRow[]>();
    for (const row of features) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [features]);

  async function toggleFeature(row: FeatureFlagRow, enabled: boolean) {
    setBusyKey(row.key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/features/${row.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setFeatures((prev) => prev.map((f) => (f.key === row.key ? (json as FeatureFlagRow) : f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyKey(null);
    }
  }

  const enabledCount = features.filter((f) => f.enabled).length;

  return (
    <AdminShell userEmail={userEmail} title="Features">
      <p className="mb-6 text-sm text-muted-foreground">
        Turn product areas on or off without redeploying. Disabled features return a maintenance
        message in the app and block related API routes.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge variant="outline">
          {enabledCount} of {features.length} enabled
        </Badge>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <div className="space-y-8">
        {grouped.map(([category, rows]) => (
          <section key={category}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </h2>
            <div className="grid gap-3">
              {rows.map((row) => (
                <Card key={row.key}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{row.label}</CardTitle>
                      <CardDescription className="mt-1">{row.description}</CardDescription>
                      <p className="mt-2 font-mono text-xs text-muted-foreground">{row.key}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant={row.enabled ? "default" : "secondary"}>
                        {row.enabled ? "On" : "Off"}
                      </Badge>
                      <Switch
                        checked={row.enabled}
                        disabled={busyKey === row.key}
                        onCheckedChange={(checked) => toggleFeature(row, checked)}
                        aria-label={`Toggle ${row.label}`}
                      />
                    </div>
                  </CardHeader>
                  {row.updated_at ? (
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground">
                        Last changed {new Date(row.updated_at).toLocaleString()}
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
