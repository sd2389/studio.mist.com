import { NextResponse } from "next/server";
import { relayFileDownload } from "@/lib/api/download-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string; renderId: string }> };

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
  return relayFileDownload(request, `/render-jobs/${jobId}/outputs/${renderId}/download`, "Download failed");
}
