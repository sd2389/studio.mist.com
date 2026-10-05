"use client";

import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { cn } from "@/lib/utils";
import { creditsLabel } from "../lib/render-job-labels";
import type { useRenderJobQuote } from "./useRenderJobQuote";

type RenderJobCostProps = ReturnType<typeof useRenderJobQuote> & { className?: string };

/**
 * The quoted price next to a Render button: "Costs 2 credits", with the API's warnings (too
 * few credits left, a transparent JPEG); an upgrade prompt when the plan can't render it (402).
 */
export function RenderJobCost({ quote, error, pending, className }: RenderJobCostProps) {
  if (error instanceof AuthRequestError && error.status === 402) {
    return <UpgradePrompt className={cn("text-destructive", className)}>{error.message}</UpgradePrompt>;
  }
  if (error) {
    return (
      <p className={cn("text-xs text-destructive", className)} role="alert">
        {error.message}
      </p>
    );
  }
  if (!quote) {
    return pending ? <p className={cn("text-xs text-muted-foreground", className)}>Pricing…</p> : null;
  }
  return (
    <div className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      <p>
        Costs <span className="font-medium text-foreground">{creditsLabel(quote.credits)}</span>
        {quote.watermark ? " · watermarked" : null}
      </p>
      {quote.warnings.map((warning) => (
        <p key={warning} className="text-amber-700 dark:text-amber-400">
          {warning}
        </p>
      ))}
    </div>
  );
}
