import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";

export async function POST(request: Request) {
  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Expected non-empty file field" }, { status: 400 });
  }

  const outgoing = new FormData();
  outgoing.append("file", file, file.name);
  const modelConfig = incoming.get("model_config");
  const slotSelections = incoming.get("slot_selections");
  const sceneSettings = incoming.get("scene_settings");
  if (typeof modelConfig === "string") outgoing.append("model_config", modelConfig);
  if (typeof slotSelections === "string") outgoing.append("slot_selections", slotSelections);
  if (typeof sceneSettings === "string") outgoing.append("scene_settings", sceneSettings);

  const upstream = await fetch(`${api}/upload`, {
    method: "POST",
    body: outgoing,
  });

  const json = (await upstream.json()) as Record<string, unknown>;
  if (!upstream.ok) {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : typeof json.error === "string"
          ? json.error
          : "Upload failed";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }

  return NextResponse.json(json);
}
