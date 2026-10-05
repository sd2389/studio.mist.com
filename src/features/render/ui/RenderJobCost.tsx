"use client";

import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { cn } from "@/lib/utils";
import { creditsLabel } from "../lib/render-job-labels";
import type { RenderJobBulkQuote, RenderJobQuote } from "../lib/render-jobs-api";
import type { useRenderJobQuote } from "./useRenderJobQuote";

type RenderJobCostProps = ReturnType<typeof useRenderJobQuote> & { className?: string };

/** What one quote or a bulk quote comes to, as the cost line shows it. */
type CostLine = {
  credits: number;
  /** Images a bulk request makes; none for a single job. */
  images: number | null;
  watermark: boolean;
  warnings: string[];
  /** Why the plan refuses the request as a whole. */
  refusal: string | null;
};

function costLine(quote: RenderJobQuote | RenderJobBulkQuote): CostLine {
  if (!("items" in quote)) {
    return { credits: quote.credits, images: null, watermark: quote.watermark, warnings: quote.warnings, refusal: null };
  }
  const quoted = quote.items.flatMap((item) => (item.quote ? [item.quote] : []));
  const refused = quote.items.flatMap((item) => (item.refused ? [item.refused] : []));
  const itemWarnings = [...new Set(quoted.flatMap((item) => item.warnings))];
  return {
    credits: quote.credits,
    images: quoted.reduce((images, item) => images + item.frames, 0),
    watermark: quoted.some((item) => item.watermark),
    warnings: [
      ...quote.warnings,
      ...itemWarnings,
      ...(refused.length > 0 ? [`${refused.length} of ${quote.items.length} can't be rendered: ${refused[0]!.detail}`] : []),
    ],
    refusal: quote.refused?.detail ?? null,
  };
}

/**
 * Why an export can't be priced or started: an upgrade prompt when the plan or its credits
 * can't cover it (402), else the API's reason.
 */
export function RenderJobError({ error, className }: { error: Error | null; className?: string }) {
  if (!error) return null;
  if (error instanceof AuthRequestError && error.status === 402) {
    return <UpgradePrompt className={cn("text-destructive", className)}>{error.message}</UpgradePrompt>;
  }
  return (
    <p className={cn("text-xs text-destructive", className)} role="alert">
      {error.message}
    </p>
  );
}

/**
 * The quoted price next to a Render button: "Costs 2 credits", or for several jobs "Costs 6
 * credits for 6 images", with the API's warnings (too few credits left, a transparent JPEG,
 * jobs that can't be made); an upgrade prompt when the plan can't render it (402).
 */
export function RenderJobCost({ quote, error, pending, className }: RenderJobCostProps) {
  if (error) return <RenderJobError error={error} className={className} />;
  if (!quote) {
    return pending ? <p className={cn("text-xs text-muted-foreground", className)}>Pricing…</p> : null;
  }
  const line = costLine(quote);
  if (line.refusal) {
    return <UpgradePrompt className={cn("text-destructive", className)}>{line.refusal}</UpgradePrompt>;
  }
  return (
    <div className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      <p>
        Costs <span className="font-medium text-foreground">{creditsLabel(line.credits)}</span>
        {line.images !== null ? ` for ${line.images} ${line.images === 1 ? "image" : "images"}` : null}
        {line.watermark ? " · watermarked" : null}
      </p>
      {line.warnings.map((warning) => (
        <p key={warning} className="text-amber-700 dark:text-amber-400">
          {warning}
        </p>
      ))}
    </div>
  );
}
