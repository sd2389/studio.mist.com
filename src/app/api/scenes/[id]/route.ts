import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";

type Ctx = { params: Promise<{ id: string }> };

async function resolveId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(_request: Request, ctx: Ctx) {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  const upstream = await fetch(`${api}/scenes/${id}`, { cache: "no-store" });
  const json = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const detail =
      (json as { detail?: string })?.detail ?? "Failed to load scene";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }
  return NextResponse.json(json);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await fetch(`${api}/scenes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const detail =
      (json as { detail?: string })?.detail ?? "Failed to update scene";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }
  return NextResponse.json(json);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const id = await resolveId(ctx);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  const upstream = await fetch(`${api}/scenes/${id}`, { method: "DELETE" });
  const json = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const detail =
      (json as { detail?: string })?.detail ?? "Failed to delete scene";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }
  return NextResponse.json(json);
}
