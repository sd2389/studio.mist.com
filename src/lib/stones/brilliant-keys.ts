import {
  arcBetween,
  outlinePerimeter,
  sampleFromVertex,
  sampleOutlineEvenly,
  vertexNormal,
  type GirdleOutline,
  type OutlineSample,
} from "@/lib/stones/outlines";

/**
 * The girdle positions a brilliant's facets hang from: `2 × mains` keys, alternating
 * main (even index) and star (odd index), counter-clockwise.
 */

export type KeyPlacement = {
  /** Mains on every true corner, the rest spread along the sides. */
  cornerKeys: boolean;
};

/** Split `count` items across segments in proportion to their length (largest remainder). */
function apportion(lengths: number[], count: number): number[] {
  const total = lengths.reduce((s, l) => s + l, 0);
  const exact = lengths.map((l) => (l / total) * count);
  const out = exact.map(Math.floor);
  const order = exact.map((e, i) => ({ i, rest: e - Math.floor(e) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  const remainder = count - out.reduce((s, n) => s + n, 0);
  for (let k = 0; k < remainder; k++) out[order[k]!.i]!++;
  return out;
}

/**
 * Mains on the corners, so no kite straddles a sharp point and no main lands on a corner
 * by accident; the remaining mains split each side evenly by arc length; each star sits
 * halfway (by arc length) between its two mains.
 */
function cornerAnchoredKeys(outline: GirdleOutline, mains: number): OutlineSample[] {
  const corners = [...outline.corners].sort((a, b) => a - b);
  const start = corners[0]!;
  const sides = corners.map((c, i) => arcBetween(outline, c, corners[(i + 1) % corners.length]!));
  const extra = apportion(sides, mains - corners.length);
  // Every main as its arc position from the first corner, plus the corner it sits on.
  const placed: Array<{ pos: number; corner?: number }> = [];
  let s = 0;
  sides.forEach((len, i) => {
    placed.push({ pos: s, corner: corners[i] });
    for (let m = 1; m <= extra[i]!; m++) placed.push({ pos: s + (len * m) / (extra[i]! + 1) });
    s += len;
  });
  const perimeter = outlinePerimeter(outline);
  const keys: OutlineSample[] = [];
  placed.forEach(({ pos, corner }, j) => {
    const next = j + 1 < placed.length ? placed[j + 1]!.pos : perimeter;
    const main =
      corner === undefined ? sampleFromVertex(outline, start, pos) : { point: outline.points[corner]!, normal: vertexNormal(outline, corner) };
    keys.push(main, sampleFromVertex(outline, start, (pos + next) / 2));
  });
  return keys;
}

export function brilliantKeys(outline: GirdleOutline, mains: number, placement: KeyPlacement): OutlineSample[] {
  if (placement.cornerKeys && outline.corners.length > 0 && outline.corners.length <= mains) {
    return cornerAnchoredKeys(outline, mains);
  }
  return sampleOutlineEvenly(outline, mains * 2);
}
