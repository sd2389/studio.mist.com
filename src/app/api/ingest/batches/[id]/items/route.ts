import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string }> };

/** A page of a batch's designs in the order they were dropped, of one status if asked. */
export async function GET(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/batches/${id}/items`, {
    query: ["status", "page", "limit"],
    fallback: "Failed to list the batch's designs",
  });
}
