/**
 * The shape of the home film's galaxy, shared by its points and its strings: a many-armed
 * spiral — two major arms opposite each other, two secondary arms between them and fainter
 * spurs — wound as logarithmic spirals, which is how real spiral arms open out from the core,
 * with the inner and outer rings that many real spirals carry.
 */

export type GalaxyArm = { phase: number; weight: number };

export const GALAXY_ARMS: readonly GalaxyArm[] = [
  { phase: 0, weight: 3 },
  { phase: Math.PI, weight: 3 },
  { phase: Math.PI / 2, weight: 2 },
  { phase: (3 * Math.PI) / 2, weight: 2 },
  { phase: 0.75, weight: 1 },
  { phase: 2.35, weight: 1 },
  { phase: 3.9, weight: 1 },
  { phase: 5.5, weight: 1 },
  { phase: 1.2, weight: 0.6 },
  { phase: 4.3, weight: 0.6 },
];

/** Resonance rings (mm): a tight inner ring round the bulge and a wide outer one past the arms. */
export const GALAXY_RINGS = [
  { radius: 15, width: 1.4 },
  { radius: 98, width: 3.2 },
] as const;

/** Where the arms begin (mm) and how steeply they open: 22°, inside the range spirals show. */
const ARM_ROOT = 4;
const PITCH = (22 * Math.PI) / 180;

/** The angle of an arm at radius r (mm). */
export function armAngle(arm: GalaxyArm, r: number): number {
  return arm.phase + Math.log(Math.max(r, ARM_ROOT) / ARM_ROOT) / Math.tan(PITCH);
}

/** An arm, picked in proportion to its weight. */
export function pickArm(random: () => number): GalaxyArm {
  const total = GALAXY_ARMS.reduce((sum, arm) => sum + arm.weight, 0);
  let pick = random() * total;
  for (const arm of GALAXY_ARMS) {
    pick -= arm.weight;
    if (pick <= 0) return arm;
  }
  return GALAXY_ARMS[0]!;
}

/** What a point of the galaxy is, which sets its colour: see `createSwarm`. */
export const STAR_KIND = { arm: 0, bulge: 1, disc: 2, knot: 3 } as const;
