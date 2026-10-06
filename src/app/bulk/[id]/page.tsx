import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BatchShell } from "@/features/bulk";
import { fetchBatchViewServer } from "@/lib/api/ingest-server";
import { parseRouteId } from "@/lib/api/route-ids";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { fetchFeatureFlagsServer, isFeatureEnabled } from "@/lib/feature-flags/server-fetch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bulk upload batch · MIST Studio",
  description: "A bulk upload's designs: their progress, failures, retries and cancel.",
};

type BatchPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * One batch of the signed-in user's. With the `bulk_pipeline` flag off nothing links here. With it
 * or the `upload` switch off, a batch can only be followed and canceled, as the API allows (its
 * `_adds_work` takes both), so one in flight can be refunded.
 */
export default async function BatchPage({ params }: BatchPageProps) {
  const batchId = parseRouteId((await params).id);
  if (batchId === null) notFound();
  const user = await requirePageUser(`/bulk/${batchId}`);
  const [view, flags] = await Promise.all([fetchBatchViewServer(batchId), fetchFeatureFlagsServer().catch(() => null)]);
  if (!view) notFound();
  const bulkEnabled = isFeatureEnabled(flags, "bulk_pipeline") && isFeatureEnabled(flags, "upload");
  return <BatchShell initial={view} bulkEnabled={bulkEnabled} userEmail={user.email} isAdmin={user.role === "admin"} />;
}
