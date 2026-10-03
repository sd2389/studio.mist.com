import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

/** The filters `GET /scenes` takes; the API validates their values. */
const LIST_PARAMS = ["q", "category", "page", "limit"] as const;

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const name of LIST_PARAMS) {
    const value = incoming.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  const query = forwarded.toString();
  const upstream = await upstreamFetch(query ? `/scenes?${query}` : "/scenes");
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to list scenes") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
