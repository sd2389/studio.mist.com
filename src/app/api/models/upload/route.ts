import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";
import { getServerApiUrl } from "@/lib/api-url";
import { enforceApiRateLimit } from "@/lib/observability/api-rate-limit";

export async function POST(request: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const limited = await enforceApiRateLimit({
    scope: "api.upload.direct",
    maxRequests: 20,
    request,
  });
  if (limited) return limited;

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
  const name = incoming.get("name");
  const sku = incoming.get("sku");
  const category = incoming.get("category");
  const note = incoming.get("note");
  if (typeof modelConfig === "string") outgoing.append("model_config", modelConfig);
  if (typeof slotSelections === "string") outgoing.append("slot_selections", slotSelections);
  if (typeof sceneSettings === "string") outgoing.append("scene_settings", sceneSettings);
  if (typeof name === "string") outgoing.append("name", name);
  if (typeof sku === "string") outgoing.append("sku", sku);
  if (typeof category === "string") outgoing.append("category", category);
  if (typeof note === "string") outgoing.append("note", note);

  const auth = await authHeaders();
  let upstream: Response;
  try {
    upstream = await fetch(`${api}/upload`, {
      method: "POST",
      headers: auth,
      body: outgoing,
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }

  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Upload failed") },
      { status: upstream.status },
    );
  }

  return NextResponse.json(json);
}
