import * as THREE from "three";
import { diamondGeometry } from "@/lib/stones/cut-geometries";

export type JewelryId = "solitaire" | "halo" | "studs" | "eternity" | "three-stone" | "tennis";

export type JewelryInfo = {
  id: JewelryId;
  label: string;
  description: string;
  build: () => THREE.Object3D;
};

/**
 * Tag a mesh with its semantic role so the canvas can apply the right material:
 * - "metal": follows user metal preset (defaults to platinum)
 * - "gem":   always diamond, immune to user-selected metals
 * - "accent-gem": same as gem (smaller halo / pavé stones)
 */
type Role = "metal" | "gem" | "accent-gem";
const ROLE_KEY = "jewelryRole" as const;
export function getRole(o: THREE.Object3D): Role | null {
  return (o.userData[ROLE_KEY] as Role | undefined) ?? null;
}
function setRole(o: THREE.Object3D, role: Role): void {
  o.userData[ROLE_KEY] = role;
}

/**
 * Use the proper Tolkowsky-ish round-brilliant LatheGeometry from cut-geometries.
 * Radius arg matches the old octahedron API — interpreted as the gem's girdle radius.
 */
function gemOctahedron(radius: number, _squashY = 0.78): THREE.BufferGeometry {
  return diamondGeometry(radius);
}

function makeMetal(geom: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geom);
  setRole(mesh, "metal");
  return mesh;
}
function makeGem(geom: THREE.BufferGeometry, role: Role = "gem"): THREE.Mesh {
  const mesh = new THREE.Mesh(geom);
  setRole(mesh, role);
  return mesh;
}

function prongs(centerY: number, radius: number, count = 4): THREE.Object3D {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 12));
    setRole(r, "metal");
    r.position.set(Math.cos(angle) * radius * 0.7, centerY - 0.06, Math.sin(angle) * radius * 0.7);
    r.rotation.z = Math.cos(angle) * 0.18;
    r.rotation.x = Math.sin(angle) * 0.18;
    g.add(r);
  }
  return g;
}

/** Round solitaire ring — torus band, four prongs, round-brilliant center stone. */
function solitaire(): THREE.Object3D {
  const root = new THREE.Group();
  const band = makeMetal(new THREE.TorusGeometry(0.5, 0.05, 24, 96));
  band.rotation.x = Math.PI / 2;
  root.add(band);

  const stoneR = 0.16;
  const stone = makeGem(gemOctahedron(stoneR));
  stone.position.y = 0.62;
  root.add(stone);
  root.add(prongs(0.62, stoneR));
  return root;
}

/** Halo ring — center round + 12 small pavé stones around it. */
function halo(): THREE.Object3D {
  const root = solitaire();

  const halo = new THREE.Group();
  const haloR = 0.25;
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const s = makeGem(gemOctahedron(0.05, 0.85), "accent-gem");
    s.position.set(Math.cos(angle) * haloR, 0.6, Math.sin(angle) * haloR);
    halo.add(s);
  }
  root.add(halo);
  return root;
}

/** Diamond stud earring pair — two posts with bezel-set stones. */
function studs(): THREE.Object3D {
  const root = new THREE.Group();

  for (let side = -1; side <= 1; side += 2) {
    const stud = new THREE.Group();
    const post = makeMetal(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 16));
    post.position.set(0, 0, -0.2);
    post.rotation.x = Math.PI / 2;
    stud.add(post);

    const bezel = makeMetal(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 24));
    bezel.position.set(0, 0, 0);
    bezel.rotation.x = Math.PI / 2;
    stud.add(bezel);

    const stone = makeGem(gemOctahedron(0.16));
    stone.position.set(0, 0, 0.06);
    stone.rotation.x = Math.PI / 2;
    stud.add(stone);

    stud.position.x = side * 0.55;
    root.add(stud);
  }
  return root;
}

/** Eternity band — full circle of small set stones. */
function eternity(): THREE.Object3D {
  const root = new THREE.Group();
  const band = makeMetal(new THREE.TorusGeometry(0.5, 0.07, 24, 96));
  band.rotation.x = Math.PI / 2;
  root.add(band);

  const count = 18;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const s = makeGem(gemOctahedron(0.075, 0.9), "accent-gem");
    s.position.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
    root.add(s);
  }
  return root;
}

/** Three-stone ring — center + two side stones. */
function threeStone(): THREE.Object3D {
  const root = new THREE.Group();
  const band = makeMetal(new THREE.TorusGeometry(0.5, 0.05, 24, 96));
  band.rotation.x = Math.PI / 2;
  root.add(band);

  const center = makeGem(gemOctahedron(0.16));
  center.position.y = 0.62;
  root.add(center);
  root.add(prongs(0.62, 0.16));

  for (const side of [-1, 1] as const) {
    const s = makeGem(gemOctahedron(0.1));
    s.position.set(side * 0.3, 0.55, 0);
    root.add(s);
    root.add(prongs(0.55, 0.1, 3).translateX(side * 0.3));
  }
  return root;
}

/** Tennis bracelet — short segment of bezel-set stones strung on a curved spine. */
function tennis(): THREE.Object3D {
  const root = new THREE.Group();
  const segments = 7;
  const radius = 1.0;
  const arc = Math.PI * 0.6;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1) - 0.5;
    const angle = t * arc;
    const x = Math.sin(angle) * radius;
    const y = -Math.cos(angle) * radius + 0.6;

    const bezel = makeMetal(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16));
    bezel.position.set(x, y, 0);
    bezel.rotation.z = angle;
    root.add(bezel);

    const stone = makeGem(gemOctahedron(0.11, 0.85));
    stone.position.set(x, y, 0.05);
    stone.rotation.z = angle;
    root.add(stone);

    if (i < segments - 1) {
      const nextT = (i + 1) / (segments - 1) - 0.5;
      const nextAngle = nextT * arc;
      const nx = Math.sin(nextAngle) * radius;
      const ny = -Math.cos(nextAngle) * radius + 0.6;
      const link = makeMetal(new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(nx - x, ny - y), 8));
      link.position.set((x + nx) / 2, (y + ny) / 2, 0);
      link.rotation.z = Math.atan2(ny - y, nx - x) + Math.PI / 2;
      root.add(link);
    }
  }
  return root;
}

export const JEWELRY: readonly JewelryInfo[] = [
  {
    id: "solitaire",
    label: "Solitaire Ring",
    description: "Classic four-prong round-brilliant solitaire.",
    build: solitaire,
  },
  {
    id: "halo",
    label: "Halo Ring",
    description: "Center stone framed by twelve pavé diamonds.",
    build: halo,
  },
  {
    id: "three-stone",
    label: "Three-Stone Ring",
    description: "Center + two flanking diamonds.",
    build: threeStone,
  },
  {
    id: "eternity",
    label: "Eternity Band",
    description: "Continuous band of 18 set diamonds.",
    build: eternity,
  },
  {
    id: "studs",
    label: "Diamond Studs",
    description: "Paired bezel-set diamond stud earrings.",
    build: studs,
  },
  {
    id: "tennis",
    label: "Tennis Bracelet",
    description: "Linked bezel-set diamond segment.",
    build: tennis,
  },
];

export function getJewelryById(id: string): JewelryInfo | null {
  return JEWELRY.find((j) => j.id === id) ?? null;
}
