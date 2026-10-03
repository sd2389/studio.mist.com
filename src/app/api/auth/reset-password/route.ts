import { NextResponse } from "next/server";
import { clientIpHeaders } from "@/lib/auth/client-ip";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/auth/reset-password", {
    method: "POST",
    headers: clientIpHeaders(request),
    body: JSON.stringify(payload),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Reset failed") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
