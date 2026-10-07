import { relayFileDownload } from "@/lib/api/download-relay";
import { invalidIdAnswer } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string; part: string }> };

/** One part of the batch's archive: a redirect to a signed link that lives 300 s, or the file itself on local storage. */
export async function GET(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const id = parseRouteId(params.id);
  const part = parseRouteId(params.part);
  if (id === null || part === null) return invalidIdAnswer();
  return relayFileDownload(request, `/ingest/batches/${id}/archive/${part}`, "The archive part couldn't be downloaded");
}
