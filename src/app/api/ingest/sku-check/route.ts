import { relayIngest } from "@/lib/api/ingest-relay";

/** `{ skus }` (at most 1000) → the ones a scene holds (`taken`) or a design in progress reserves (`reserved`). */
export async function POST(request: Request) {
  return relayIngest(request, "/ingest/sku-check", { addsWork: true, body: true, fallback: "Failed to check the SKUs" });
}
