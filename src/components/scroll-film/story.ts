/**
 * Shared timeline for the scroll films (the home page). The page scrolls natively and the
 * story driver keeps two clocks from it each frame:
 *
 * - `scroll`, the scroll position lightly eased, which the DOM chapters read (`--p`, the
 *   chapter label), so copy is always where the page is;
 * - `y`, the film's playhead, which chases the scroll with a top speed, so a fast scroll
 *   still plays every beat of the 3D instead of skipping them.
 *
 * Only one film is mounted at a time.
 */

/** A film chapter: its scroll length and the title the chapter readout shows. */
export type FilmChapter = { readonly id: string; readonly vh: number; readonly title: string };

/** Index into a sequence for a 0..1 progress, plus how far into that step it is. */
export function step(progress: number, count: number): { index: number; local: number } {
  const scaled = Math.min(Math.max(progress, 0), 0.99999) * count;
  const index = Math.floor(scaled);
  return { index, local: scaled - index };
}

export const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Live scroll state, written once per frame by the driver. */
export const story = {
  /** The scroll position the DOM follows, px (eased a little). */
  scroll: 0,
  /** The film's playhead, px of scroll. */
  y: 0,
  /** Viewport size, px. */
  vh: 1,
  vw: 1,
  /** The playhead's speed, viewports per second (signed, smoothed). */
  velocity: 0,
  /** Chapter tops and heights, px. */
  sections: [] as { top: number; height: number }[],
  /** Pointer, -1..1, smoothed. */
  pointer: { x: 0, y: 0 },
  /** A mouse or pen button is held down. */
  pressed: false,
  /** Counts releases (and taps on touch), so the stage can answer each one. */
  releases: 0,
  /** The stage has rendered real frames (shaders compiled). */
  ready: false,
};

/** 0..1 through a chapter's pinned stretch (its height minus one viewport), on the DOM clock. */
export function chapterProgress(index: number): number {
  const section = story.sections[index];
  if (!section) return 0;
  return clamp01((story.scroll - section.top) / Math.max(section.height - story.vh, 1));
}

/** The chapter filling the screen right now, on the DOM clock. */
export function currentChapter(): { index: number; progress: number } {
  const mid = story.scroll + story.vh * 0.5;
  let index = 0;
  story.sections.forEach((s, i) => {
    if (mid >= s.top) index = i;
  });
  return { index, progress: chapterProgress(index) };
}

/**
 * The film's clock: chapter index + progress, continuous across chapter seams. A chapter
 * owns the scroll from the moment its section crosses mid-screen until the next one does,
 * so the stage never holds still between chapters.
 */
export function filmTime(): number {
  const sections = story.sections;
  const last = sections.length - 1;
  if (last < 0) return 0;
  const half = story.vh / 2;
  const startOf = (i: number) => (i === 0 ? 0 : sections[i]!.top - half);
  let index = 0;
  for (let i = last; i > 0; i--) {
    if (story.y >= startOf(i)) {
      index = i;
      break;
    }
  }
  const end = index === last ? sections[last]!.top + sections[last]!.height - story.vh : startOf(index + 1);
  return index + clamp01((story.y - startOf(index)) / Math.max(end - startOf(index), 1));
}

/** The film's clock as a chapter and how far through it the film is (0..1). */
export function filmMoment(): { index: number; progress: number } {
  const t = filmTime();
  const index = Math.min(Math.floor(t), Math.max(story.sections.length - 1, 0));
  return { index, progress: t - index };
}

/** How far the film is through one chapter: 0 before it, 1 after it. */
export const filmChapterProgress = (index: number) => clamp01(filmTime() - index);

/** 0..1 through the whole film. */
export function filmProgress(): number {
  const last = story.sections[story.sections.length - 1];
  if (!last) return 0;
  return clamp01(story.y / Math.max(last.top + last.height - story.vh, 1));
}
