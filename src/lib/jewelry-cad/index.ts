/**
 * Procedural jewelry CAD: parametric rings, studs and pendants generated in millimetres,
 * with stones cut procedurally from facet planes (`@/lib/stones/cad-cuts`), specs and
 * print/interchange exports.
 */

export { buildJewelry } from "@/lib/jewelry-cad/build";
export { JEWELRY_PRESETS, PRESET_IDS, getPreset, isPresetId, type JewelryPreset, type PresetId } from "@/lib/jewelry-cad/presets";
export { partsToGroup, partToMesh, fitTransform, getJewelryRole, JEWELRY_ROLE_KEY } from "@/lib/jewelry-cad/scene";
export { exportStl, type StlOptions } from "@/lib/jewelry-cad/export/stl";
export { exportObj, exportMtl, type ObjOptions } from "@/lib/jewelry-cad/export/obj";
export { exportGlb, buildExportScene, type GlbOptions } from "@/lib/jewelry-cad/export/glb";
export { exportAllSizesZip, sizeFileName, type SizePackOptions } from "@/lib/jewelry-cad/export/sizes-zip";
export { resolveHeadMetal } from "@/lib/jewelry-cad/specs";
export {
  RING_SIZE_TABLE,
  HALF_RING_SIZES,
  US_RING_SIZE_MIN,
  US_RING_SIZE_MAX,
  US_RING_SIZE_STEP,
  usSizeToInnerDiameterMm,
  clampUsSize,
  formatUsSize,
  ringSizeRow,
  type RingSizeRow,
} from "@/lib/jewelry-cad/units/ring-size";
export { CAD_METALS, getCadMetal, isCadMetalId, metalWeightGrams, type CadMetal } from "@/lib/jewelry-cad/units/metals";
export { CAD_GEMS, getCadGem, isCadGemId, type CadGem, type CadGemGroup } from "@/lib/jewelry-cad/stones/gem-types";
export { stoneSizeForCarat, roundCaratForDiameter, roundDiameterForCarat } from "@/lib/jewelry-cad/stones/carat-size";
export { CAD_CUTS, CENTRE_STONE_CUTS, getCadCut, isCadCutId, type CadCut } from "@/lib/stones/cad-cuts";
export { analyzeEdges, isWatertight, signedVolume, splitIslands, convexityError, type EdgeReport } from "@/lib/jewelry-cad/geometry/mesh-checks";
export type * from "@/lib/jewelry-cad/types";
