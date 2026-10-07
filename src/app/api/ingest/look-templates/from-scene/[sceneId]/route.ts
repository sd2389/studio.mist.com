import { invalidIdAnswer, relayIngest } from "@/lib/api/ingest-relay";
import { parseRouteId } from "@/lib/api/route-ids";

type Ctx = { params: Promise<{ sceneId: string }> };

/**
 * A look template of one of the user's scenes: 201 new, or 200 with that scene's template brought
 * up to date; 404 for a scene that isn't theirs, 400 when its look can't be a template.
 */
export async function POST(request: Request, ctx: Ctx) {
  const sceneId = parseRouteId((await ctx.params).sceneId);
  if (sceneId === null) return invalidIdAnswer();
  return relayIngest(request, `/ingest/look-templates/from-scene/${sceneId}`, {
    addsWork: true,
    fallback: "Failed to make the look template",
  });
}
