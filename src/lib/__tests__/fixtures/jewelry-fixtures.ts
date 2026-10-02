import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Synthetic jewelry for segmentation tests: a torus band, a faceted round centre stone,
 * octahedron accent stones, cylinder prongs and sphere beads — all in millimetres.
 */

/** Position-only triangle soup with per-face normals, the way STL stores a mesh. */
export function toTriangleSoup(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const soup = new THREE.BufferGeometry();
  soup.setAttribute("position", source.getAttribute("position").clone());
  soup.computeVertexNormals();
  return soup;
}

/** Round "single cut": octagonal table, 8 crown, 8 girdle and 8 pavilion facets, closed. */
export function singleCutStone(diameter: number, segments = 8): THREE.BufferGeometry {
  const radius = diameter / 2;
  const tableRadius = radius * 0.56;
  const crownHeight = diameter * 0.15;
  const girdleHalf = diameter * 0.015;
  const pavilionDepth = diameter * 0.43;
  const ring = (r: number, y: number) =>
    Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    });
  const vertices = [
    ...ring(tableRadius, girdleHalf + crownHeight),
    ...ring(radius, girdleHalf),
    ...ring(radius, -girdleHalf),
    [0, girdleHalf + crownHeight, 0],
    [0, -girdleHalf - pavilionDepth, 0],
  ];
  const tableCenter = segments * 3;
  const culet = tableCenter + 1;
  const index: number[] = [];
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    const [t0, t1, g0, g1, b0, b1] = [i, j, segments + i, segments + j, 2 * segments + i, 2 * segments + j];
    index.push(tableCenter, t1, t0);
    index.push(t0, t1, g1, t0, g1, g0);
    index.push(g0, g1, b1, g0, b1, b0);
    index.push(b0, b1, culet);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

export function octahedronStone(size: number): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(size / 2);
}

export function bandGeometry(radius = 9, tube = 1.1): THREE.BufferGeometry {
  return new THREE.TorusGeometry(radius, tube, 32, 160);
}

export function prongGeometry(radius = 0.35, length = 4): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radius, radius, length, 24);
}

export function beadGeometry(radius = 0.6): THREE.BufferGeometry {
  return new THREE.SphereGeometry(radius, 24, 16);
}

export type PieceKind = "band" | "center" | "accent" | "prong" | "bead";

type Placed = {
  kind: PieceKind;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
};

function place({ geometry, position, rotation = [0, 0, 0] }: Placed): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  return geometry.clone().applyMatrix4(matrix);
}

export type RingFixture = {
  /** Everything merged into one STL-style soup. */
  soup: THREE.BufferGeometry;
  /** Each piece on its own, placed, with its generator's attributes (indexed where it was). */
  pieces: { kind: PieceKind; geometry: THREE.BufferGeometry }[];
  parts: Record<PieceKind, number>;
};

/** Solitaire-with-pavé ring: band, centre stone, prongs, accent stones and beads (mm). */
export function buildRingFixture(accentCount = 8, beadCount = 2): RingFixture {
  const top = 9 + 1.1;
  const pieces: Placed[] = [{ kind: "band", geometry: bandGeometry(), position: [0, 0, 0] }];
  pieces.push({ kind: "center", geometry: singleCutStone(6.5), position: [0, top + 3.2, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    pieces.push({ kind: "prong", geometry: prongGeometry(), position: [Math.cos(a) * 3.5, top + 2.2, Math.sin(a) * 3.5] });
  }
  for (let i = 0; i < accentCount; i++) {
    // Half the accents down each shoulder, clear of the centre stone.
    const side = i % 2 === 0 ? 1 : -1;
    const a = Math.PI / 2 + side * (0.45 + Math.floor(i / 2) * 0.13);
    pieces.push({ kind: "accent", geometry: octahedronStone(1.2), position: [Math.cos(a) * (top + 0.7), Math.sin(a) * (top + 0.7), 0] });
  }
  for (let i = 0; i < beadCount; i++) {
    pieces.push({ kind: "bead", geometry: beadGeometry(), position: [0, -top - 0.8, (i - (beadCount - 1) / 2) * 1.6] });
  }
  const placed = pieces.map((piece) => ({ kind: piece.kind, geometry: place(piece) }));
  return {
    soup: mergeGeometries(placed.map((piece) => toTriangleSoup(piece.geometry))),
    pieces: placed,
    parts: { band: 1, center: 1, accent: accentCount, prong: 4, bead: beadCount },
  };
}
