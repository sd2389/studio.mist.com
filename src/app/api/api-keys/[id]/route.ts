import { invalidIdAnswer } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

type Ctx = { params: Promise<{ id: string }> };

/** Revokes one of the signed-in user's keys: refused from the next request on. Another user's is 404. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();

  const upstream = await upstreamFetch(`/api-keys/${id}`, { method: "DELETE" });
  return relayUpstreamJson(upstream, "Failed to revoke the API key");
}
