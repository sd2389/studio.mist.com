import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string }> };

/** `{ item_ids }` (at most 100): the API checks each design's files are stored at their declared sizes. */
export async function POST(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/batches/${id}/uploaded`, {
    addsWork: true,
    body: true,
    fallback: "Failed to confirm the uploads",
  });
}
