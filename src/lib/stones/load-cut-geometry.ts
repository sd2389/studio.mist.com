"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { CutId } from "@/lib/stones/cut-geometries";

const CUTS_URL = "/models/gem-cuts/gemstone-cuts.obj";

/**
 * Which solid in the CAD set backs each catalog cut. Identified from the girdle
 * silhouette of every solid — see `public/models/gem-cuts/ATTRIBUTION.md`.
 */
export const CUT_OBJECT_BY_ID: Record<CutId, string> = {
  round: "cut_02",
  princess: "cut_11",
  emerald: "cut_04",
  asscher: "cut_09",
  marquise: "cut_17",
  oval: "cut_06",
  pear: "cut_19",
  cushion: "cut_08",
};

/**
 * The CAD export's per-solid orientation is whatever the original modeler happened to
 * work in — most solids already sit table-up with their longest footprint axis facing
 * the camera, but a few come out rotated about the vertical axis, foreshortening an
 * elongated outline (e.g. marquise, pear) into an unrecognisable round blob under the
 * studio's fixed front camera. Correction is a yaw about Y, found by eye per solid.
 */
const CUT_YAW_FIX_BY_OBJECT: Partial<Record<string, number>> = {
  cut_17: Math.PI / 2,
  cut_19: Math.PI / 2,
};

let cache: Promise<Record<string, THREE.BufferGeometry>> | null = null;

function loadAll(): Promise<Record<string, THREE.BufferGeometry>> {
  cache ??= new Promise((resolve, reject) => {
    new OBJLoader().load(
      CUTS_URL,
      (group) => {
        const out: Record<string, THREE.BufferGeometry> = {};
        group.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          // The export carries no normals and shares vertices between facets, so smooth
          // shading would blur exactly the facet boundaries a gem is read by.
          const g = o.geometry.toNonIndexed();
          g.center();
          const yaw = CUT_YAW_FIX_BY_OBJECT[o.name];
          if (yaw) g.rotateY(yaw);
          g.computeVertexNormals();
          g.computeBoundingSphere();
          out[o.name] = g;
        });
        resolve(out);
      },
      undefined,
      reject,
    );
  });
  return cache;
}

/** Geometry for a catalog cut; `null` until the shared CAD file has parsed. */
export function useCutGeometry(cutId: CutId | null): THREE.BufferGeometry | null {
  const [solids, setSolids] = useState<Record<string, THREE.BufferGeometry> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then((all) => {
        if (!cancelled) setSolids(all);
      })
      .catch(() => {
        /* leave null; callers render nothing rather than a wrong shape */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cutId || !solids) return null;
  return solids[CUT_OBJECT_BY_ID[cutId]] ?? null;
}
