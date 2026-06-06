import type { NextRequest } from "next/server";
import { proxyCatalog } from "@/lib/catalog/proxy";

export async function GET(req: NextRequest) {
  return proxyCatalog("/catalog/metals", req.nextUrl.searchParams);
}
