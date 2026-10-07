import "server-only";

import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

/** What the browser needs from the API's answer to save the file. */
const FILE_HEADERS = ["content-type", "content-length", "content-disposition"] as const;

/**
 * A file the API serves the signed-in user (a job's output, a batch's manifest or archive part):
 * its redirect to a short-lived signed link, or the file itself (local storage, or a file the API
 * builds). The session never leaves the server; an error answers as the API's JSON does.
 */
export async function relayFileDownload(request: Request, path: string, fallback: string): Promise<Response> {
  const upstream = await upstreamFetch(path, { redirect: "manual", signal: request.signal });
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const location = upstream.headers.get("location");
  if (location && upstream.status >= 300 && upstream.status < 400) {
    headers.set("Location", location);
    return new Response(null, { status: upstream.status, headers });
  }
  if (!upstream.ok) return relayUpstreamJson(upstream, fallback);

  for (const name of FILE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
