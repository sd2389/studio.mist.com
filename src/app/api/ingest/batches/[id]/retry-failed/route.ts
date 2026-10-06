import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string }> };

/** Converts every failed design again, holding its credits again; answers which it couldn't and why. */
export async function POST(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/batches/${id}/retry-failed`, {
    addsWork: true,
    fallback: "Failed to retry the failed designs",
  });
}
