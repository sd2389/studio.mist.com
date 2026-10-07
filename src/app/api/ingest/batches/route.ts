import { relayIngest } from "@/lib/api/ingest-relay";

/** The signed-in user's batches, newest first, with their counts per status. */
export async function GET(request: Request) {
  return relayIngest(request, "/ingest/batches", { query: ["page", "limit"], fallback: "Failed to list batches" });
}

/**
 * A draft batch, every design awaiting its upload: 201, or 200 with the batch an earlier request
 * with the same Idempotency-Key made. 422 lists a problem per design and CSV row.
 */
export async function POST(request: Request) {
  return relayIngest(request, "/ingest/batches", { addsWork: true, body: true, fallback: "Failed to start the batch" });
}
