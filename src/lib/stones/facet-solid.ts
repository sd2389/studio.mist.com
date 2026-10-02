import * as THREE from "three";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";

/**
 * Faceted gem solid from facet planes (half-space intersection).
 *
 * A cut stone is designed the way a cutter designs it: every facet is a plane (angle +
 * azimuth + depth) and the stone is whatever survives all of them. Intersecting the
 * half-spaces gives exactly planar facets and a convex, closed solid by construction —
 * which is what the ray-traced gem shader needs, since it re-derives the facet planes
 * from the triangles.
 *
 * The intersection is computed through duality: plane `n·x = d` (d > 0, origin inside)
 * maps to the point `n / d`; the convex hull of those points has one face per stone
 * vertex and one vertex per surviving facet.
 */

export type FacetPlane = {
  /** Outward unit normal. */
  normal: THREE.Vector3;
  /** Plane offset: points inside satisfy `normal · p <= offset`. Must be > 0. */
  offset: number;
};

/** Plane through `point` with the given outward normal (normalised here). */
export function planeThrough(normal: THREE.Vector3, point: THREE.Vector3): FacetPlane {
  const n = normal.clone().normalize();
  return { normal: n, offset: n.dot(point) };
}

/** Plane through three points, oriented so the origin is on the inner side. */
export function planeFromPoints(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): FacetPlane {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  let offset = n.dot(a);
  if (offset < 0) {
    n.negate();
    offset = -offset;
  }
  return { normal: n, offset };
}

type HullEdge = {
  head(): { point: THREE.Vector3 };
  next: HullEdge;
  twin: HullEdge;
  face: HullFace;
};
type HullFace = { normal: THREE.Vector3; constant: number; edge: HullEdge };

function dualVertex(face: HullFace): THREE.Vector3 {
  return face.normal.clone().divideScalar(face.constant);
}

/** Faces around one hull vertex, in rotational order. */
function facesAround(start: HullEdge): HullFace[] {
  const faces: HullFace[] = [];
  let edge = start;
  for (let guard = 0; guard < 512; guard++) {
    faces.push(edge.face);
    edge = edge.next.twin;
    if (edge === start) break;
  }
  return faces;
}

class VertexWelder {
  private readonly keys = new Map<string, THREE.Vector3>();
  constructor(private readonly tolerance: number) {}

  weld(p: THREE.Vector3): THREE.Vector3 {
    const inv = 1 / this.tolerance;
    const kx = Math.round(p.x * inv), ky = Math.round(p.y * inv), kz = Math.round(p.z * inv);
    // Probe the neighbouring cells so points straddling a cell boundary still weld.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const hit = this.keys.get(`${kx + dx},${ky + dy},${kz + dz}`);
          if (hit && hit.distanceTo(p) <= this.tolerance) return hit;
        }
      }
    }
    this.keys.set(`${kx},${ky},${kz}`, p);
    return p;
  }
}

function dedupeRing(points: THREE.Vector3[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of points) {
    if (out.length === 0 || out[out.length - 1] !== p) out.push(p);
  }
  while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return out;
}

function newellNormal(points: THREE.Vector3[]): THREE.Vector3 {
  const n = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n;
}

type Facet = { normal: THREE.Vector3; ring: THREE.Vector3[] };

function collectFacets(planes: FacetPlane[], scale: number): Facet[] {
  const duals = planes.map((p) => p.normal.clone().divideScalar(p.offset));
  const hull = new ConvexHull().setFromPoints(duals);
  const welder = new VertexWelder(scale * 1e-6);
  const startEdgeByPoint = new Map<THREE.Vector3, HullEdge>();
  for (const face of hull.faces as unknown as HullFace[]) {
    let edge = face.edge;
    do {
      const head = edge.head().point;
      if (!startEdgeByPoint.has(head)) startEdgeByPoint.set(head, edge);
      edge = edge.next;
    } while (edge !== face.edge);
  }

  const facets: Facet[] = [];
  for (let i = 0; i < duals.length; i++) {
    const start = startEdgeByPoint.get(duals[i]!);
    if (!start) continue; // redundant plane: it never touches the solid
    const ring = dedupeRing(facesAround(start).map((f) => welder.weld(dualVertex(f))));
    if (ring.length < 3) continue;
    const normal = planes[i]!.normal;
    if (newellNormal(ring).dot(normal) < 0) ring.reverse();
    facets.push({ normal, ring });
  }
  return facets;
}

function facetsToGeometry(facets: Facet[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const { normal, ring } of facets) {
    const a = ring[0]!;
    for (let k = 1; k + 1 < ring.length; k++) {
      const b = ring[k]!;
      const c = ring[k + 1]!;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let r = 0; r < 3; r++) normals.push(normal.x, normal.y, normal.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

/** Hull of a point set as flat-shaded triangles — the safety net when duality degenerates. */
export function convexHullGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const hull = new ConvexHull().setFromPoints(points);
  const facets: Facet[] = (hull.faces as unknown as HullFace[]).map((face) => {
    const ring: THREE.Vector3[] = [];
    let edge = face.edge;
    do {
      ring.push(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
    return { normal: face.normal.clone(), ring };
  });
  return facetsToGeometry(facets);
}

function countOpenEdges(g: THREE.BufferGeometry): number {
  const p = g.getAttribute("position");
  const key = (i: number) => `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
  const counts = new Map<string, number>();
  for (let i = 0; i < p.count; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = key(i + e);
      const b = key(i + ((e + 1) % 3));
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(edge, (counts.get(edge) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const n of counts.values()) if (n !== 2) open++;
  return open;
}

function dedupePlanes(planes: FacetPlane[]): FacetPlane[] {
  const out: FacetPlane[] = [];
  for (const plane of planes) {
    const duplicate = out.some(
      (q) => q.normal.dot(plane.normal) > 1 - 1e-10 && Math.abs(q.offset - plane.offset) < 1e-9 * (1 + q.offset),
    );
    if (!duplicate) out.push(plane);
  }
  return out;
}

/** Largest amount any recovered vertex sits outside any plane (0 for a correct solid). */
function worstViolation(planes: FacetPlane[], points: THREE.Vector3[]): number {
  let worst = 0;
  for (const p of points) {
    for (const plane of planes) worst = Math.max(worst, plane.normal.dot(p) - plane.offset);
  }
  return worst;
}

/**
 * Brute-force vertex enumeration: every triple of planes, kept when inside all others.
 * O(n⁴) but only reached when the dual hull degenerates (several facets sharing a line).
 */
function enumerateVertices(planes: FacetPlane[], tolerance: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const bc = new THREE.Vector3();
  const ca = new THREE.Vector3();
  const ab = new THREE.Vector3();
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const a = planes[i]!, b = planes[j]!, c = planes[k]!;
        bc.crossVectors(b.normal, c.normal);
        const det = a.normal.dot(bc);
        if (Math.abs(det) < 1e-9) continue;
        ca.crossVectors(c.normal, a.normal);
        ab.crossVectors(a.normal, b.normal);
        const v = bc.clone().multiplyScalar(a.offset).addScaledVector(ca, b.offset).addScaledVector(ab, c.offset).divideScalar(det);
        if (planes.every((q) => q.normal.dot(v) - q.offset <= tolerance)) out.push(v);
      }
    }
  }
  return out;
}

/**
 * Intersect the half-spaces into a closed, convex, flat-shaded (non-indexed) solid.
 * `scale` is the stone's rough size, used for weld tolerances.
 */
export function buildFacetSolid(input: FacetPlane[], scale: number): THREE.BufferGeometry {
  const planes = dedupePlanes(input);
  const tolerance = scale * 1e-6;
  const facets = collectFacets(planes, scale);
  const points = facets.flatMap((f) => f.ring);
  if (points.length > 0 && worstViolation(planes, points) <= tolerance * 10) {
    const geometry = facetsToGeometry(facets);
    if (countOpenEdges(geometry) === 0) return geometry;
    // A sliver left unstitched: the hull of the recovered vertices is the same solid.
    geometry.dispose();
    return convexHullGeometry(points);
  }
  // Degenerate dual (facets sharing one line): enumerate the true vertices instead.
  return convexHullGeometry(enumerateVertices(planes, tolerance * 10));
}
