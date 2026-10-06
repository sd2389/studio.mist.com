import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BulkUploadShell } from "@/features/bulk";
import { FeatureDisabledPage } from "@/features/feature-flags";
import { fetchRecentBatchesServer } from "@/lib/api/ingest-server";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { fetchBillingAccountServer } from "@/lib/billing/server-fetch";
import { fetchFeatureFlagsServer, isFeatureEnabled } from "@/lib/feature-flags/server-fetch";

// The flag is read for every request: a build that can't reach the API would prerender a 404.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bulk upload · MIST Studio",
  description: "Upload many CAD files at once, with a CSV of SKUs, names and categories.",
};

export default async function BulkUploadPage() {
  const flags = await fetchFeatureFlagsServer().catch(() => null);
  // There is no bulk upload page until the bulk pipeline is switched on.
  if (!isFeatureEnabled(flags, "bulk_pipeline")) notFound();
  const user = await requirePageUser("/bulk/new");
  if (!isFeatureEnabled(flags, "upload")) {
    return (
      <FeatureDisabledPage
        title="Uploads paused"
        message="New model uploads are turned off. Your existing scenes and batches are still available."
      />
    );
  }
  const [billing, recentBatches] = await Promise.all([fetchBillingAccountServer(), fetchRecentBatchesServer()]);
  return (
    <BulkUploadShell
      billing={billing}
      recentBatches={recentBatches}
      userEmail={user.email}
      isAdmin={user.role === "admin"}
    />
  );
}
