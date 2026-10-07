"use client";

import { useEffect, useState } from "react";
import { quoteRenderPlan, type RenderPlan, type RenderPlanQuote } from "@/lib/api/ingest";

/** Picks change in bursts; the API is asked once they settle, as `useRenderJobQuote` asks. */
const QUOTE_DELAY_MS = 300;

type QuoteRead = { key: string; quote: RenderPlanQuote | null; error: Error | null };

/**
 * What a render plan costs each design, asked of the API (which prices it as the batch will be
 * held and charged) and asked again whenever the plan changes. A plan that renders nothing, null,
 * costs nothing and isn't asked about.
 */
export function useRenderPlanQuote(plan: RenderPlan | null) {
  const key = plan === null ? null : JSON.stringify(plan);
  const [read, setRead] = useState<QuoteRead | null>(null);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      quoteRenderPlan(JSON.parse(key) as RenderPlan, { signal: controller.signal })
        .then((quote) => setRead({ key, quote, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setRead({ key, quote: null, error: error instanceof Error ? error : new Error("The render plan couldn't be priced") });
        });
    }, QUOTE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  const current = read?.key === key ? read : null;
  return { quote: current?.quote ?? null, error: current?.error ?? null, pending: key !== null && current === null };
}

export type RenderPlanQuoteState = ReturnType<typeof useRenderPlanQuote>;
