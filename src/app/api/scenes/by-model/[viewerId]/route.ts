import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";

type Ctx = { params: Promise<{ viewerId: string }> };

async function resolveViewerId(ctx: Ctx): Promise<string | null> {
  const { viewerId } = await ctx.params;
  const trimmed = viewerId.trim();
  return trimmed ? trimmed : null;
}

export async function GET(_request: Request, ctx: Ctx) {
  const viewerId = await resolveViewerId(ctx);
  if (!viewerId) return NextResponse.json({ error: "Invalid viewerId" }, { status: 400 });

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  const upstream = await fetch(`${api}/scenes/by-model/${encodeURIComponent(viewerId)}`, {
    cache: "no-store",
  });
  const json = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const detail = (json as { detail?: string })?.detail ?? "Failed to load scene";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }
  return NextResponse.json(json);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const viewerId = await resolveViewerId(ctx);
  if (!viewerId) return NextResponse.json({ error: "Invalid viewerId" }, { status: 400 });

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

  const upstream = await fetch(`${api}/scenes/by-model/${encodeURIComponent(viewerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const detail = (json as { detail?: string })?.detail ?? "Failed to update scene";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }
  return NextResponse.json(json);
}
