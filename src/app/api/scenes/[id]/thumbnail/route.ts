import { NextResponse } from "next/server";
import { parseRouteId } from "@/lib/api/route-ids";
import { MAX_THUMBNAIL_BYTES } from "@/lib/api/scenes";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

type Ctx = { params: Promise<{ id: string }> };

/** The body's bytes, or null as soon as they pass `limit`, so a large upload is never held here. */
async function readAtMost(request: Request, limit: number): Promise<Blob | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return new Blob([]);
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(read.value);
  }
  return new Blob(chunks);
}

/**
 * Sets the scene's thumbnail from a capture of the studio's view (ADR 0005), passed on as it
 * came: the API judges the image by its bytes and answers the scene.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const id = parseRouteId((await ctx.params).id);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const image = await readAtMost(request, MAX_THUMBNAIL_BYTES);
  if (image === null) return NextResponse.json({ error: "A thumbnail is at most 2 MB" }, { status: 413 });

  const upstream = await upstreamFetch(`/scenes/${id}/thumbnail`, {
    method: "PUT",
    body: image,
    headers: { "Content-Type": request.headers.get("content-type") ?? "application/octet-stream" },
  });
  return relayUpstreamJson(upstream, "Failed to set the thumbnail");
}
