import { NextResponse } from "next/server";
import { getPublicApiUrl, getServerApiUrl } from "@/lib/api-url";

type Body = {
  jewelry_b64?: string;
  prompt?: string | null;
};

export async function POST(request: Request) {
  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json(
      { error: "Set API_URL or NEXT_PUBLIC_API_URL for the FastAPI server" },
      { status: 503 },
    );
  }

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

  const upstream = await fetch(`${api}/ai-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jewelry_b64: body.jewelry_b64,
      prompt: body.prompt ?? null,
    }),
  });

  const json = (await upstream.json()) as {
    result_key?: string;
    result_url?: string | null;
    mode?: string;
    detail?: unknown;
  };

  if (!upstream.ok) {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : json.detail != null
          ? JSON.stringify(json.detail)
          : "Upstream error";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }

  const publicBase = getPublicApiUrl();
  const resultUrl =
    json.result_url ??
    (json.result_key && publicBase ? `${publicBase}/files/${json.result_key}` : null);

  return NextResponse.json({
    result_key: json.result_key,
    result_url: resultUrl,
    mode: json.mode,
  });
}
