import { NextResponse } from "next/server";
import { parseRouteId } from "@/lib/api/route-ids";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

type Ctx = { params: Promise<{ id: string }> };

/** One job, for polling. */
export async function GET(_request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const upstream = await upstreamFetch(`/render-jobs/${id}`);
  return relayUpstreamJson(upstream, "Failed to load the export");
}
