import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { GemoraCatalogItem } from "@/lib/gemora-catalog";

type WrappedData = {
  data?: GemoraCatalogItem[];
};

function resolveCatalogFile(name: "metals" | "gems" | "scenes"): string {
  const baseDir =
    process.env.GEMORA_CATALOG_DIR ??
    path.resolve(process.cwd(), "..", ".planning", "research", "gemora");
  return path.join(baseDir, `${name}.json`);
}

async function readWrappedData(name: "metals" | "gems" | "scenes"): Promise<GemoraCatalogItem[]> {
  const raw = await readFile(resolveCatalogFile(name), "utf8");
  const parsed = JSON.parse(raw) as WrappedData[];
  const items = parsed[0]?.data;
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item.isActive !== false);
}

export async function GET() {
  try {
    const [metals, gems, scenes] = await Promise.all([
      readWrappedData("metals"),
      readWrappedData("gems"),
      readWrappedData("scenes"),
    ]);

    return NextResponse.json({
      metals,
      gems,
      scenes,
      counts: {
        metals: metals.length,
        gems: gems.length,
        scenes: scenes.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load catalog";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
