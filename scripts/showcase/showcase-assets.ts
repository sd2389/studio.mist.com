import { buildJewelry, exportGlb, getPreset, usSizeToInnerDiameterMm, type JewelryDesign } from "@/lib/jewelry-cad";

/**
 * Bundled models generated from the CAD library (run via `scripts/create-showcase-ring.mjs`).
 *
 * - `mist-solitaire/ring.glb`: the landing hero and `/viewer/mist-solitaire`. A six-prong
 *   1 ct round brilliant on a tapered comfort band. `LandingRing` uses it unscaled and
 *   resets every mesh's `position.y` each frame, so geometry is baked (no node transforms)
 *   at the old showcase's framing (band outer radius 0.783 units, head up +y, finger
 *   along z), and the head is folded into `Metal 1` to match `bundled-scenes.ts`
 *   (`Metal 1` + `Gem 1`).
 * - `samples/solitaire.glb`, `samples/halo.glb`: the upload page's sample rings, in
 *   millimetres with every studio slot (Metal 1, Heads, Gem 1, Accent 1).
 */

export type GeneratedAsset = { path: string; bytes: ArrayBuffer; summary: string };

const SHOWCASE_OUTER_RADIUS = 0.783;

export const SHOWCASE_DESIGN: JewelryDesign = {
  ...getPreset("solitaire").design,
  head: "6-prong",
  cut: "round",
  carat: 1,
  profile: "comfort",
  taper: 0.3,
  bandWidth: 2.1,
  bandThickness: 1.7,
  metal: "platinum",
  ringSize: 6,
};

function summarize(name: string, design: JewelryDesign): string {
  const built = buildJewelry(design);
  const s = built.specs;
  return `${name}: ${s.stoneCount} stone(s), ${s.totalCarat} ctw, ${s.metalGrams} g ${design.metal}, ${s.sizeMm.x}×${s.sizeMm.y}×${s.sizeMm.z} mm`;
}

export async function buildShowcaseAssets(): Promise<GeneratedAsset[]> {
  const showcase = buildJewelry(SHOWCASE_DESIGN);
  const outerRadius = usSizeToInnerDiameterMm(SHOWCASE_DESIGN.ringSize) / 2 + SHOWCASE_DESIGN.bandThickness;
  const scale = SHOWCASE_OUTER_RADIUS / outerRadius;

  const halo = getPreset("halo").design;
  const sampleSolitaire = buildJewelry(SHOWCASE_DESIGN);
  const sampleHalo = buildJewelry(halo);

  return [
    {
      path: "public/models/mist-solitaire/ring.glb",
      bytes: await exportGlb(showcase.parts, { scale, mergeMetal: true, rootName: "MIST Solitaire" }),
      summary: `${summarize("showcase", SHOWCASE_DESIGN)} (scaled ×${scale.toFixed(4)})`,
    },
    {
      path: "public/models/samples/solitaire.glb",
      bytes: await exportGlb(sampleSolitaire.parts, { rootName: "MIST Solitaire" }),
      summary: summarize("sample solitaire", SHOWCASE_DESIGN),
    },
    {
      path: "public/models/samples/halo.glb",
      bytes: await exportGlb(sampleHalo.parts, { rootName: "MIST Halo" }),
      summary: summarize("sample halo", halo),
    },
  ];
}
