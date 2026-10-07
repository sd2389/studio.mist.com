import "server-only";

import { readUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";
import {
  batchItemsSearch,
  type BatchView,
  type IngestBatch,
  type IngestItem,
  type IngestPage,
  type LookTemplate,
} from "@/lib/api/ingest";

/** The signed-in user's newest batches; none when they can't be read. */
export async function fetchRecentBatchesServer(limit = 5): Promise<IngestBatch[]> {
  const upstream = await upstreamFetch(`/ingest/batches?limit=${limit}`);
  if (!upstream.ok) return [];
  return ((await readUpstreamJson(upstream)) as IngestPage<IngestBatch>).items ?? [];
}

/** The signed-in user's latest look templates; none when they can't be read. */
export async function fetchLookTemplatesServer(limit = 6): Promise<LookTemplate[]> {
  const upstream = await upstreamFetch(`/ingest/look-templates?limit=${limit}`);
  if (!upstream.ok) return [];
  return ((await readUpstreamJson(upstream)) as { items?: LookTemplate[] }).items ?? [];
}

/** A batch of the signed-in user's and its first page of designs; null when it isn't theirs or doesn't exist. */
export async function fetchBatchViewServer(batchId: number): Promise<BatchView | null> {
  const [batch, items] = await Promise.all([
    upstreamFetch(`/ingest/batches/${batchId}`),
    upstreamFetch(`/ingest/batches/${batchId}/items${batchItemsSearch({})}`),
  ]);
  if (batch.status === 404) return null;
  if (!batch.ok || !items.ok) throw new Error(`The batch couldn't be loaded (${batch.ok ? items.status : batch.status})`);
  return {
    batch: (await readUpstreamJson(batch)) as IngestBatch,
    items: (await readUpstreamJson(items)) as IngestPage<IngestItem>,
  };
}
