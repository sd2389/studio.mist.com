import { attenuationForAbsorption, linearHex, type Absorption } from "./gem-absorption";
import type { GemConfig } from "./gem-configs";

/**
 * Fancy-colour diamonds on GIA's grading scale. A hue is a relative absorption spectrum —
 * what the stone takes out of white light, per stone radius. A grade scales how much it
 * takes (saturation rises from Fancy Light to Fancy Vivid), and Fancy Deep adds neutral
 * absorption: the darker tone GIA grades separately from vividness. The trace applies it
 * over each ray's real path, so colour deepens toward the culet and pools in the corners
 * the way it does in a real stone, instead of tinting the whole diamond flat.
 */
export const FANCY_HUES = [
  { id: "yellow", label: "Yellow", absorption: [0, 0.06, 0.55] },
  { id: "orange", label: "Orange", absorption: [0, 0.24, 0.7] },
  { id: "pink", label: "Pink", absorption: [0, 0.32, 0.12] },
  { id: "red", label: "Red", absorption: [0, 0.6, 0.45] },
  { id: "purple", label: "Purple", absorption: [0.12, 0.45, 0] },
  { id: "blue", label: "Blue", absorption: [0.45, 0.15, 0] },
  { id: "green", label: "Green", absorption: [0.35, 0, 0.3] },
  { id: "brown", label: "Brown", absorption: [0.08, 0.25, 0.5] },
  { id: "grey", label: "Grey", absorption: [0.22, 0.22, 0.2] },
] as const satisfies readonly { id: string; label: string; absorption: Readonly<Absorption> }[];

export const FANCY_GRADES = [
  { id: "light", label: "Fancy Light", short: "Light", density: 0.45, tone: 0 },
  { id: "fancy", label: "Fancy", short: "Fancy", density: 1, tone: 0 },
  { id: "intense", label: "Fancy Intense", short: "Intense", density: 1.4, tone: 0 },
  { id: "vivid", label: "Fancy Vivid", short: "Vivid", density: 1.9, tone: 0 },
  { id: "deep", label: "Fancy Deep", short: "Deep", density: 1.6, tone: 0.28 },
] as const;

export type FancyHueId = (typeof FANCY_HUES)[number]["id"];
export type FancyGradeId = (typeof FANCY_GRADES)[number]["id"];
export type FancyDiamondId = `diamond-fancy-${FancyHueId}-${FancyGradeId}`;

const PREFIX = "diamond-fancy-";
/** One distance for every fancy stone; the absorption carries all of the colour. */
const ATTENUATION_DISTANCE = 0.5;
/** Path length (stone radii) a swatch's colour is taken at: roughly a face-up return path. */
const SWATCH_PATH = 2.5;

export function fancyDiamondId(hue: FancyHueId, grade: FancyGradeId): FancyDiamondId {
  return `${PREFIX}${hue}-${grade}`;
}

export function parseFancyDiamondId(id: string | null | undefined): { hue: FancyHueId; grade: FancyGradeId } | null {
  if (!id?.startsWith(PREFIX)) return null;
  for (const hue of FANCY_HUES) {
    for (const grade of FANCY_GRADES) {
      if (id === fancyDiamondId(hue.id, grade.id)) return { hue: hue.id, grade: grade.id };
    }
  }
  return null;
}

/** GIA-style colour name, e.g. "Fancy Intense Pink". */
export function fancyDiamondLabel(hue: FancyHueId, grade: FancyGradeId): string {
  const gradeLabel = FANCY_GRADES.find((g) => g.id === grade)!.label;
  const hueLabel = FANCY_HUES.find((h) => h.id === hue)!.label;
  return `${gradeLabel} ${hueLabel}`;
}

/** Every hue × grade as a gem config on the colourless diamond's optics. */
export function buildFancyDiamondConfigs(diamond: GemConfig): Record<FancyDiamondId, GemConfig> {
  const configs = {} as Record<FancyDiamondId, GemConfig>;
  for (const hue of FANCY_HUES) {
    for (const grade of FANCY_GRADES) {
      const absorption = hue.absorption.map((a) => a * grade.density + grade.tone) as Absorption;
      const [r, g, b] = absorption.map((a) => Math.exp(-a * SWATCH_PATH));
      configs[fancyDiamondId(hue.id, grade.id)] = {
        ...diamond,
        baseColor: linearHex(r!, g!, b!),
        attenuationColor: attenuationForAbsorption(absorption, ATTENUATION_DISTANCE),
        attenuationDistance: ATTENUATION_DISTANCE,
      };
    }
  }
  return configs;
}
