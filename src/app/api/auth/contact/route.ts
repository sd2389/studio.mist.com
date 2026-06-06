import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/auth/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Could not send message") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
