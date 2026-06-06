import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { getServerApiUrl } from "@/lib/api-url";
import { authHeaders } from "@/lib/auth/server-session";

export async function POST(req: NextRequest) {
  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "API_URL is not configured" }, { status: 500 });
  }

  const incoming = await req.formData();
  const outgoing = new FormData();
  const file = incoming.get("file");
  const assetType = incoming.get("asset_type");
  const label = incoming.get("label");
  if (file instanceof File) outgoing.append("file", file);
  if (typeof assetType === "string") outgoing.append("asset_type", assetType);
  if (typeof label === "string") outgoing.append("label", label);

  const auth = await authHeaders();
  const headers = new Headers(auth);

  const upstream = await fetch(`${api}/library/assets/upload`, {
    method: "POST",
    headers,
    body: outgoing,
    cache: "no-store",
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to upload asset") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
