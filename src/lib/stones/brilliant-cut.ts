import * as THREE from "three";

/**
 * Faceted brilliant-cut generator.
 *
 * A round brilliant is 57 facets (58 with a culet) in a fixed arrangement, and its
 * brilliance comes from that arrangement bouncing light back at the viewer. A
 * `LatheGeometry` — a surface of revolution — cannot produce it: every cross-section of
 * a revolve is identical, so you get a spinning top with no kite/star pattern and no
 * facet-to-facet contrast. This builds the real topology instead.
 *
 * Facet budget (round brilliant):
 *   crown    1 table + 8 kites + 8 stars + 16 upper-girdle = 33
 *   girdle   16 band segments
 *   pavilion 8 mains + 16 lower-girdle + 1 culet          = 25
 *
 * The girdle outline is a function of angle, so other silhouettes are possible by
 * reshaping the outline rather than by revolving a profile — only the round outline is
 * used today; the CAD-derived cuts in `load-cut-geometry.ts` cover the rest.
 */

const MAINS = 8;
const STEPS = MAINS * 2; // 16 girdle positions
const TWO_PI = Math.PI * 2;

export type BrilliantProportions = {
  /** Table diameter as a fraction of girdle diameter (Tolkowsky ideal ≈ 0.53). */
  table: number;
  /** Crown angle in degrees (ideal ≈ 34.5). */
  crownAngle: number;
  /** Pavilion angle in degrees (ideal ≈ 40.75). */
  pavilionAngle: number;
  /** Girdle thickness as a fraction of girdle diameter. */
  girdle: number;
  /** Star facet length, 0..1 across the table-edge → girdle span (ideal ≈ 0.5). */
  starLength: number;
  /** Star facet angle in degrees — shallower than the crown, which separates the planes. */
  starAngle: number;
  /** Lower-girdle length, 0..1 from girdle toward culet (ideal ≈ 0.77). */
  lowerGirdleLength: number;
  /** Culet radius as a fraction of girdle radius; 0 gives a true point. */
  culet: number;
};

export const IDEAL_ROUND_BRILLIANT: BrilliantProportions = {
  table: 0.53,
  crownAngle: 34.5,
  pavilionAngle: 40.75,
  girdle: 0.03,
  starLength: 0.5,
  starAngle: 22,
  lowerGirdleLength: 0.77,
  culet: 0.0,
};

/** Girdle radius at an angle, normalised so the widest half-width is 0.5. */
export type Outline = (theta: number) => number;

export const ROUND_OUTLINE: Outline = () => 0.5;

type V3 = [number, number, number];

function at(theta: number, radius: number, y: number): V3 {
  return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
}

export function buildBrilliantCut(
  outline: Outline = ROUND_OUTLINE,
  p: BrilliantProportions = IDEAL_ROUND_BRILLIANT,
): THREE.BufferGeometry {
  const crownSlope = Math.tan((p.crownAngle * Math.PI) / 180);
  const starSlope = Math.tan((p.starAngle * Math.PI) / 180);
  const pavSlope = Math.tan((p.pavilionAngle * Math.PI) / 180);

  const theta = (k: number) => (k / STEPS) * TWO_PI;
  const girdleR = (k: number) => outline(theta(k));

  const gTop = 0;
  const gBot = -p.girdle;

  // Crown: table corners sit on the 8 main directions, star points between them.
  const tableY: number[] = [];
  const tableP: V3[] = [];
  const starP: V3[] = [];
  for (let j = 0; j < MAINS; j++) {
    const k = j * 2;
    const R = girdleR(k);
    const rt = R * p.table;
    const hc = (R - rt) * crownSlope;
    tableY.push(hc);
    tableP.push(at(theta(k), rt, hc));
  }
  // Table is one plane: use the mean height so the octagon stays flat.
  const tableHeight = tableY.reduce((a, b) => a + b, 0) / tableY.length;
  for (let j = 0; j < MAINS; j++) {
    tableP[j]![1] = tableHeight;
  }
  for (let j = 0; j < MAINS; j++) {
    const k = j * 2 + 1;
    const R = girdleR(k);
    const rtNeighbour = (girdleR(j * 2) * p.table + girdleR((j * 2 + 2) % STEPS) * p.table) / 2;
    const rs = rtNeighbour + p.starLength * (R - rtNeighbour);
    // Star facets are shallower than the kites; that angle difference is what makes the
    // star and kite read as separate planes instead of one smooth cone.
    const hs = tableHeight - (rs - rtNeighbour) * starSlope;
    starP.push(at(theta(k), rs, hs));
  }

  const girdleTop: V3[] = [];
  const girdleBot: V3[] = [];
  for (let k = 0; k < STEPS; k++) {
    girdleTop.push(at(theta(k), girdleR(k), gTop));
    girdleBot.push(at(theta(k), girdleR(k), gBot));
  }

  // Pavilion: mains run culet → girdle on the main directions; lower-girdle junctions
  // sit between them, slightly shallower so the halves separate from the mains.
  // Depth keys off the narrow axis so the pavilion angle stays correct there; on an
  // elongated outline the long axis is then naturally shallower, as it is on a real oval.
  const radii = Array.from({ length: STEPS }, (_, k) => girdleR(k));
  const minR = Math.min(...radii);
  const culetY = gBot - minR * pavSlope;
  const culetR = minR * p.culet;

  const lowerJunction: V3[] = [];
  for (let j = 0; j < MAINS; j++) {
    const k = j * 2 + 1;
    const R = girdleR(k);
    const rl = R * (1 - p.lowerGirdleLength);
    const yCone = gBot - (R - rl) * pavSlope;
    lowerJunction.push(at(theta(k), rl, yCone + minR * 0.024));
  }

  const positions: number[] = [];
  const tri = (a: V3, b: V3, c: V3) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const quad = (a: V3, b: V3, c: V3, d: V3) => {
    tri(a, b, c);
    tri(a, c, d);
  };

  // --- Table (octagon fan, wound CCW seen from above) ---
  const tableCentre: V3 = [0, tableHeight, 0];
  for (let j = 0; j < MAINS; j++) {
    tri(tableCentre, tableP[j]!, tableP[(j + 1) % MAINS]!);
  }

  // --- Crown ---
  for (let j = 0; j < MAINS; j++) {
    const k = j * 2;
    const T = tableP[j]!;
    const Sprev = starP[(j + MAINS - 1) % MAINS]!;
    const Snext = starP[j]!;
    // Kite / bezel: table corner → star → girdle main → star
    quad(T, Snext, girdleTop[k]!, Sprev);
    // Star: two table corners + the star point between them
    tri(T, tableP[(j + 1) % MAINS]!, Snext);
    // Upper girdle halves
    tri(Snext, girdleTop[(k + 1) % STEPS]!, girdleTop[k]!);
    tri(Snext, girdleTop[(k + 2) % STEPS]!, girdleTop[(k + 1) % STEPS]!);
  }

  // --- Girdle band ---
  for (let k = 0; k < STEPS; k++) {
    const n = (k + 1) % STEPS;
    quad(girdleTop[k]!, girdleTop[n]!, girdleBot[n]!, girdleBot[k]!);
  }

  // --- Pavilion ---
  if (culetR > 0) {
    const culetRing: V3[] = [];
    for (let j = 0; j < MAINS; j++) culetRing.push(at(theta(j * 2), culetR, culetY));
    for (let j = 0; j < MAINS; j++) {
      tri([0, culetY, 0], culetRing[(j + 1) % MAINS]!, culetRing[j]!);
    }
    for (let j = 0; j < MAINS; j++) {
      const k = j * 2;
      quad(
        culetRing[j]!,
        lowerJunction[(j + MAINS - 1) % MAINS]!,
        girdleBot[k]!,
        lowerJunction[j]!,
      );
    }
  } else {
    const culet: V3 = [0, culetY, 0];
    for (let j = 0; j < MAINS; j++) {
      const k = j * 2;
      quad(culet, lowerJunction[(j + MAINS - 1) % MAINS]!, girdleBot[k]!, lowerJunction[j]!);
    }
  }
  for (let j = 0; j < MAINS; j++) {
    const k = j * 2;
    const L = lowerJunction[j]!;
    tri(L, girdleBot[k]!, girdleBot[(k + 1) % STEPS]!);
    tri(L, girdleBot[(k + 1) % STEPS]!, girdleBot[(k + 2) % STEPS]!);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  // Scene convention across the stone pages is girdle radius 1.0; outlines are authored
  // at 0.5 so the proportion table reads as fractions of girdle *diameter*.
  g.scale(2, 2, 2);
  g.computeBoundingBox();
  g.center();
  g.computeVertexNormals(); // non-indexed → one normal per facet triangle
  g.computeBoundingSphere();
  return g;
}
