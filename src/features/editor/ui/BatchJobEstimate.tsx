"use client";

import { UpgradePrompt } from "@/components/billing/UpgradePrompt";

/** "Estimated jobs: 6" for a batch export, with the upgrade prompt on plans without it. */
export function BatchJobEstimate({ count, enabled }: { count: number; enabled: boolean }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        Estimated jobs:{" "}
        <span className="font-medium text-foreground">{count}</span>
      </p>
      {!enabled ? (
        <UpgradePrompt className="text-destructive">Batch export requires a plan upgrade.</UpgradePrompt>
      ) : null}
    </div>
  );
}
