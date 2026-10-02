import * as THREE from "three";
import {
  buildJewelry,
  fitTransform,
  getCadGem,
  getJewelryRole,
  getPreset,
  partToMesh,
  type BuiltPart,
  type JewelryDesign,
  type JewelryRole,
  type PresetId,
} from "@/lib/jewelry-cad";

/**
 * Gallery pieces: designer presets built by the CAD library — real heads, seated stones,
 * watertight bands — instead of primitive stand-ins. Each one opens in the designer via
 * `designerHref`.
 *
 * `build()` returns slot-named meshes (Metal 1, Heads, Gem 1, Accent 1…) tagged with
 * `userData.jewelryRole`, scaled to about one scene unit for the gallery canvases. The
 * designed materials ride along on each mesh (see `designedMaterialOf`) so a viewer can
 * restore "as designed" after trying presets.
 */

export type JewelryId = "solitaire" | "halo" | "three-stone" | "pave" | "eternity" | "bezel" | "studs" | "pendant";

export type JewelryInfo = {
  id: JewelryId;
  label: string;
  description: string;
  design: JewelryDesign;
  build: () => THREE.Object3D;
};

export type DesignedMaterial = { kind: "metal"; id: string } | { kind: "gem"; id: string };

const DESIGNED_KEY = "designedMaterial" as const;
const GALLERY_SIZE = 1.3;

/** Kept for existing callers: the role tag the canvases switch materials on. */
export function getRole(o: THREE.Object3D): JewelryRole | null {
  return getJewelryRole(o);
}

export function designedMaterialOf(o: THREE.Object3D): DesignedMaterial | null {
  return (o.userData[DESIGNED_KEY] as DesignedMaterial | undefined) ?? null;
}

function designedFor(part: BuiltPart): DesignedMaterial {
  if (part.role === "metal") return { kind: "metal", id: part.metal ?? "platinum" };
  return { kind: "gem", id: getCadGem(part.gem ?? "diamond").material };
}

const builtCache = new Map<JewelryId, BuiltPart[]>();

function partsFor(id: JewelryId, design: JewelryDesign): BuiltPart[] {
  let parts = builtCache.get(id);
  if (!parts) {
    parts = buildJewelry(design).parts;
    builtCache.set(id, parts);
  }
  return parts;
}

function buildPiece(id: JewelryId, design: JewelryDesign): THREE.Object3D {
  const inner = new THREE.Group();
  inner.name = "MIST Design";
  for (const part of partsFor(id, design)) {
    const mesh = partToMesh(part);
    mesh.userData[DESIGNED_KEY] = designedFor(part);
    inner.add(mesh);
  }
  const { scale, offset } = fitTransform(inner, GALLERY_SIZE);
  inner.scale.setScalar(scale);
  inner.position.copy(offset);
  const root = new THREE.Group();
  root.add(inner);
  return root;
}

const GALLERY_IDS: JewelryId[] = ["solitaire", "halo", "three-stone", "pave", "eternity", "bezel", "studs", "pendant"];

export const JEWELRY: readonly JewelryInfo[] = GALLERY_IDS.map((id) => {
  const preset = getPreset(id satisfies PresetId);
  return {
    id,
    label: preset.label,
    description: preset.description,
    design: preset.design,
    build: () => buildPiece(id, preset.design),
  };
});

export function getJewelryById(id: string): JewelryInfo | null {
  return JEWELRY.find((j) => j.id === id) ?? null;
}

/** Open a gallery piece as an editable design. */
export function designerHref(id: JewelryId): string {
  return `/design?preset=${id}`;
}
