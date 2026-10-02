import { PieceCollector } from "@/lib/jewelry-cad/pieces/collector";
import { buildPendantPiece } from "@/lib/jewelry-cad/pieces/pendant";
import { buildRingPiece } from "@/lib/jewelry-cad/pieces/ring";
import { buildStudsPiece } from "@/lib/jewelry-cad/pieces/studs";
import { computeSpecs, resolveHeadMetal } from "@/lib/jewelry-cad/specs";
import type { BuiltJewelry, JewelryDesign } from "@/lib/jewelry-cad/types";

/** Build a design into slot meshes (mm), specs and prong contact records. Pure; no React. */
export function buildJewelry(design: JewelryDesign): BuiltJewelry {
  const collector = new PieceCollector();
  let bandThickness = design.bandThickness;
  if (design.kind === "ring") bandThickness = buildRingPiece(design, collector).bandThickness;
  else if (design.kind === "studs") buildStudsPiece(design, collector);
  else buildPendantPiece(design, collector);

  const parts = collector.toParts({ "Metal 1": design.metal, Heads: resolveHeadMetal(design) });
  return {
    design,
    parts,
    specs: computeSpecs(design, collector, parts, bandThickness),
    prongs: collector.prongs,
  };
}
