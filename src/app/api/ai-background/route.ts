import { NextResponse } from "next/server";
import { getPublicApiUrl } from "@/lib/api-url";
import { requireSessionApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { enforceApiRateLimit } from "@/lib/observability/api-rate-limit";

type Body = {
  jewelry_b64?: string;
  prompt?: string | null;
  sub_mode?: "shoot" | "model" | "custom";
  preset_id?: string | null;
  model_variant?: "hand" | "neck" | "ear" | null;
};

export async function POST(request: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const limited = await enforceApiRateLimit({
    scope: "api.ai-background",
    maxRequests: 60,
    request,
  });
  if (limited) return limited;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.jewelry_b64?.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Expected jewelry_b64 as a PNG data URL (data:image/png;base64,...)" },
      { status: 400 },
    );
  }

  const upstream = await upstreamFetch("/ai-background", {
    method: "POST",
    body: JSON.stringify({
      jewelry_b64: body.jewelry_b64,
      prompt: body.prompt ?? null,
      sub_mode: body.sub_mode ?? "custom",
      preset_id: body.preset_id ?? null,
      model_variant: body.model_variant ?? "hand",
    }),
  });

  const json = (await readUpstreamJson(upstream)) as {
    result_key?: string;
    result_url?: string | null;
    mode?: string;
    sub_mode?: string;
    prompt?: string;
    detail?: unknown;
    error?: string;
  };

  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Upstream error") },
      { status: upstream.status },
    );
  }

  const publicBase = getPublicApiUrl();
  const resultUrl =
    json.result_url ??
    (json.result_key && publicBase ? `${publicBase}/files/${json.result_key}` : null);

  return NextResponse.json({
    result_key: json.result_key,
    result_url: resultUrl,
    mode: json.mode,
    sub_mode: json.sub_mode,
    prompt: json.prompt,
  });
}
