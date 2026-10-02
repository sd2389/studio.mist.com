import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { enforceApiRateLimit } from "@/lib/observability/api-rate-limit";

type RegisterBody = {
  key?: string;
  name?: string;
  sku?: string;
  category?: string;
  note?: string;
  thumbnail_key?: string;
  polygon_count?: number;
  material?: string;
  model_config?: Record<string, unknown>;
  slot_selections?: Record<string, string>;
  scene_settings?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const limited = await enforceApiRateLimit({
    scope: "api.upload.register",
    maxRequests: 30,
    request,
  });
  if (limited) return limited;

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Presigned uploads land under the customer's own prefix; the API checks the key is theirs.
  if (!/^customers\/\d+\/models\/[^/]+$/.test(body.key ?? "")) {
    return NextResponse.json({ error: "key must be a customer model key" }, { status: 400 });
  }

  if (!Number.isInteger(body.polygon_count) || (body.polygon_count ?? -1) < 0) {
    return NextResponse.json(
      { error: "polygon_count must be a non-negative integer" },
      { status: 400 },
    );
  }

  const upstream = await upstreamFetch("/upload/register", {
    method: "POST",
    body: JSON.stringify({
      key: body.key,
      name: body.name,
      sku: body.sku,
      category: body.category,
      note: body.note,
      thumbnail_key: body.thumbnail_key,
      polygon_count: body.polygon_count,
      material: body.material ?? "original",
      model_config: body.model_config ?? {},
      slot_selections: body.slot_selections ?? {},
      scene_settings: body.scene_settings ?? {},
    }),
  });

  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Register failed") },
      { status: upstream.status },
    );
  }

  return NextResponse.json(json);
}
