import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Geometry for the home film's assembly: the CAD ring's own triangles, re-cut so each one can
 * land on its own (tiles), its quad wireframe, and point samples of its surface. Every
 * piece carries a "climb" time — when the metal front reaches it — so points, wires and
 * tiles all hand over at the same moment.
 */

/** When the metal front reaches a point (0 at the start of the climb, 1 at its end). */
export type Climb = (p: THREE.Vector3) => number;

/** Deterministic 0..1 random (mulberry32), so every visit builds the same swarm. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Non-indexed copy where every triangle is a tile: its centroid, face normal, barycentric
 * corners (for glowing seams), and `aTile` = (landing time, seed).
 */
export function tileGeometry(geometry: THREE.BufferGeometry, climb: Climb, jitter: number, random: () => number): THREE.BufferGeometry {
  const tiles = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = tiles.getAttribute("position") as THREE.BufferAttribute;
  const count = position.count;
  const centroid = new Float32Array(count * 3);
  const faceNormal = new Float32Array(count * 3);
  const bary = new Float32Array(count * 3);
  const tile = new Float32Array(count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const mid = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    mid.copy(a).add(b).add(c).divideScalar(3);
    b.sub(a).cross(c.sub(a)).normalize();
    const seed = random();
    const landing = climb(mid) + (seed - 0.5) * jitter;
    for (let k = 0; k < 3; k++) {
      const v = i + k;
      mid.toArray(centroid, v * 3);
      b.toArray(faceNormal, v * 3);
      bary[v * 3 + k] = 1;
      tile[v * 2] = landing;
      tile[v * 2 + 1] = seed;
    }
  }
  tiles.setAttribute("aCentroid", new THREE.BufferAttribute(centroid, 3));
  tiles.setAttribute("aFaceNormal", new THREE.BufferAttribute(faceNormal, 3));
  tiles.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));
  tiles.setAttribute("aTile", new THREE.BufferAttribute(tile, 2));
  return tiles;
}

/**
 * The surface's quad wireframe — every edge except the diagonal that splits each quad —
 * lifted `lift` along the normal so it reads over the finished metal. Each vertex carries
 * its climb time (`aClimb`) and its place along the draw-in scan (`aScan`).
 */
export function wireGeometry(geometry: THREE.BufferGeometry, climb: Climb, scan: Climb, lift: number): THREE.BufferGeometry {
  const bare = new THREE.BufferGeometry();
  bare.setAttribute("position", geometry.getAttribute("position"));
  if (geometry.index) bare.setIndex(geometry.index);
  const merged = mergeVertices(bare, 1e-4);
  merged.computeVertexNormals();
  const position = merged.getAttribute("position") as THREE.BufferAttribute;
  const normal = merged.getAttribute("normal") as THREE.BufferAttribute;
  const index = merged.index!.array;
  const vertexCount = position.count;

  // An edge shared by two triangles that is the longest side of both is a quad diagonal.
  const edges = new Map<number, { a: number; b: number; shared: number; longest: number }>();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < index.length; t += 3) {
    const ids = [index[t]!, index[t + 1]!, index[t + 2]!];
    ids.forEach((id, k) => p[k]!.fromBufferAttribute(position, id));
    const lengths = [p[0]!.distanceToSquared(p[1]!), p[1]!.distanceToSquared(p[2]!), p[2]!.distanceToSquared(p[0]!)];
    const longest = lengths.indexOf(Math.max(...lengths));
    for (let k = 0; k < 3; k++) {
      const a = ids[k]!;
      const b = ids[(k + 1) % 3]!;
      const key = Math.min(a, b) * vertexCount + Math.max(a, b);
      const edge = edges.get(key) ?? { a, b, shared: 0, longest: 0 };
      edge.shared += 1;
      if (k === longest) edge.longest += 1;
      edges.set(key, edge);
    }
  }

  const kept = [...edges.values()].filter((e) => !(e.shared === 2 && e.longest === 2));
  const out = new Float32Array(kept.length * 6);
  const climbs = new Float32Array(kept.length * 2);
  const scans = new Float32Array(kept.length * 2);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  kept.forEach((edge, i) => {
    [edge.a, edge.b].forEach((id, k) => {
      v.fromBufferAttribute(position, id);
      climbs[i * 2 + k] = climb(v);
      scans[i * 2 + k] = scan(v);
      n.fromBufferAttribute(normal, id);
      v.addScaledVector(n, lift).toArray(out, (i * 2 + k) * 3);
    });
  });
  const wire = new THREE.BufferGeometry();
  wire.setAttribute("position", new THREE.BufferAttribute(out, 3));
  wire.setAttribute("aClimb", new THREE.BufferAttribute(climbs, 1));
  wire.setAttribute("aScan", new THREE.BufferAttribute(scans, 1));
  bare.dispose();
  merged.dispose();
  return wire;
}

/** A stone's facet outlines, scaled a hair outward so they never fight its surface. */
export function facetGeometry(geometry: THREE.BufferGeometry, scan: Climb, centre: THREE.Vector3): THREE.BufferGeometry {
  const edges = new THREE.EdgesGeometry(geometry, 1);
  const position = edges.getAttribute("position") as THREE.BufferAttribute;
  const scans = new Float32Array(position.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    scans[i] = scan(v);
    v.sub(centre).multiplyScalar(1.006).add(centre);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  edges.setAttribute("aScan", new THREE.BufferAttribute(scans, 1));
  return edges;
}

export type SurfacePart = { geometry: THREE.BufferGeometry; climb: Climb; share: number };

/** `total` points spread over the parts by area: positions and each point's climb time. */
export function surfaceSamples(parts: SurfacePart[], total: number, random: () => number): { target: Float32Array; climb: Float32Array } {
  const target = new Float32Array(total * 3);
  const climb = new Float32Array(total);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const point = new THREE.Vector3();
  let written = 0;
  parts.forEach((part, partIndex) => {
    const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const position = flat.getAttribute("position") as THREE.BufferAttribute;
    const triangles = position.count / 3;
    const cumulative = new Float32Array(triangles);
    let area = 0;
    for (let t = 0; t < triangles; t++) {
      a.fromBufferAttribute(position, t * 3);
      b.fromBufferAttribute(position, t * 3 + 1);
      c.fromBufferAttribute(position, t * 3 + 2);
      area += b.sub(a).cross(c.sub(a)).length() / 2;
      cumulative[t] = area;
    }
    const isLast = partIndex === parts.length - 1;
    const count = isLast ? total - written : Math.round(total * part.share);
    for (let i = 0; i < count; i++) {
      const pick = random() * area;
      let lo = 0;
      let hi = triangles - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (cumulative[m]! < pick) lo = m + 1;
        else hi = m;
      }
      a.fromBufferAttribute(position, lo * 3);
      b.fromBufferAttribute(position, lo * 3 + 1);
      c.fromBufferAttribute(position, lo * 3 + 2);
      const r1 = Math.sqrt(random());
      const r2 = random();
      point
        .copy(a)
        .multiplyScalar(1 - r1)
        .addScaledVector(b, r1 * (1 - r2))
        .addScaledVector(c, r1 * r2);
      point.toArray(target, written * 3);
      climb[written] = part.climb(point);
      written += 1;
    }
    if (flat !== part.geometry) flat.dispose();
  });
  return { target, climb };
}

/**
 * The galaxy's strings: `count` threads along its arms, as line-segment pairs. Each
 * vertex carries its orbit (radius, angle, height in ring space, mm) and its place along
 * the thread (`aAlong` = s, seed); the shader turns them with the disc.
 */
export function galaxyStrings(count: number, segments: number, arms: number, random: () => number): THREE.BufferGeometry {
  const vertices = count * segments * 2;
  const orbit = new Float32Array(vertices * 3);
  const along = new Float32Array(vertices * 2);
  let v = 0;
  for (let k = 0; k < count; k++) {
    const arm = Math.floor(random() * arms) * ((Math.PI * 2) / arms);
    // Most threads wind through the arms; the longest run out to the disc's rim.
    const start = 3 + 44 * random() ** 1.3;
    const span = 16 + 40 * random();
    const offset = (random() + random() + random() - 1.5) * 0.24;
    const lift = (random() - 0.5) * 2.4;
    const wobble = random() * Math.PI * 2;
    const seed = random();
    for (let i = 0; i < segments; i++) {
      for (const s of [i / segments, (i + 1) / segments]) {
        const radius = start + span * s;
        orbit.set([radius, arm + radius * 0.07 + offset + 0.05 * Math.sin(s * 7 + wobble), lift * (1 - s * 0.5) + 0.6 * Math.sin(s * 5 + wobble)], v * 3);
        along.set([s, seed], v * 2);
        v += 1;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  // The shader places every vertex; positions only give the draw its vertex count.
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 3));
  geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 2));
  return geometry;
}
