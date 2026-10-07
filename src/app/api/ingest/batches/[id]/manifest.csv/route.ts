import { relayFileDownload } from "@/lib/api/download-relay";
import { invalidIdAnswer } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The batch's manifest as it is now: a CSV row per design with its links, saved under the
 * batch's name. Open with the `bulk_pipeline` flag off too, as reading a batch is.
 */
export async function GET(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return invalidIdAnswer();
  return relayFileDownload(request, `/ingest/batches/${id}/manifest.csv`, "The manifest couldn't be read");
}
