/**
 * The shape of the home film's galaxy, shared by its points and its strings: a grand-design
 * spiral — two major arms opposite each other and fainter spurs between them — wound as
 * logarithmic spirals, which is how real spiral arms open out from the core.
 */

export type GalaxyArm = { phase: number; weight: number };

export const GALAXY_ARMS: readonly GalaxyArm[] = [
  { phase: 0, weight: 3 },
  { phase: Math.PI, weight: 3 },
  { phase: 0.95, weight: 1 },
  { phase: 2.15, weight: 1 },
  { phase: 4.1, weight: 1 },
  { phase: 5.3, weight: 1 },
  { phase: 5.85, weight: 0.6 },
];

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
