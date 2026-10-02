import * as THREE from "three";
import { buildRoundMelee, getCadCut, type CadCutId } from "@/lib/stones/cad-cuts";
import { convexHull2D, type GirdleOutline, type Vec2 } from "@/lib/stones/outlines";
import { roundCaratForDiameter, stoneSizeForCarat } from "@/lib/jewelry-cad/stones/carat-size";

/**
 * A generated stone plus the measurements a setting needs: where the crown and pavilion
 * surfaces are, what the stone's cross-section looks like at any height, and where the
 * girdle is. Frame: girdle mid-plane y = 0, table +y, length along x, width along z (mm).
 */
export type StoneModel = {
  cut: CadCutId;
  geometry: THREE.BufferGeometry;
  outline: GirdleOutline;
  length: number;
  width: number;
  carat: number;
  tableY: number;
  culetY: number;
  /** Lowest point of the girdle's top edge and highest point of its bottom edge. */
  girdleTop: number;
  girdleBottom: number;
  /** Crown surface height above (x, z), or null outside the stone. */
  topAt(x: number, z: number): number | null;
  /** Pavilion surface height below (x, z), or null outside the stone. */
  bottomAt(x: number, z: number): number | null;
  /** Convex cross-section of the stone at height y (empty above the table / below the culet). */
  sectionAt(y: number): Vec2[];
};

type Triangle = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; ny: number };

function trianglesOf(geometry: THREE.BufferGeometry): Triangle[] {
  const p = geometry.getAttribute("position");
  const out: Triangle[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i);
    const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    out.push({ a, b, c, ny: n.y });
  }
  return out;
}

/** Height of triangle `t` above (x, z) if the vertical line hits it. */
function heightOn(t: Triangle, x: number, z: number): number | null {
  const { a, b, c } = t;
  const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(d) < 1e-14) return null;
  const w1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
  const w2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
  const w3 = 1 - w1 - w2;
  const eps = -1e-9;
  if (w1 < eps || w2 < eps || w3 < eps) return null;
  return w1 * a.y + w2 * b.y + w3 * c.y;
}

function surfaceHeight(tris: Triangle[], x: number, z: number, upward: boolean): number | null {
  let best: number | null = null;
  for (const t of tris) {
    if (upward ? t.ny <= 0.02 : t.ny >= -0.02) continue;
    const h = heightOn(t, x, z);
    if (h === null) continue;
    best = best === null ? h : upward ? Math.max(best, h) : Math.min(best, h);
  }
  return best;
}

function crossSection(tris: Triangle[], y: number): Vec2[] {
  const pts: Vec2[] = [];
  for (const t of tris) {
    const vs = [t.a, t.b, t.c];
    for (let e = 0; e < 3; e++) {
      const p = vs[e]!, q = vs[(e + 1) % 3]!;
      if ((p.y - y) * (q.y - y) > 0 || p.y === q.y) continue;
      const k = (y - p.y) / (q.y - p.y);
      pts.push({ x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k });
    }
  }
  return pts.length >= 3 ? convexHull2D(pts) : [];
}

function girdleEdges(tris: Triangle[]): { top: number; bottom: number } {
  // Girdle facets are the vertical ones; their top edge dips between the crown facets.
  let top = Infinity;
  let bottom = -Infinity;
  for (const t of tris) {
    if (Math.abs(t.ny) > 0.02) continue;
    const ys = [t.a.y, t.b.y, t.c.y];
    const maxY = Math.max(...ys);
    const minY = Math.min(...ys);
    top = Math.min(top, maxY);
    bottom = Math.max(bottom, minY);
  }
  if (!Number.isFinite(top)) return { top: 0, bottom: 0 };
  return { top, bottom };
}

function modelFrom(cut: CadCutId, geometry: THREE.BufferGeometry, outline: GirdleOutline, carat: number): StoneModel {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const tris = trianglesOf(geometry);
  const girdle = girdleEdges(tris);
  return {
    cut,
    geometry,
    outline,
    length: box.max.x - box.min.x,
    width: box.max.z - box.min.z,
    carat,
    tableY: box.max.y,
    culetY: box.min.y,
    girdleTop: girdle.top,
    girdleBottom: girdle.bottom,
    topAt: (x, z) => surfaceHeight(tris, x, z, true),
    bottomAt: (x, z) => surfaceHeight(tris, x, z, false),
    sectionAt: (y) => crossSection(tris, y),
  };
}

const cache = new Map<string, StoneModel>();

function cached(key: string, build: () => StoneModel): StoneModel {
  const hit = cache.get(key);
  if (hit) return hit;
  const model = build();
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, model);
  return model;
}

/** Center / side stone of a cut and weight, sized for the gem's specific gravity. */
export function buildStoneModel(cut: CadCutId, carat: number, specificGravity: number): StoneModel {
  const size = stoneSizeForCarat(cut, carat, specificGravity);
  const key = `${cut}:${size.length.toFixed(4)}:${size.width.toFixed(4)}:${carat}`;
  return cached(key, () => {
    const def = getCadCut(cut);
    return modelFrom(cut, def.build(size.length, size.width), def.outline(size.length, size.width), carat);
  });
}

/** Round melee of a given diameter (weight from the round chart). */
export function buildMeleeModel(diameter: number): StoneModel {
  const d = Math.round(diameter * 1000) / 1000;
  return cached(`melee:${d}`, () => {
    const def = getCadCut("round");
    return modelFrom("round", buildRoundMelee(d), def.outline(d, d), roundCaratForDiameter(d));
  });
}

/** Outline radius and outward normal at angle `theta` (radians, from +x toward +z). */
export function outlineAt(model: StoneModel, theta: number): { point: Vec2; normal: Vec2 } {
  const pts = model.outline.points;
  const dx = Math.cos(theta), dz = Math.sin(theta);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const ex = b.x - a.x, ez = b.z - a.z;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-14) continue;
    const t = (a.x * ez - a.z * ex) / denom;
    const s = (a.x * dz - a.z * dx) / denom;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) {
      const len = Math.hypot(ex, ez) || 1;
      const normal = { x: ez / len, z: -ex / len };
      // Straight onto a corner (a princess's, a trillion's): the normal there is the bisector.
      const end = s < 1e-6 ? i - 1 : s > 1 - 1e-6 ? i + 1 : null;
      if (end !== null) {
        const c = pts[(end + pts.length) % pts.length]!;
        const d = pts[(end + 1 + pts.length) % pts.length]!;
        const l2 = Math.hypot(d.x - c.x, d.z - c.z) || 1;
        const bx = normal.x + (d.z - c.z) / l2, bz = normal.z - (d.x - c.x) / l2;
        const bl = Math.hypot(bx, bz) || 1;
        return { point: { x: dx * t, z: dz * t }, normal: { x: bx / bl, z: bz / bl } };
      }
      return { point: { x: dx * t, z: dz * t }, normal };
    }
  }
  return { point: { x: 0, z: 0 }, normal: { x: dx, z: dz } };
}

/** Distance from the axis to the stone surface at height y along angle theta. */
export function sectionRadiusAt(model: StoneModel, theta: number, y: number): number {
  const section = model.sectionAt(y);
  if (section.length < 3) return 0;
  return rayToPolygon(section, theta);
}

export function rayToPolygon(polygon: Vec2[], theta: number): number {
  const dx = Math.cos(theta), dz = Math.sin(theta);
  let best = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const ex = b.x - a.x, ez = b.z - a.z;
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-14) continue;
    const t = (a.x * ez - a.z * ex) / denom;
    const s = (a.x * dz - a.z * dx) / denom;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}
