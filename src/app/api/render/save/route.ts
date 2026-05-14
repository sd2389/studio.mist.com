import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";

type SaveBody = {
  modelId?: string;
  material?: string;
  lighting?: string;
  image?: string;
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

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json(
      { ok: false, error: "Set API_URL or NEXT_PUBLIC_API_URL to reach the FastAPI /renders endpoint" },
      { status: 503 },
    );
  }

  const upstream = await fetch(`${api}/renders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: body.image,
      model_id: body.modelId ?? null,
      material: body.material ?? null,
      lighting: body.lighting ?? null,
    }),
  });

  const json = (await upstream.json()) as Record<string, unknown>;
  if (!upstream.ok) {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : Array.isArray(json.detail)
          ? JSON.stringify(json.detail)
          : typeof json.error === "string"
            ? json.error
            : "Upstream error";
    return NextResponse.json({ ok: false, error: detail }, { status: upstream.status });
  }

  return NextResponse.json({
    ok: true,
    key: json.key,
    bytes: json.bytes,
    modelId: body.modelId ?? null,
    material: body.material ?? null,
    lighting: body.lighting ?? null,
  });
}
