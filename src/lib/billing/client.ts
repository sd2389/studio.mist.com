import type { PricingCatalog, UserBillingSnapshot } from "@/lib/billing/types";

async function billingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(json.detail ?? json.error ?? `Billing request failed (${res.status})`);
  }
  return json;
}

export async function fetchBillingAccount(): Promise<UserBillingSnapshot> {
  return billingFetch<UserBillingSnapshot>("/api/billing/account");
}

export async function fetchPricingCatalog(): Promise<PricingCatalog> {
  return billingFetch<PricingCatalog>("/api/billing/pricing");
}

export async function startSubscriptionCheckout(priceId: string): Promise<string> {
  const data = await billingFetch<{ url: string }>("/api/billing/checkout/subscription", {
    method: "POST",
    body: JSON.stringify({ price_id: priceId }),
  });
  return data.url;
}

export async function startTopUpCheckout(packId: string): Promise<string> {
  const data = await billingFetch<{ url: string }>("/api/billing/checkout/topup", {
    method: "POST",
    body: JSON.stringify({ pack_id: packId }),
  });
  return data.url;
}

export async function openBillingPortal(): Promise<string> {
  const data = await billingFetch<{ url: string }>("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.url;
}
