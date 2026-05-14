import type { MaterialPresetId } from "@/stores/material-preset-store";

export type GemoraCatalogItem = {
  _id: string;
  type: string;
  category: string;
  name: string;
  thumbnail?: string;
  value?: string;
  isActive?: boolean;
  weight?: number;
};

export type GemoraCatalogPayload = {
  metals: GemoraCatalogItem[];
  gems: GemoraCatalogItem[];
  scenes: GemoraCatalogItem[];
  counts: {
    metals: number;
    gems: number;
    scenes: number;
  };
};

export function resolveGemoraAssetUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const path = trimmed.replace(/^\/+/, "");
  return `https://assets.gemorastudio.com/${path}`;
}

const METAL_FALLBACK: MaterialPresetId = "gold-14k-yellow";
const GEM_FALLBACK: MaterialPresetId = "diamond";

export function mapGemoraMetalToPreset(item: GemoraCatalogItem): MaterialPresetId {
  const token = `${item.type} ${item.name}`.toLowerCase();

  if (token.includes("blackrhodium")) return "rhodium-black";
  if (token.includes("platinum")) return "platinum";
  if (token.includes("silver")) return "silver-sterling";
  if (token.includes("titan")) return "titanium";
  if (token.includes("warmgold")) return "gold-warm";
  if (token.includes("sandgold")) return "gold-sand";
  if (token.includes("greengold")) return "gold-green";
  if (token.includes("greygold")) return "gold-grey";
  if (token.includes("redgoldlight")) return "gold-red-light";
  if (token.includes("redgold")) return "gold-red";
  if (token.includes("rosegold")) {
    if (token.includes("14k")) return "gold-14k-rose";
    return "gold-18k-rose";
  }
  if (token.includes("whitegold")) {
    if (token.includes("10k")) return "gold-10k-white";
    if (token.includes("14k")) return "gold-14k-white";
    return "gold-18k-white";
  }
  if (token.includes("24k")) return "gold-24k";
  if (token.includes("22k")) return "gold-22k";
  if (token.includes("18k")) return "gold-18k-yellow";
  if (token.includes("14k")) return "gold-14k-yellow";
  if (token.includes("10k")) return "gold-10k-yellow";
  if (token.includes("09k") || token.includes("9k")) return "gold-9k-yellow";
  if (token.includes("gold")) return "gold-14k-yellow";

  return METAL_FALLBACK;
}

export function mapGemoraGemToPreset(item: GemoraCatalogItem): MaterialPresetId {
  const token = `${item.type} ${item.name}`.toLowerCase();

  if (token.includes("moissanite")) return "moissanite";
  if (token.includes("diamond")) {
    if (token.includes("black")) return "diamond-black";
    if (token.includes("blue")) return "diamond-blue";
    if (token.includes("pink")) return "diamond-pink";
    if (token.includes("cognac") || token.includes("brown")) return "diamond-cognac";
    if (token.includes("champagne")) return "diamond-champagne";
    if (
      token.includes("yellow") ||
      token.includes("canary") ||
      token.includes("k faintyellow") ||
      token.includes("p verylightyellow") ||
      token.includes("t lightyellow")
    ) {
      return "diamond-canary";
    }
    return "diamond";
  }

  if (token.includes("emerald")) return "emerald";
  if (token.includes("ruby")) return "ruby";
  if (token.includes("sapphire")) return "sapphire";
  if (token.includes("zircon")) return "zircon";
  if (token.includes("amethyst") || token.includes("amethist")) return "amethyst";
  if (token.includes("aquamarin")) return "aquamarine";
  if (token.includes("citrine")) return "citrine";
  if (token.includes("morganit")) return "morganite";
  if (token.includes("peridot")) return "peridot";
  if (token.includes("topas") || token.includes("topaz")) return "topaz-blue";
  if (token.includes("tourmalin")) return "tourmaline";
  if (token.includes("tansanit") || token.includes("tanzanit")) return "tanzanite";
  if (token.includes("tsavorit")) return "garnet-tsavorite";
  if (token.includes("garnet")) return "garnet-almandine";
  if (token.includes("spinel")) return "spinel";
  if (token.includes("opal")) return "opal";
  if (token.includes("jade")) return "jade";
  if (token.includes("pearl")) return "pearl";

  return GEM_FALLBACK;
}

export async function fetchGemoraCatalog(): Promise<GemoraCatalogPayload> {
  const response = await fetch("/api/catalog/gemora", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load Gemora-style catalog");
  }
  return (await response.json()) as GemoraCatalogPayload;
}
