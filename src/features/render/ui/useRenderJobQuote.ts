"use client";

import { useEffect, useState } from "react";
import {
  quoteRenderJob,
  quoteRenderJobs,
  type RenderJobBulkQuote,
  type RenderJobQuote,
  type RenderJobRequest,
} from "../lib/render-jobs-api";

/** Settings change in bursts (a slider, a typed size); the API is asked once they settle. */
const QUOTE_DELAY_MS = 300;

type QuoteRead = { key: string; quote: RenderJobQuote | RenderJobBulkQuote | null; error: Error | null };

function quote(body: RenderJobRequest | RenderJobRequest[], signal: AbortSignal) {
  return Array.isArray(body) ? quoteRenderJobs(body, { signal }) : quoteRenderJob(body, { signal });
}

/**
 * What `request` would cost, asked of the API before any job is created, and asked again
 * when the request changes. Several requests are priced as one bulk request, job by job. A
 * null request, or none at all (nothing to render yet), is not priced.
 */
export function useRenderJobQuote(request: RenderJobRequest | RenderJobRequest[] | null) {
  const empty = request === null || (Array.isArray(request) && request.length === 0);
  const key = empty ? null : JSON.stringify(request);
  const [read, setRead] = useState<QuoteRead | null>(null);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      quote(JSON.parse(key) as RenderJobRequest | RenderJobRequest[], controller.signal)
        .then((answer) => setRead({ key, quote: answer, error: null }))
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
