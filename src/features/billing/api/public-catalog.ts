import "server-only";

import { getServerApiUrl } from "@/lib/api-url";
import type { PricingCatalog } from "@/lib/billing/types";

const CATALOG_REVALIDATE_SECONDS = 3600;

/**
 * The plan catalog for marketing pages. No session and an hourly cache, so pages that show
 * prices stay static; the backend stays the single source of truth for prices and quotas.
 */
export async function fetchPublicPricingCatalog(): Promise<PricingCatalog | null> {
  const api = getServerApiUrl();
  if (!api) return null;
  try {
    const res = await fetch(`${api}/billing/pricing`, { next: { revalidate: CATALOG_REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    return (await res.json()) as PricingCatalog;
  } catch {
    return null;
  }
}
