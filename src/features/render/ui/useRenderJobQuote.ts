"use client";

import { useEffect, useState } from "react";
import { quoteRenderJob, type RenderJobQuote, type RenderJobRequest } from "../lib/render-jobs-api";

/** Settings change in bursts (a slider, a typed size); the API is asked once they settle. */
const QUOTE_DELAY_MS = 300;

type QuoteRead = { key: string; quote: RenderJobQuote | null; error: Error | null };

/**
 * What `request` would cost, asked of the API before any job is created, and asked again
 * when the request changes. A null request (nothing to render yet) is not priced.
 */
export function useRenderJobQuote(request: RenderJobRequest | null) {
  const key = request ? JSON.stringify(request) : null;
  const [read, setRead] = useState<QuoteRead | null>(null);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      quoteRenderJob(JSON.parse(key) as RenderJobRequest, { signal: controller.signal })
        .then((quote) => setRead({ key, quote, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setRead({ key, quote: null, error: error instanceof Error ? error : new Error("The export couldn't be priced") });
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
