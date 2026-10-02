import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildFacetSolid, type FacetPlane } from "@/lib/stones/facet-solid";

export type SplitPiece = {
  /** The piece's facet planes, the split plane among them. */
  planes: FacetPlane[];
  /** Any point strictly inside the piece. */
  inside: THREE.Vector3;
};

/** Intersect planes around `inside`, for pieces whose planes may pass through the origin. */
function solidAround(planes: FacetPlane[], inside: THREE.Vector3, scale: number): THREE.BufferGeometry {
  const shifted = planes.map((p) => ({ normal: p.normal, offset: p.offset - p.normal.dot(inside) }));
  return buildFacetSolid(shifted, scale).translate(inside.x, inside.y, inside.z);
}

/** Drops the triangles lying in the plane: where the two pieces meet, inside the stone. */
function withoutFacesOn(geometry: THREE.BufferGeometry, normal: THREE.Vector3, d: number, tolerance: number): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const kept: number[] = [];
  const keptNormals: number[] = [];
  const faceNormal = geometry.getAttribute("normal");
  const a = new THREE.Vector3();
  for (let v = 0; v + 2 < position.count; v += 3) {
    let onPlane = true;
    for (let k = 0; k < 3; k++) {
      a.fromBufferAttribute(position, v + k);
      if (Math.abs(normal.dot(a) - d) > tolerance) onPlane = false;
    }
    if (onPlane) continue;
    for (let k = 0; k < 3; k++) {
      kept.push(position.getX(v + k), position.getY(v + k), position.getZ(v + k));
      keptNormals.push(faceNormal.getX(v + k), faceNormal.getY(v + k), faceNormal.getZ(v + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(keptNormals, 3));
  return out;
}

/**
 * A stone made of two convex pieces meeting on a plane — a heart, whose cleft no single
 * convex solid can hold. The mesh is both pieces' outer facets (their shared face is inside
 * the stone and dropped), flat-shaded and non-indexed: closed, with its only reflex edges
 * along the cleft, which is how the ray tracer finds the split again.
 */
export function buildSplitSolid(pieces: [SplitPiece, SplitPiece], split: { normal: THREE.Vector3; d: number }, scale: number): THREE.BufferGeometry {
  const normal = split.normal.clone().normalize();
  const tolerance = scale * 1e-5;
  const parts = pieces.map((piece) => {
    const solid = solidAround(piece.planes, piece.inside, scale);
    const outer = withoutFacesOn(solid, normal, split.d, tolerance);
    solid.dispose();
    return outer;
  });
  const merged = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return merged;
}
