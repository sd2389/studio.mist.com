import * as THREE from "three";

/**
 * Watertight swept surfaces for metal parts.
 *
 * Everything metal is built as a stack of closed rings: a shank is its cross-section swept
 * around the finger, a prong is a circle swept along a curve and capped with poles. Rings
 * share vertices with their neighbours, so the result is closed and edge-manifold by
 * construction. UV seams duplicate a column/row of vertices; `weldSeamNormals` averages
 * normals across those duplicates so the seam never shows in the shading.
 */

export type Ring = THREE.Vector3[];

export type SweepOptions = {
  /** Connect the last ring back to the first (a torus-like loop). */
  closed?: boolean;
  /** Pole vertex fanned onto the first ring (a rounded or pointed cap). */
  startPole?: THREE.Vector3;
  /** Pole vertex fanned onto the last ring. */
  endPole?: THREE.Vector3;
};

function signedVolumeIndexed(position: ArrayLike<number>, index: ArrayLike<number>): number {
  let v = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i]! * 3, b = index[i + 1]! * 3, c = index[i + 2]! * 3;
    const ax = position[a]!, ay = position[a + 1]!, az = position[a + 2]!;
    const bx = position[b]!, by = position[b + 1]!, bz = position[b + 2]!;
    const cx = position[c]!, cy = position[c + 1]!, cz = position[c + 2]!;
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** Average normals over vertices that share a position (UV seams, poles). */
export function weldSeamNormals(geometry: THREE.BufferGeometry): void {
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  if (!nor) return;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  }
  const n = new THREE.Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    n.set(0, 0, 0);
    for (const i of list) n.add(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)));
    n.normalize();
    for (const i of list) nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
}

/**
 * Sweep closed rings (all the same length) into an indexed, outward-wound, smooth-shaded
 * surface with UVs (u along the sweep, v around the ring).
 */
export function sweepRings(rings: Ring[], options: SweepOptions = {}): THREE.BufferGeometry {
  const ringCount = rings.length;
  const m = rings[0]!.length;
  const columns = m + 1; // duplicated first point closes the UV seam
  const rows = options.closed ? ringCount + 1 : ringCount;
  const poles = (options.startPole ? 1 : 0) + (options.endPole ? 1 : 0);
  const positions = new Float32Array((rows * columns + poles) * 3);
  const uvs = new Float32Array((rows * columns + poles) * 2);
  for (let r = 0; r < rows; r++) {
    const ring = rings[r % ringCount]!;
    for (let c = 0; c < columns; c++) {
      const p = ring[c % m]!;
      const i = r * columns + c;
      positions.set([p.x, p.y, p.z], i * 3);
      uvs.set([r / Math.max(1, rows - 1), c / m], i * 2);
    }
  }
  const indices: number[] = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c < m; c++) {
      const a = r * columns + c, b = a + 1, d = a + columns, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  let next = rows * columns;
  if (options.startPole) {
    const pole = next++;
    positions.set([options.startPole.x, options.startPole.y, options.startPole.z], pole * 3);
    uvs.set([0, 0.5], pole * 2);
    // Body triangles walk ring 0 as c+1 → c, so the fan walks it c → c+1.
    for (let c = 0; c < m; c++) indices.push(pole, c, c + 1);
  }
  if (options.endPole) {
    const pole = next++;
    positions.set([options.endPole.x, options.endPole.y, options.endPole.z], pole * 3);
    uvs.set([1, 0.5], pole * 2);
    const base = (rows - 1) * columns;
    for (let c = 0; c < m; c++) indices.push(pole, base + c + 1, base + c);
  }
  if (signedVolumeIndexed(positions, indices) < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const t = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = t;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  weldSeamNormals(geometry);
  return geometry;
}

/** Circle of `segments` points around `center` in the plane spanned by `u` and `v`. */
export function circleRing(center: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, radius: number, segments: number): Ring {
  return Array.from({ length: segments }, (_, i) => {
    const t = (i / segments) * Math.PI * 2;
    return center.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius);
  });
}

/** Rotation-minimising frames along a polyline (parallel transport of an initial normal). */
export function transportFrames(points: THREE.Vector3[]): Array<{ tangent: THREE.Vector3; normal: THREE.Vector3; binormal: THREE.Vector3 }> {
  const tangents = points.map((_, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    return new THREE.Vector3().subVectors(b, a).normalize();
  });
  const first = tangents[0]!;
  const seed = Math.abs(first.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  let normal = new THREE.Vector3().crossVectors(first, seed).normalize();
  const frames = [];
  for (let i = 0; i < points.length; i++) {
    const t = tangents[i]!;
    if (i > 0) {
      const prev = tangents[i - 1]!;
      const axis = new THREE.Vector3().crossVectors(prev, t);
      const s = axis.length();
      if (s > 1e-9) {
        const angle = Math.atan2(s, prev.dot(t));
        normal = normal.clone().applyAxisAngle(axis.normalize(), angle);
      }
    }
    const binormal = new THREE.Vector3().crossVectors(t, normal).normalize();
    frames.push({ tangent: t, normal: normal.clone(), binormal });
  }
  return frames;
}

export type TubeOptions = {
  radialSegments?: number;
  /** Hemispherical end caps (true) or pointed poles at the path ends (false). */
  roundCaps?: boolean;
  capRings?: number;
};

/**
 * Closed tube along an open path with rounded ends — prongs, posts, wires.
 * `radius` may vary along the path (0 → 1 parameter).
 */
export function capsuleAlongPath(path: THREE.Vector3[], radius: number | ((t: number) => number), options: TubeOptions = {}): THREE.BufferGeometry {
  const segments = options.radialSegments ?? 14;
  const capRings = options.capRings ?? 4;
  const radiusAt = typeof radius === "number" ? () => radius : radius;
  const frames = transportFrames(path);
  const rings: Ring[] = [];
  const r0 = radiusAt(0);
  const r1 = radiusAt(1);
  const f0 = frames[0]!;
  const fl = frames[frames.length - 1]!;
  for (let k = capRings - 1; k >= 1; k--) {
    const a = (k / capRings) * (Math.PI / 2);
    const c = path[0]!.clone().addScaledVector(f0.tangent, -Math.sin(a) * r0);
    rings.push(circleRing(c, f0.normal, f0.binormal, Math.cos(a) * r0, segments));
  }
  path.forEach((p, i) => {
    const f = frames[i]!;
    rings.push(circleRing(p, f.normal, f.binormal, radiusAt(i / (path.length - 1)), segments));
  });
  for (let k = 1; k < capRings; k++) {
    const a = (k / capRings) * (Math.PI / 2);
    const c = path[path.length - 1]!.clone().addScaledVector(fl.tangent, Math.sin(a) * r1);
    rings.push(circleRing(c, fl.normal, fl.binormal, Math.cos(a) * r1, segments));
  }
  return sweepRings(rings, {
    startPole: path[0]!.clone().addScaledVector(f0.tangent, -r0),
    endPole: path[path.length - 1]!.clone().addScaledVector(fl.tangent, r1),
  });
}

/** Closed loop tube along a planar closed curve — gallery rails, jump rings, bails. */
export function tubeAlongLoop(loop: THREE.Vector3[], radius: number, radialSegments = 12): THREE.BufferGeometry {
  const n = loop.length;
  const planeNormal = loopPlaneNormal(loop);
  const rings = loop.map((p, i) => {
    const tangent = new THREE.Vector3().subVectors(loop[(i + 1) % n]!, loop[(i + n - 1) % n]!).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, planeNormal).normalize();
    return circleRing(p, side, planeNormal, radius, radialSegments);
  });
  return sweepRings(rings, { closed: true });
}

/** Best-fit plane normal of a closed loop (Newell's method). */
export function loopPlaneNormal(loop: THREE.Vector3[]): THREE.Vector3 {
  const n = new THREE.Vector3();
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.normalize();
}

/**
 * Surface of revolution around +y from a profile of (radius, y) points that starts and
 * ends on the axis — beads, discs, cups. Both ends become poles, so it is closed.
 */
export function latheClosed(profile: Array<{ r: number; y: number }>, segments = 24, center = new THREE.Vector3()): THREE.BufferGeometry {
  const inner = profile.slice(1, -1);
  const rings = inner.map(({ r, y }) =>
    circleRing(new THREE.Vector3(center.x, center.y + y, center.z), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), r, segments),
  );
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  return sweepRings(rings, {
    startPole: new THREE.Vector3(center.x, center.y + first.y, center.z),
    endPole: new THREE.Vector3(center.x, center.y + last.y, center.z),
  });
}

/** UV sphere (closed; poles on ±y). */
export function sphereGeometry(center: THREE.Vector3, radius: number, segments = 14, rings = 8): THREE.BufferGeometry {
  const profile = Array.from({ length: rings + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / rings) * Math.PI;
    return { r: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
  return latheClosed(profile, segments, center);
}

/** Catmull-Rom (centripetal) resample of control points into a smooth polyline. */
export function smoothPath(controls: THREE.Vector3[], samples: number): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(controls, false, "centripetal");
  return curve.getSpacedPoints(samples);
}
