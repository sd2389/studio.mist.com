import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { CompanionFiles } from "../companion-files";
import type { FormatLoader } from "../types";

const MTLLIB_RE = /^[ \t]*mtllib[ \t]+(.+?)[ \t]*$/gm;
const TEXTURE_STATEMENT_RE = /^[ \t]*(map_\w+|bump|disp|decal|refl|norm)[ \t]+(.+?)[ \t]*$/i;

/** The .mtl the OBJ names (whole line first, then space-separated names), else a lone .mtl. */
function findMaterialLibrary(objText: string, companions: CompanionFiles): File | null {
  for (const match of objText.matchAll(MTLLIB_RE)) {
    const whole = companions.find(match[1]);
    if (whole) return whole;
    for (const name of match[1].split(/\s+/)) {
      const file = companions.find(name);
      if (file) return file;
    }
  }
  const libraries = companions.files.filter((file) => file.name.toLowerCase().endsWith(".mtl"));
  return libraries.length === 1 ? libraries[0] : null;
}

/** Drop texture statements whose image was not provided, so nothing 404s. */
export function stripMissingTextures(mtlText: string, find: (reference: string) => File | null): string {
  return mtlText
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(TEXTURE_STATEMENT_RE);
      if (!match) return true;
      const reference = match[2].split(/\s+/).at(-1) ?? "";
      return find(reference) !== null;
    })
    .join("\n");
}

/** OBJ (+ optional MTL and textures). Group, object and material names are only hints. */
export const loadObj: FormatLoader = async (file, { companions }) => {
  const objText = await file.text();
  const loader = new OBJLoader();
  const library = findMaterialLibrary(objText, companions);
  if (library) {
    const mtlText = stripMissingTextures(await library.text(), companions.find);
    const materials = new MTLLoader(companions.manager).parse(mtlText, "");
    materials.preload();
    loader.setMaterials(materials);
  }
  return { root: loader.parse(objText), declaredMmPerUnit: null, slotSource: "shape" };
};
