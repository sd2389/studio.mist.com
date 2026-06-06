import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

type SaveBody = {
  modelId?: string;
  material?: string;
  lighting?: string;
  image?: string;
  scene_id?: number;
  kind?: string;
  width?: number;
  height?: number;
};

export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.image?.startsWith("data:image/")) {
    return NextResponse.json({ ok: false, error: "Expected data URL image" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/renders", {
    method: "POST",
    body: JSON.stringify({
      image: body.image,
      model_id: body.modelId ?? null,
      scene_id: body.scene_id ?? null,
      material: body.material ?? null,
      lighting: body.lighting ?? null,
      kind: body.kind ?? "still",
      width: body.width ?? null,
      height: body.height ?? null,
    }),
  });

  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: upstreamError(json, "Upstream error") },
      { status: upstream.status },
    );
  }

  return NextResponse.json({
    ok: true,
    ...(json as Record<string, unknown>),
    modelId: body.modelId ?? null,
    material: body.material ?? null,
    lighting: body.lighting ?? null,
  });
}
