import type { Metadata } from "next";
import { PricingPageClient } from "@/features/billing/ui/PricingPage";
import { FeatureDisabledPage } from "@/features/feature-flags";
import { fetchCurrentUser } from "@/lib/auth/server-session";
import { fetchPricingCatalogServer } from "@/lib/billing/server-fetch";
import { fetchFeatureFlagsServer, isFeatureEnabled } from "@/lib/feature-flags/server-fetch";

export const metadata: Metadata = {
  title: "Pricing · DevJewels Studio",
  description: "Plans, credits, and top-ups for DevJewels Studio.",
};

const FALLBACK_CATALOG = {
  plans: [],
  top_ups: [],
};

export default async function PricingPage() {
  const [catalog, user, flags] = await Promise.all([
    fetchPricingCatalogServer(),
    fetchCurrentUser(),
    fetchFeatureFlagsServer(),
  ]);

  if (!isFeatureEnabled(flags, "pricing_page")) {
    return <FeatureDisabledPage title="Pricing unavailable" />;
  }

  return (
    <PricingPageClient
      catalog={catalog ?? FALLBACK_CATALOG}
      isAuthenticated={Boolean(user)}
    />
  );
}
