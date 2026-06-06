import { NextResponse, type NextRequest } from "next/server";
import { proxyCatalog } from "@/lib/catalog/proxy";

const KIND_TO_PATH: Record<string, string> = {
  environments: "/catalog/environments",
  backgrounds: "/catalog/backgrounds",
  grounds: "/catalog/grounds",
  "scene-presets": "/catalog/scene-presets",
};

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const kind = searchParams.get("kind") ?? "environments";
  const backendPath = KIND_TO_PATH[kind];
  if (!backendPath) {
    return NextResponse.json(
      { error: `Unknown scenes kind: ${kind}` },
      { status: 400 },
    );
  }
  searchParams.delete("kind");
  return proxyCatalog(backendPath, searchParams);
}
