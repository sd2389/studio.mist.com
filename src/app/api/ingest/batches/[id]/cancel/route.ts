import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Cancels what hasn't finished and gives its credits back. Open with the `bulk_pipeline` flag off
 * too, as in the API, so a batch in flight can always be refunded.
 */
export async function POST(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/batches/${id}/cancel`, { fallback: "Failed to cancel the batch" });
}
