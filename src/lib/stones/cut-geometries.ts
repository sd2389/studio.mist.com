import * as THREE from "three";

export type CutId =
  | "round"
  | "princess"
  | "emerald"
  | "asscher"
  | "marquise"
  | "oval"
  | "pear"
  | "cushion";

export type CutInfo = {
  id: CutId;
  label: string;
  description: string;
  build: () => THREE.BufferGeometry;
};

/**
 * Per-face flat shading via vertex duplication. drei/three's `computeVertexNormals`
 * averages across shared verts which smooths LatheGeometry into a blob. We want each
 * facet to read as its own flash, so we de-index and recompute normals per-triangle.
 */
function flatShade(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.toNonIndexed();
  out.computeBoundingBox();
  out.center();
  out.computeVertexNormals(); // now each triangle has its own normal
  out.computeBoundingSphere();
  return out;
}

/**
 * Round brilliant — canonical 16-radial Lathe with crown (table → girdle) and
 * pavilion (girdle → culet). Proportions follow Tolkowsky-ish ideal-cut ratios.
 */
function roundBrilliant(): THREE.BufferGeometry {
  const segments = 16;
  // Profile points in (r, y). Radius normalised so girdle = 1.0; height = ~0.6 total.
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.18), // table centre
    new THREE.Vector2(0.55, 0.18), // table edge (slight chamfer next)
    new THREE.Vector2(0.65, 0.15), // crown break
    new THREE.Vector2(1.0, 0.0), // girdle top
    new THREE.Vector2(1.0, -0.02), // girdle bottom (thin band)
    new THREE.Vector2(0.7, -0.18), // pavilion break
    new THREE.Vector2(0.0, -0.45), // culet point
  ];
  const g = new THREE.LatheGeometry(profile, segments);
  return flatShade(g);
}

/** Princess — square truncated pyramid via ExtrudeGeometry of a square outline. */
function princess(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r = 0.5;
  shape.moveTo(-r, -r);
  shape.lineTo(r, -r);
  shape.lineTo(r, r);
  shape.lineTo(-r, r);
  shape.closePath();
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.6,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.18,
    bevelThickness: 0.18,
    steps: 1,
  });
  extrude.rotateX(-Math.PI / 2);
  extrude.translate(0, -0.18, 0);
  return flatShade(extrude);
}

/** Emerald — rectangular step cut via ExtrudeGeometry with cut corners. */
function emerald(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = 0.6;
  const h = 0.42;
  const c = 0.12; // corner clip
  shape.moveTo(-w + c, -h);
  shape.lineTo(w - c, -h);
  shape.lineTo(w, -h + c);
  shape.lineTo(w, h - c);
  shape.lineTo(w - c, h);
  shape.lineTo(-w + c, h);
  shape.lineTo(-w, h - c);
  shape.lineTo(-w, -h + c);
  shape.closePath();
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.4,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.08,
    bevelThickness: 0.08,
    steps: 1,
  });
  extrude.rotateX(-Math.PI / 2);
  return flatShade(extrude);
}

/** Asscher — emerald cut with square aspect + deeper steps. */
function asscher(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const s = 0.48;
  const c = 0.14;
  shape.moveTo(-s + c, -s);
  shape.lineTo(s - c, -s);
  shape.lineTo(s, -s + c);
  shape.lineTo(s, s - c);
  shape.lineTo(s - c, s);
  shape.lineTo(-s + c, s);
  shape.lineTo(-s, s - c);
  shape.lineTo(-s, -s + c);
  shape.closePath();
  const extrude = new THREE.ExtrudeGeometry(shape, {
    depth: 0.45,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    steps: 1,
  });
  extrude.rotateX(-Math.PI / 2);
  return flatShade(extrude);
}

/** Marquise — proper marquise outline lathe with pointed ends, then squashed. */
function marquise(): THREE.BufferGeometry {
  const segments = 24;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.16),
    new THREE.Vector2(0.4, 0.16),
    new THREE.Vector2(0.55, 0.13),
    new THREE.Vector2(1.0, 0.0),
    new THREE.Vector2(1.0, -0.02),
    new THREE.Vector2(0.55, -0.18),
    new THREE.Vector2(0.0, -0.45),
  ];
  const g = new THREE.LatheGeometry(profile, segments);
  g.scale(1.5, 1, 0.6); // stretch into pointed-oval marquise
  return flatShade(g);
}

/** Oval — round brilliant lathe scaled. */
function oval(): THREE.BufferGeometry {
  const segments = 20;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.16),
    new THREE.Vector2(0.5, 0.16),
    new THREE.Vector2(0.6, 0.13),
    new THREE.Vector2(1.0, 0.0),
    new THREE.Vector2(1.0, -0.02),
    new THREE.Vector2(0.65, -0.2),
    new THREE.Vector2(0.0, -0.45),
  ];
  const g = new THREE.LatheGeometry(profile, segments);
  g.scale(1.35, 1, 1);
  return flatShade(g);
}

/** Pear — half marquise, half oval. Asymmetric lathe via vertex remap. */
function pear(): THREE.BufferGeometry {
  const segments = 24;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.16),
    new THREE.Vector2(0.5, 0.16),
    new THREE.Vector2(0.6, 0.13),
    new THREE.Vector2(1.0, 0.0),
    new THREE.Vector2(1.0, -0.02),
    new THREE.Vector2(0.65, -0.22),
    new THREE.Vector2(0.0, -0.55),
  ];
  const g = new THREE.LatheGeometry(profile, segments);
  // Taper the +X end toward a point.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x > 0) {
      const t = Math.min(1, x / 1.0);
      const taper = 1 - t * 0.55;
      pos.setX(i, x * 1.4);
      pos.setZ(i, pos.getZ(i) * taper);
    }
  }
  pos.needsUpdate = true;
  return flatShade(g);
}

/** Cushion — square round-corner brilliant. Round-brilliant lathe with square outer profile bias. */
function cushion(): THREE.BufferGeometry {
  // Build from a higher-segment lathe then nudge the equator points outward at the diagonals.
  const segments = 24;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.15),
    new THREE.Vector2(0.55, 0.15),
    new THREE.Vector2(0.7, 0.12),
    new THREE.Vector2(1.0, 0.0),
    new THREE.Vector2(1.0, -0.02),
    new THREE.Vector2(0.7, -0.2),
    new THREE.Vector2(0.0, -0.42),
  ];
  const g = new THREE.LatheGeometry(profile, segments);
  // Push outline toward a rounded square: rim points at the four cardinal axes get pulled in,
  // points at the diagonals get pushed out — gives the cushion silhouette.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const angle = Math.atan2(z, x);
    const k = 1 + 0.18 * Math.abs(Math.cos(2 * angle)); // bulge along diagonals
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  pos.needsUpdate = true;
  return flatShade(g);
}

export const STANDARD_CUTS: readonly CutInfo[] = [
  {
    id: "round",
    label: "Round Brilliant",
    description: "57-facet ideal cut. Maximum optical fire.",
    build: roundBrilliant,
  },
  {
    id: "princess",
    label: "Princess",
    description: "Square brilliant. Sharp corners, fierce sparkle.",
    build: princess,
  },
  {
    id: "emerald",
    label: "Emerald",
    description: "Rectangular step cut. Long flashes over fire.",
    build: emerald,
  },
  {
    id: "asscher",
    label: "Asscher",
    description: "Square step cut. Art-deco hall-of-mirrors.",
    build: asscher,
  },
  {
    id: "marquise",
    label: "Marquise",
    description: "Pointed oval. Maximum carat-per-surface.",
    build: marquise,
  },
  {
    id: "oval",
    label: "Oval",
    description: "Elongated brilliant. Soft outline, lots of fire.",
    build: oval,
  },
  {
    id: "pear",
    label: "Pear",
    description: "Teardrop. Half oval, half marquise.",
    build: pear,
  },
  {
    id: "cushion",
    label: "Cushion",
    description: "Rounded square brilliant. Vintage warmth.",
    build: cushion,
  },
];

export function getCutById(id: string): CutInfo | null {
  return STANDARD_CUTS.find((c) => c.id === id) ?? null;
}

/** Reusable diamond geometry for jewelry assemblies. */
export function diamondGeometry(scale = 1): THREE.BufferGeometry {
  const g = roundBrilliant();
  if (scale !== 1) g.scale(scale, scale, scale);
  return g;
}
