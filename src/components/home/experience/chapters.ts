import { clamp01, lerp, smoothstep, type FilmChapter } from "@/components/scroll-film/story";

/**
 * The home film: a ring that builds itself. A swarm of points settles onto the CAD
 * surface, the mesh draws in, metal tiles climb the band and close the claws, the stone
 * takes its fire from table to culet, and the finished ring re-forms in other metals.
 */
export const CHAPTERS = [
  { id: "swarm", vh: 190, title: "Assembly" },
  { id: "points", vh: 260, title: "Points" },
  { id: "mesh", vh: 260, title: "Mesh" },
  { id: "metal", vh: 440, title: "Metal" },
  { id: "claws", vh: 260, title: "Claws" },
  { id: "spark", vh: 340, title: "Spark" },
  { id: "reform", vh: 380, title: "Re-form" },
  { id: "start", vh: 140, title: "Begin" },
] as const satisfies readonly FilmChapter[];

export type ChapterId = (typeof CHAPTERS)[number]["id"];
export const chapterIndex = (id: ChapterId) => CHAPTERS.findIndex((c) => c.id === id);
export const chapter = (id: ChapterId): FilmChapter => CHAPTERS[chapterIndex(id)]!;

export const I = {
  swarm: chapterIndex("swarm"),
  points: chapterIndex("points"),
  mesh: chapterIndex("mesh"),
  metal: chapterIndex("metal"),
  claws: chapterIndex("claws"),
  spark: chapterIndex("spark"),
  reform: chapterIndex("reform"),
  start: chapterIndex("start"),
};

/** The ring the film builds: the solitaire preset, in yellow gold, on a cathedral shank. */
export const RING_DESIGN = { cathedral: true, metal: "gold-18k-yellow", carat: 1.5 } as const;

/** The band takes the climb up to here; the head and claws take the rest. */
export const BAND_END = 0.72;

export const REFORM_METALS = [
  { id: "gold-18k-yellow", name: "18K yellow gold" },
  { id: "gold-18k-rose", name: "18K rose gold" },
  { id: "platinum", name: "Platinum 950" },
] as const;

/** The stone's anatomy, as fractions of its depth from the table down. */
export const STONE_ZONES = [
  { name: "Table", until: 0.04 },
  { name: "Crown", until: 0.25 },
  { name: "Girdle", until: 0.3 },
  { name: "Pavilion", until: 0.96 },
  { name: "Culet", until: Infinity },
] as const;

export const SWARM_POINTS = 36000;

/**
 * Facts about the piece on screen, measured from the CAD build when the stage creates it
 * (the HUD shows a dash until then). Plain data, so the page never loads three.js for them.
 */
export const FACTS = {
  triangles: 0,
  grams: {} as Partial<Record<(typeof REFORM_METALS)[number]["id"], number>>,
  carat: 0,
  stoneMm: 0,
  usSize: 0,
  innerDiameterMm: 0,
  bandWidthMm: 0,
  bandThicknessMm: 0,
  settingHeightMm: 0,
};

/*
 * The build's state for a chapter and its progress. Both the stage and the HUD read these,
 * so a counter and the thing it counts always agree.
 */

/** 0 = free swarm, 1 = every point on the surface. */
export function gatherAt(i: number, p: number): number {
  if (i < I.points) return 0;
  return i === I.points ? smoothstep(0.04, 0.9, p) : 1;
}

/**
 * The swarm lands base to top, in order of height: landings are spread over this much of
 * `gather`, and each point's flight in takes `LANDING_FLIGHT` of it.
 */
export const LANDING_SPREAD = 0.65;
export const LANDING_FLIGHT = 0.35;

/** Share of the swarm that has landed. */
export const landedAt = (i: number, p: number) => clamp01((gatherAt(i, p) - LANDING_FLIGHT) / LANDING_SPREAD);

/** The wireframe scan, 0..1 (a little past 1 so the far edge finishes drawing). */
export function wireAt(i: number, p: number): number {
  if (i < I.mesh) return 0;
  return i === I.mesh ? smoothstep(0.06, 0.82, p) * 1.1 : 1.1;
}

/**
 * The metal front: the band through "metal", the head and claws through "claws". Once the
 * claw tips land (about 1.02) the front runs on, so the last tiles' glowing seams cool to
 * nothing before the stone's chapter: the finished metal carries no tile outlines.
 */
export function climbAt(i: number, p: number): number {
  if (i < I.metal) return -0.08;
  if (i === I.metal) return lerp(-0.03, BAND_END, smoothstep(0.05, 0.95, p));
  if (i === I.claws) return p < 0.86 ? lerp(BAND_END, 1.06, smoothstep(0.05, 0.86, p)) : lerp(1.06, 1.3, smoothstep(0.86, 1, p));
  return 3;
}

/** How far the spark has travelled down the stone, 0 (table) to 1 (culet). */
export function sweepAt(i: number, p: number): number {
  if (i < I.spark) return -0.12;
  return i === I.spark ? lerp(-0.08, 1.08, smoothstep(0.1, 0.76, p)) : 1.12;
}

/**
 * The stone sits in its claws while the ring builds; for its spark it lifts clear of them
 * (1), so the whole pavilion is seen catching fire, then drops back in to be set (0).
 */
export function hoverAt(i: number, p: number): number {
  if (i !== I.spark) return 0;
  const fall = smoothstep(0.8, 0.94, p);
  return smoothstep(0.02, 0.16, p) * (1 - fall * fall);
}

/** The re-forming metal: which pair of `REFORM_METALS` it runs between, and its front. */
export function reformAt(i: number, p: number): { from: number; front: number } {
  if (i < I.reform) return { from: 0, front: -0.1 };
  if (i > I.reform) return { from: 1, front: 1.1 };
  return p < 0.5
    ? { from: 0, front: lerp(-0.05, 1.08, smoothstep(0.12, 0.45, p)) }
    : { from: 1, front: lerp(-0.05, 1.08, smoothstep(0.55, 0.88, p)) };
}

/** How strongly the hologram shows: the swarm, the wireframe and the workspace grid. */
export function hologramAt(i: number, p: number): { points: number; wire: number; grid: number } {
  const points =
    i <= I.points ? 1 : i === I.mesh ? 1 - 0.55 * smoothstep(0.1, 0.9, p) : i <= I.claws ? 0.45 : i === I.spark ? 0.45 * (1 - smoothstep(0, 0.3, p)) : 0;
  const wire = i < I.mesh ? 0 : i <= I.spark ? 1 : i === I.reform ? 1 - smoothstep(0, 0.15, p) : 0;
  const grid = i === I.points ? smoothstep(0.5, 1, p) : i < I.mesh ? 0 : i <= I.spark ? 1 : i === I.reform ? 1 - smoothstep(0, 0.2, p) : 0;
  return { points, wire, grid };
}
