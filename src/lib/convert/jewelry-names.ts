import * as THREE from "three";

/**
 * Name hints for meshes from formats without jewelry layers (OBJ groups, FBX nodes, STEP
 * products, 3MF objects). Geometry decides metal vs stone; a name can only vouch that a mesh
 * is a stone the shape test cannot recognise (cabochons, open or low-poly stones).
 */

const STONE_WORDS = new Set([
  "gem", "gems", "gemstone", "gemstones", "diamond", "diamonds", "stone", "stones", "melee",
  "pave", "pavé", "brilliant", "ruby", "rubies", "sapphire", "sapphires", "emerald", "emeralds",
  "moissanite", "cz", "zirconia", "zircon", "crystal", "crystals", "topaz", "amethyst", "garnet",
  "peridot", "aquamarine", "tanzanite", "tourmaline", "citrine", "morganite", "spinel",
]);

/** Words that describe a whole piece or a metal part, which a stone name must not carry. */
const NOT_A_STONE_WORDS = new Set([
  "ring", "band", "shank", "setting", "head", "heads", "prong", "prongs", "bezel", "basket",
  "gallery", "claw", "claws", "seat", "metal", "gold", "silver", "platinum", "pendant",
  "earring", "earrings", "necklace", "bracelet", "jewelry", "jewellery", "model", "assembly",
  "mount", "mounting",
]);

/** Lower-case words of a name: splits camelCase, digits and punctuation. */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/)
    .filter(Boolean);
}

/** True when at least one name reads as a stone and none as a piece or metal part. */
export function namesDescribeStone(names: string[]): boolean {
  const words = names.flatMap(nameWords);
  return words.some((word) => STONE_WORDS.has(word)) && !words.some((word) => NOT_A_STONE_WORDS.has(word));
}

/**
 * Per-triangle "a name says this is a stone" flags. Material groups matter: a single OBJ
 * object often carries `usemtl Gold` for the band and `usemtl Diamond` for the stones.
 * Null when no triangle is vouched for.
 */
export function stoneNamedTriangles(mesh: THREE.Mesh, triangleCount: number): Uint8Array | null {
  const meshNames = [mesh.name, mesh.userData.sourceName as string | undefined]
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = Array.isArray(mesh.material) && mesh.geometry.groups.length > 0
    ? mesh.geometry.groups
    : [{ start: 0, count: triangleCount * 3, materialIndex: 0 }];
  let flags: Uint8Array | null = null;
  for (const group of groups) {
    const materialName = materials[group.materialIndex ?? 0]?.name;
    if (!namesDescribeStone(materialName ? [...meshNames, materialName] : meshNames)) continue;
    flags ??= new Uint8Array(triangleCount);
    const first = Math.floor(group.start / 3);
    const end = Math.min(triangleCount, Math.floor((group.start + group.count) / 3));
    flags.fill(1, first, end);
  }
  return flags;
}
