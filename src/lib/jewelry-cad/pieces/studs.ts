import * as THREE from "three";
import { capsuleAlongPath, latheClosed } from "@/lib/jewelry-cad/geometry/sweep";
import { buildBezelHead } from "@/lib/jewelry-cad/parts/bezel-head";
import { buildHalo } from "@/lib/jewelry-cad/parts/halo";
import { buildProngHead, prongRadiusFor, type HeadBuild } from "@/lib/jewelry-cad/parts/prong-head";
import type { PieceCollector } from "@/lib/jewelry-cad/pieces/collector";
import { getCadGem } from "@/lib/jewelry-cad/stones/gem-types";
import { buildStoneModel, type StoneModel } from "@/lib/jewelry-cad/stones/stone-model";
import type { JewelryDesign } from "@/lib/jewelry-cad/types";

/**
 * Stud earrings: a pair of set stones on friction posts. Each stud is built table-up in
 * the stone frame, then turned so the stones face +z (toward a front camera) with the
 * posts running back along −z. Posts are the standard 0.8 mm × 10 mm.
 */

const POST_RADIUS = 0.4;
const POST_LENGTH = 10;

function studHead(stone: StoneModel, design: JewelryDesign, seatY: number): HeadBuild {
  if (design.head === "bezel") return buildBezelHead({ stone, seatY });
  return buildProngHead({ stone, style: design.head === "6-prong" ? "6-prong" : "basket", seatY });
}

/** Disc the prongs stand on and the post is soldered to. */
function backPlate(radius: number, seatY: number): THREE.BufferGeometry {
  const t = 0.7;
  return latheClosed(
    [
      { r: 0, y: seatY - t },
      { r: radius * 0.8, y: seatY - t },
      { r: radius, y: seatY - t * 0.6 },
      { r: radius, y: seatY - t * 0.2 },
      { r: radius * 0.85, y: seatY + 0.1 },
      { r: 0, y: seatY + 0.1 },
    ],
    28,
  );
}

export function buildStudsPiece(design: JewelryDesign, collector: PieceCollector): void {
  const stone = buildStoneModel(design.cut, design.carat, getCadGem(design.gem).sizingGravity);
  const seatY = stone.culetY - 0.35;
  const head = studHead(stone, design, seatY);
  const halo = design.halo === "none" ? null : buildHalo({ center: stone, kind: design.halo, headReach: 1.7 * prongRadiusFor(stone, 4), carriers: head.carriers });
  const plateRadius = Math.max(head.footprint.x, head.footprint.z) * 0.9;
  const plate = backPlate(plateRadius, seatY);
  const post = capsuleAlongPath(
    [new THREE.Vector3(0, seatY - 0.5, 0), new THREE.Vector3(0, seatY - 0.5 - POST_LENGTH, 0)],
    POST_RADIUS,
    { radialSegments: 16 },
  );

  const reach = halo ? halo.reach : 0;
  const spacing = Math.max(stone.length, stone.width) + reach * 2 + 8;
  // Table (+y) toward the viewer (+z), the point (+x) hanging down (-y), as the pendant hangs.
  const face = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
  const matrices = [-1, 1].map((side) => new THREE.Matrix4().makeTranslation((side * spacing) / 2, 0, 0).multiply(face));

  const melee: THREE.Matrix4[] = [];
  for (const m of matrices) {
    collector.addMetal("Heads", head.parts, m);
    collector.addProngs(head.prongs, m);
    collector.addMetal("Metal 1", [plate, post], m);
    if (halo) {
      collector.addMetal("Heads", halo.metal, m);
      melee.push(...halo.melee.map((p) => m.clone().multiply(p.matrix)));
    }
  }
  collector.addStones({ label: "Center stones", role: "gem", gem: design.gem, model: stone, matrices });
  if (halo) {
    collector.addStones({ label: "Halo", role: "accent-gem", gem: design.accentGem, model: halo.meleeModel, matrices: melee });
  }
}
