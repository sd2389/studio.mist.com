import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";

export async function GET() {
  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  const upstream = await fetch(`${api}/scenes`, { cache: "no-store" });
  const json = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const detail =
      (json as { detail?: string; error?: string })?.detail ??
      (json as { detail?: string; error?: string })?.error ??
      "Failed to list scenes";
    return NextResponse.json({ error: detail }, { status: upstream.status });
  }
  return NextResponse.json(json);
}
