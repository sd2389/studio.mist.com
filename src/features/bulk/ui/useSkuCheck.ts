"use client";

import { useEffect, useState } from "react";
import { checkSkus, MAX_REQUEST_DESIGNS, type IngestSkuCheck } from "@/lib/api/ingest";

/** Waits this long after the SKUs last changed before asking, so a drop in parts asks once. */
const SKU_CHECK_DELAY_MS = 400;

/** Asks `sku-check` about every SKU, a thousand a call, and joins the answers. */
export async function checkAllSkus(skus: string[], signal: AbortSignal): Promise<IngestSkuCheck> {
  const held: IngestSkuCheck = { taken: [], reserved: [] };
  for (let start = 0; start < skus.length; start += MAX_REQUEST_DESIGNS) {
    const answer = await checkSkus(skus.slice(start, start + MAX_REQUEST_DESIGNS), { signal });
    held.taken.push(...answer.taken);
    held.reserved.push(...answer.reserved);
  }
  return held;
}

type SkuCheckResult = { key: string; held: IngestSkuCheck | null; error: string | null };

/**
 * Which of these SKUs a scene holds or a design in progress reserves, asked of the API once
 * they settle. `checking` while the answer for these SKUs hasn't come yet.
 */
export function useSkuCheck(skus: string[]) {
  const key = skus.join("\n");
  const [result, setResult] = useState<SkuCheckResult | null>(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      checkAllSkus(key.split("\n"), controller.signal)
        .then((held) => setResult({ key, held, error: null }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : "The SKUs couldn't be checked";
          setResult({ key, held: null, error: message });
        });
    }, SKU_CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  const current = result?.key === key ? result : null;
  return { held: current?.held ?? null, error: current?.error ?? null, checking: key !== "" && current === null };
}
