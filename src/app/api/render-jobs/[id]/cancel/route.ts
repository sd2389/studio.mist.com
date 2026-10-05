import { NextResponse } from "next/server";
import { parseRouteId } from "@/lib/api/route-ids";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

type Ctx = { params: Promise<{ id: string }> };

/** A queued job is canceled and refunded at once, a running one when its worker stops; a finished one is 409. */
export async function POST(_request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const upstream = await upstreamFetch(`/render-jobs/${id}/cancel`, { method: "POST" });
  return relayUpstreamJson(upstream, "Failed to cancel the export");
}
