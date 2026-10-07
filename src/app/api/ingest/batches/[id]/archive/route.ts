import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string }> };

/** Starts building the finished batch's ZIP archive, or answers the one building already (409 while it processes). */
export async function POST(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/batches/${id}/archive`, { addsWork: true, fallback: "Failed to start the archive" });
}
