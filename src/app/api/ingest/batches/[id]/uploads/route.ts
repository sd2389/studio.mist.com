import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string }> };

/**
 * `{ item_ids }` (at most 100) → a signed PUT for each of their files, with the headers to send.
 * The files themselves go from the browser straight to storage, never through here.
 */
export async function POST(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/batches/${id}/uploads`, {
    addsWork: true,
    body: true,
    fallback: "Failed to sign the uploads",
  });
}
