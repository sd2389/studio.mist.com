import type { Metadata } from "next";
import { ProfileShell } from "@/features/billing/ui/ProfileShell";
import { fetchApiKeysServer } from "@/lib/api/api-keys-server";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { requireBillingAccountServer } from "@/lib/billing/server-fetch";
import { isFeatureEnabledServer } from "@/lib/feature-flags/server-fetch";

export const metadata: Metadata = {
  title: "Profile · MIST Studio",
  description: "Plan details, credits, and account settings.",
};

export default async function ProfilePage() {
  const user = await requirePageUser("/profile");
  const [billing, apiEnabled] = await Promise.all([
    requireBillingAccountServer(),
    // The customer API is part of the bulk pipeline (ADR 0006): its keys show while it is on.
    isFeatureEnabledServer("bulk_pipeline"),
  ]);
  const apiKeys = apiEnabled ? await fetchApiKeysServer() : null;

  return <ProfileShell initialUser={user} initialBilling={billing} initialApiKeys={apiKeys} />;
}
