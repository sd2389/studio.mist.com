import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

type Ctx = { params: Promise<{ id: string }> };

async function resolveId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_request: Request, ctx: Ctx) {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const upstream = await upstreamFetch(`/scenes/${id}`);
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to load scene") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch(`/scenes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to update scene") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const upstream = await upstreamFetch(`/scenes/${id}`, { method: "DELETE" });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to delete scene") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
