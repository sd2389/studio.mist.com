import type { GemStudioPreset } from "@/lib/gem-gpu/gem-studio-environment";

/**
 * Studio scenes: the set a jewelry photographer would build around a piece — backdrop,
 * surface, props and the light tent that suits them — rendered live around the model.
 * Desktop pipelines sell these as scene files that must be opened in separate render
 * software; here a scene is one click and every capture, 360° and embed inherits it.
 */

export type SceneSetupId =
  | "studio"
  | "catalog-white"
  | "black-mirror"
  | "white-mirror"
  | "still-water"
  | "marble-plinth"
  | "crystal-garden"
  | "champagne-silk";

export type FloorSpec =
  | { kind: "shadow"; opacity: number }
  | { kind: "mirror"; color: string; reflectivity: number; roughness: number; shadowOpacity: number }
  | { kind: "water"; color: string; reflectivity: number; rippleStrength: number };

export type PropSpec = "plinth-marble" | "crystals" | "silk";

export type SceneSetup = {
  id: SceneSetupId;
  label: string;
  description: string;
  /** Canvas clear colour; the floor fades into it so the set has no visible edge. */
  background: string;
  floor: FloorSpec;
  props: PropSpec[];
  gemTent: GemStudioPreset;
  /** Multiplies the lighting preset's exposure. */
  exposure: number;
  /** Star-filter sparkle on gem glints by default; dark sets show it best. */
  starGlints: boolean;
  /** CSS for the picker swatch. */
  swatch: string;
};

export const SCENE_SETUPS: readonly SceneSetup[] = [
  {
    id: "studio",
    label: "Studio",
    description: "Warm paper sweep with a soft contact shadow.",
    background: "",
    floor: { kind: "shadow", opacity: 0.24 },
    props: [],
    gemTent: "white",
    exposure: 1,
    starGlints: false,
    swatch: "linear-gradient(160deg,#f4f1ea,#ddd6ca)",
  },
  {
    id: "catalog-white",
    label: "Catalog white",
    description: "Pure white e-commerce backdrop, marketplace ready.",
    background: "#FFFFFF",
    floor: { kind: "shadow", opacity: 0.18 },
    props: [],
    gemTent: "white",
    exposure: 1.04,
    starGlints: false,
    swatch: "linear-gradient(160deg,#ffffff,#eef0f3)",
  },
  {
    id: "black-mirror",
    label: "Black mirror",
    description: "Polished black acrylic with a crisp reflection.",
    background: "#0B0C0F",
    floor: { kind: "mirror", color: "#050607", reflectivity: 0.55, roughness: 0.02, shadowOpacity: 0.5 },
    props: [],
    gemTent: "contrast",
    exposure: 1.06,
    starGlints: true,
    swatch: "linear-gradient(180deg,#1b1d22 0%,#050607 60%,#2a2d33 100%)",
  },
  {
    id: "white-mirror",
    label: "White gloss",
    description: "Glossy white surface, soft mirrored reflection.",
    background: "#F3F4F6",
    floor: { kind: "mirror", color: "#F3F4F6", reflectivity: 0.32, roughness: 0.18, shadowOpacity: 0.16 },
    props: [],
    gemTent: "white",
    exposure: 1,
    starGlints: false,
    swatch: "linear-gradient(180deg,#ffffff 0%,#e8eaee 60%,#f7f7f8 100%)",
  },
  {
    id: "still-water",
    label: "Still water",
    description: "Dark water with slow ripples beneath the piece.",
    background: "#0A1216",
    floor: { kind: "water", color: "#08171C", reflectivity: 0.6, rippleStrength: 1 },
    props: [],
    gemTent: "sparkle",
    exposure: 1.08,
    starGlints: true,
    swatch: "radial-gradient(circle at 50% 70%,#1c3a44,#081217 70%)",
  },
  {
    id: "marble-plinth",
    label: "Marble plinth",
    description: "White Carrara marble pedestal on a stone-grey set.",
    background: "#D9D6D0",
    floor: { kind: "shadow", opacity: 0.2 },
    props: ["plinth-marble"],
    gemTent: "white",
    exposure: 1,
    starGlints: false,
    swatch: "linear-gradient(160deg,#f5f3ef 0%,#d6d2cb 55%,#bdb8b0 100%)",
  },
  {
    id: "crystal-garden",
    label: "Crystal garden",
    description: "Clear quartz points around the piece, ray-traced like the stones.",
    background: "#101116",
    floor: { kind: "mirror", color: "#0A0B0E", reflectivity: 0.35, roughness: 0.06, shadowOpacity: 0.45 },
    props: ["crystals"],
    gemTent: "studio",
    exposure: 1.05,
    starGlints: true,
    swatch: "linear-gradient(160deg,#2b2f3a,#0d0e12 70%)",
  },
  {
    id: "champagne-silk",
    label: "Champagne silk",
    description: "Draped satin in a warm champagne tone.",
    background: "#E8DCCB",
    floor: { kind: "shadow", opacity: 0.2 },
    props: ["silk"],
    gemTent: "white",
    exposure: 1,
    starGlints: false,
    swatch: "linear-gradient(135deg,#f6ead7,#d9c3a1 50%,#f1e2ca)",
  },
];

export const DEFAULT_SCENE_SETUP_ID: SceneSetupId = "studio";

export function isSceneSetupId(value: unknown): value is SceneSetupId {
  return typeof value === "string" && SCENE_SETUPS.some((s) => s.id === value);
}

/** Unknown or missing ids (older saved looks) fall back to the default studio sweep. */
export function resolveSceneSetup(id: string | null | undefined): SceneSetup {
  return SCENE_SETUPS.find((s) => s.id === id) ?? SCENE_SETUPS[0]!;
}

/** Scenes that bring their own backdrop colour; "studio" follows the lighting preset. */
export function sceneSetupBackground(setup: SceneSetup): string | null {
  return setup.background || null;
}
