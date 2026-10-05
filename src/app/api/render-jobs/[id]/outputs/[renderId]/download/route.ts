import { NextResponse } from "next/server";
import { parseRouteId } from "@/lib/api/route-ids";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

type Ctx = { params: Promise<{ id: string; renderId: string }> };

/** What the browser needs from the API's answer to save the file. */
const FILE_HEADERS = ["content-type", "content-length", "content-disposition"] as const;

/**
 * One output of the caller's job: a redirect to a signed link that lives 300 s, or the file
 * itself on local storage. The session never leaves the server.
 */
export async function GET(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const jobId = parseRouteId(params.id);
  const renderId = parseRouteId(params.renderId);
  if (jobId === null || renderId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const upstream = await upstreamFetch(`/render-jobs/${jobId}/outputs/${renderId}/download`, {
    redirect: "manual",
    signal: request.signal,
  });
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const location = upstream.headers.get("location");
  if (location && upstream.status >= 300 && upstream.status < 400) {
    headers.set("Location", location);
    return new Response(null, { status: upstream.status, headers });
  }
  if (!upstream.ok) return relayUpstreamJson(upstream, "Download failed");

  for (const name of FILE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
