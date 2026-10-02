import type { CutId } from "@/lib/stones/cut-geometries";

/**
 * The Features page, chapter by chapter. Every number here is read from the product:
 * upload formats (src/lib/upload/model-files.ts), cuts (src/lib/stones/cad-cuts.ts), gem
 * and fancy-diamond presets (src/lib/gem-gpu), metals and finishes (material presets),
 * scene sets (src/features/scene-setups), lighting (src/lib/viewer-lighting.ts), export
 * sizes (src/lib/export-presets.ts), designer presets (src/lib/jewelry-cad/presets.ts) and
 * plan quotas (backend billing plans). Change the product, change this file.
 */

export type FeatureMedia =
  | { kind: "image"; src: string; alt: string; caption: string; width: number; height: number }
  | { kind: "stone"; cutId: CutId; caption: string };

export type FeatureSection = {
  id: string;
  /** Short name for the index. */
  label: string;
  title: string;
  titleItalic: string;
  lead: string;
  specs: { label: string; value: string }[];
  points: string[];
  media: FeatureMedia;
  cta?: { href: string; label: string };
};

export const FEATURE_SECTIONS: readonly FeatureSection[] = [
  {
    id: "import",
    label: "Import",
    title: "Bring your CAD,",
    titleItalic: "in any of ten formats.",
    lead: "Drop a Rhino, STEP or mesh file and it opens as a lit studio scene, its metals and stones split into slots you can dress.",
    specs: [
      { label: "Formats", value: "10" },
      { label: "CAD", value: "3DM · STEP · IGES" },
      { label: "Mesh", value: "OBJ · FBX · STL · PLY · 3MF · GLB · GLTF" },
      { label: "Layers", value: "Metals + stones" },
    ],
    points: [
      "Rhino 3DM, STEP and IGES are read directly — no export step from your CAD.",
      "Converted in your browser: the file stays on your device until you save, with units normalised to millimetres.",
      "Metal and stone layers are detected and named; rename, hide and inspect each one before saving.",
    ],
    media: {
      kind: "image",
      src: "/images/features/workflow-cad.webp",
      alt: "Blueprint wireframe of a six-prong solitaire",
      caption: "Your CAD · read as it is",
      width: 1448,
      height: 1086,
    },
    cta: { href: "/upload-model", label: "Upload a piece" },
  },
  {
    id: "stones",
    label: "Stones",
    title: "Ray-traced,",
    titleItalic: "stone by stone.",
    lead: "Every pixel of a stone is traced through its facets with true refraction and dispersion, so its fire and brilliance come from the cut itself — at gemmological values, never boosted.",
    specs: [
      { label: "Cuts", value: "22" },
      { label: "Gem materials", value: "74" },
      { label: "Fancy diamonds", value: "45 · 9 hues × 5 grades" },
      { label: "Ray bounces", value: "3 · 6 · 9" },
    ],
    points: [
      "An ASET scope built in — the same light-return map a gem lab draws.",
      "Fancy colour grades from Light to Deep, coloured by absorption, not a tint.",
      "Three trace qualities: fast for editing, photometric for the final frame.",
    ],
    media: { kind: "stone", cutId: "round", caption: "Live · round brilliant, ray-traced" },
    cta: { href: "/stones", label: "Explore the cuts" },
  },
  {
    id: "materials",
    label: "Materials",
    title: "Every metal,",
    titleItalic: "every finish.",
    lead: "Twenty-one metals with their real reflectance — yellow, white, rose and coloured golds from 9K to 24K, platinum, silver, titanium and rhodium black — in five finishes.",
    specs: [
      { label: "Metals", value: "21" },
      { label: "Golds", value: "9K → 24K" },
      { label: "Finishes", value: "5" },
      { label: "Per slot", value: "Metal · stone" },
    ],
    points: [
      "Polished, satin, brushed, hammered and sandblasted finishes.",
      "Each metal and stone slot takes its own material — two-tone heads included.",
      "Precious and coloured gemstones, pearls, opals and cabochons.",
    ],
    media: {
      kind: "image",
      src: "/images/features/gem-colour.webp",
      alt: "Sapphire, emerald and ruby set in six-prong white-gold heads",
      caption: "Sapphire · emerald · ruby",
      width: 1750,
      height: 700,
    },
  },
  {
    id: "scenes",
    label: "Scenes",
    title: "Set it anywhere,",
    titleItalic: "light it like a studio.",
    lead: "Eight studio sets — mirror, water, marble, silk and more — and five lighting setups, rendered live around your piece with the floor, reflections and props fitted to it.",
    specs: [
      { label: "Studio sets", value: "8" },
      { label: "Lighting", value: "5 setups" },
      { label: "Optics", value: "Bloom · star glints" },
      { label: "Lens", value: "Macro depth of field" },
    ],
    points: [
      "Studio, catalogue white, black mirror, white gloss, still water, marble plinth, crystal garden and champagne silk.",
      "Studio, soft, low-key, catalogue and dramatic lighting, each with its own light tent for stones.",
      "Ambient occlusion and contact shadows ground the piece on any set.",
    ],
    media: {
      kind: "image",
      src: "/images/features/studio-scenes.webp",
      alt: "The same solitaire on a black mirror, champagne silk and still water",
      caption: "Black mirror · champagne silk · still water",
      width: 1824,
      height: 750,
    },
  },
  {
    id: "outputs",
    label: "Outputs",
    title: "Stills, spins",
    titleItalic: "and a whole campaign.",
    lead: "Export production stills and turntable video straight from the studio, or a Campaign Pack: every metal from every angle, with turntables and a 360° spin, in one ZIP.",
    specs: [
      { label: "Stills", value: "HD · 2K · 4K · 8K" },
      { label: "Aspects", value: "16:9 · 1:1 · 4:3" },
      { label: "Video", value: "H.264 MP4 · up to 8K" },
      { label: "Files", value: "PNG · JPEG · transparent" },
    ],
    points: [
      "Campaign Pack: stills, turntables, a 360° spin with its own viewer, and ASET scopes for each metal — rendered in your browser into one ZIP.",
      "Turntables loop seamlessly from the current view; batch video runs 24–120 fps.",
      "Transparent cutouts for marketplaces, and AI backgrounds and on-model shots (beta).",
    ],
    media: {
      kind: "image",
      src: "/images/features/campaign-pack-stills.webp",
      alt: "A grid of stills: one solitaire in yellow, white and rose gold from four angles",
      caption: "Campaign Pack · 3 metals × 4 angles",
      width: 1962,
      height: 1468,
    },
  },
  {
    id: "embed",
    label: "Embed",
    title: "Put it on",
    titleItalic: "your product page.",
    lead: "One snippet puts the live 3D viewer on your store, showing the piece exactly as you finished it in the studio. Shoppers turn it and zoom in; the look stays as you set it.",
    specs: [
      { label: "Install", value: "One iframe" },
      { label: "Shoppers", value: "Turn · zoom" },
      { label: "View", value: "Live, ray-traced 3D" },
      { label: "Plans", value: "Every plan" },
    ],
    points: [
      "Copy the snippet from any piece with a SKU; it shows the saved metals, stones, finish, lighting, backdrop and camera view.",
      "Turn the header, title, auto-rotate, zoom and branding on or off. What you save later shows up in snippets already on your store.",
      "Neutral styling that sits inside any storefront, with fullscreen and touch-sized controls.",
    ],
    media: {
      kind: "image",
      src: "/images/features/embed-view.webp",
      alt: "The embedded viewer showing a yellow gold ring set with a sapphire, with zoom controls",
      caption: "What shoppers see",
      width: 1400,
      height: 704,
    },
  },
  {
    id: "designer",
    label: "Designer",
    title: "Design a ring,",
    titleItalic: "down to the millimetre.",
    lead: "Nine parametric styles, from solitaire to pendant, with heads fitted to the stone, live specs and a price — and files a caster can use.",
    specs: [
      { label: "Styles", value: "9" },
      { label: "Downloads", value: "STL · OBJ · GLB" },
      { label: "Sizes", value: "STL per half size" },
      { label: "Specs", value: "Weight per alloy" },
    ],
    points: [
      "Solitaire, halo, pavé, three-stone, eternity, bezel, band, studs and pendant.",
      "Watertight, edge-manifold solids, checked by the test suite.",
      "A quote from your own metal and labour rates, beside the live specs.",
    ],
    media: {
      kind: "image",
      src: "/images/features/ring-designer.webp",
      alt: "The ring designer with a halo ring, its style and stone options",
      caption: "Halo · 1.00 ct round",
      width: 1800,
      height: 1063,
    },
    cta: { href: "/design", label: "Open the designer" },
  },
  {
    id: "workspace",
    label: "Workspace",
    title: "A workshop",
    titleItalic: "for every piece.",
    lead: "Your scenes in one place: edit, share an embed, export. Start with three pieces free, then top up or pick a plan.",
    specs: [
      { label: "Free", value: "3 pieces" },
      { label: "Plans", value: "Free · Grow · Studio" },
      { label: "Storage", value: "5 → 500 GB" },
      { label: "Polygons", value: "100k → 2M" },
    ],
    points: [
      "Every saved piece keeps its look, embed and exports together; search by name, SKU or category.",
      "Credit packs on top of any plan, whenever you need more.",
      "The whole studio on every plan — plans differ in how much you use.",
    ],
    media: {
      kind: "image",
      src: "/images/features/hero-ring-platinum.webp",
      alt: "A platinum solitaire rendered on white",
      caption: "Platinum 950 · catalogue white",
      width: 1320,
      height: 1320,
    },
    cta: { href: "/pricing", label: "See pricing" },
  },
];
