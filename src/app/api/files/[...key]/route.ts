import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";
import { authHeaders, getSessionToken } from "@/lib/auth/server-session";

/** Keep session credentials server-side while Three.js and images load private assets. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (!await getSessionToken()) {
    return NextResponse.json({ error: "Sign in to view this model" }, { status: 401 });
  }
  const { key } = await params;
  if (!key.length || key.some((part) => !part || part === "." || part.includes("..") || /[\\/]/.test(part))) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }
  const api = getServerApiUrl();
  if (!api) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  const headers = new Headers(await authHeaders());
  const range = request.headers.get("range");
  if (range) headers.set("Range", range);
  let upstream: Response;
  try {
    upstream = await fetch(`${api}/files/${key.map(encodeURIComponent).join("/")}`, {
      headers, cache: "no-store", redirect: "manual", signal: request.signal,
    });
  } catch {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }
  const responseHeaders = new Headers({ "Cache-Control": "private, no-store" });
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "location"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
