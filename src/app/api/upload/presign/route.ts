import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";
import { requireSessionApi } from "@/lib/auth/require-api-access";
import { upstreamFetch } from "@/lib/auth/upstream";
import { enforceApiRateLimit } from "@/lib/observability/api-rate-limit";

type PresignBody = {
  filename?: string;
  content_type?: string;
};

export async function POST(request: Request) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const limited = await enforceApiRateLimit({
    scope: "api.upload.presign",
    maxRequests: 30,
    request,
  });
  if (limited) return limited;

  let body: PresignBody;
  try {
    body = (await request.json()) as PresignBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filename = body.filename;
  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json(
      { error: "Presign unavailable: set API_URL or NEXT_PUBLIC_API_URL for FastAPI presign" },
      { status: 503 },
    );
  }

  const upstream = await upstreamFetch("/upload/presign", {
    method: "POST",
    body: JSON.stringify({
      filename,
      content_type: body.content_type || "model/gltf-binary",
    }),
  });

  const json = (await upstream.json()) as Record<string, unknown>;
  if (!upstream.ok) {
    const detail =
      typeof json.detail === "string"
        ? json.detail
        : typeof json.error === "string"
          ? json.error
          : "Presign failed";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }

  return NextResponse.json({ ...json, source: "fastapi" });
}
