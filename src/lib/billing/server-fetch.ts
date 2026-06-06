import "server-only";

import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import type { PricingCatalog, UserBillingSnapshot } from "@/lib/billing/types";

export async function fetchBillingAccountServer(): Promise<UserBillingSnapshot | null> {
  const upstream = await upstreamFetch("/billing/account");
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) return null;
  return json as UserBillingSnapshot;
}

export async function fetchPricingCatalogServer(): Promise<PricingCatalog | null> {
  const upstream = await upstreamFetch("/billing/pricing");
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) return null;
  return json as PricingCatalog;
}

export async function requireBillingAccountServer(): Promise<UserBillingSnapshot> {
  const upstream = await upstreamFetch("/billing/account");
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    throw new Error(upstreamError(json, "Failed to load billing account"));
  }
  return json as UserBillingSnapshot;
}
