import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** Converts one failed design again; 409 with the reason when it can't. */
export async function POST(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const id = parseRouteId(params.id);
  const itemId = parseRouteId(params.itemId);
  if (id === null || itemId === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/batches/${id}/items/${itemId}/retry`, {
    addsWork: true,
    fallback: "Failed to retry the design",
  });
}
