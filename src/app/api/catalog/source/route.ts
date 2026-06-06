import { NextResponse } from "next/server";
import { loadSourceCatalogServer } from "@/lib/catalog/load-source-catalog";

export async function GET() {
  const payload = await loadSourceCatalogServer();
  if (!payload) {
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
  return NextResponse.json(payload);
}

