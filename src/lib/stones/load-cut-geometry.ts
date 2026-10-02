"use client";

import { useMemo } from "react";
import type * as THREE from "three";
import { getCadCut } from "@/lib/stones/cad-cuts";
import type { CutId } from "@/lib/stones/cut-geometries";

/** Catalog stones share one display length (scene units), which the stone camera frames. */
const DISPLAY_LENGTH = 2;

const cache = new Map<CutId, THREE.BufferGeometry>();

/**
 * Generated geometry for a catalog cut, built from its facet planes once and shared by every
 * tile and viewer. Shared geometry also shares its traced-gem atlas rows.
 */
export function cutGeometry(cutId: CutId): THREE.BufferGeometry {
  let geometry = cache.get(cutId);
  if (!geometry) {
    const cut = getCadCut(cutId);
    geometry = cut.build(DISPLAY_LENGTH, DISPLAY_LENGTH / cut.ratio);
    geometry.computeBoundingSphere();
    cache.set(cutId, geometry);
  }
  return geometry;
}

export function useCutGeometry(cutId: CutId | null): THREE.BufferGeometry | null {
  return useMemo(() => (cutId ? cutGeometry(cutId) : null), [cutId]);
}
