import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";

type RegisterBody = {
  key?: string;
  material?: string;
  model_config?: Record<string, unknown>;
  slot_selections?: Record<string, string>;
  scene_settings?: Record<string, unknown>;
};

export async function POST(request: Request) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.key?.startsWith("models/")) {
    return NextResponse.json({ error: "key must start with models/" }, { status: 400 });
  }

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  const upstream = await fetch(`${api}/upload/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: body.key,
      material: body.material ?? "original",
      model_config: body.model_config ?? {},
      slot_selections: body.slot_selections ?? {},
      scene_settings: body.scene_settings ?? {},
    }),
  });

  const json = (await upstream.json()) as Record<string, unknown>;
  if (!upstream.ok) {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : typeof json.error === "string"
          ? json.error
          : "Register failed";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }

  return NextResponse.json(json);
}
