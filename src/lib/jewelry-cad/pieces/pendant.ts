import * as THREE from "three";
import { capsuleAlongPath, tubeAlongLoop } from "@/lib/jewelry-cad/geometry/sweep";
import { buildBezelHead } from "@/lib/jewelry-cad/parts/bezel-head";
import { buildHalo } from "@/lib/jewelry-cad/parts/halo";
import { buildProngHead, prongRadiusFor, type HeadBuild } from "@/lib/jewelry-cad/parts/prong-head";
import type { PieceCollector } from "@/lib/jewelry-cad/pieces/collector";
import { getCadGem } from "@/lib/jewelry-cad/stones/gem-types";
import { outlineAt, buildStoneModel } from "@/lib/jewelry-cad/stones/stone-model";
import type { JewelryDesign } from "@/lib/jewelry-cad/types";

/**
 * Halo pendant with a bail. Built in the stone frame, then hung facing +z with the
 * stone's length vertical — a pear or heart points down, the bail sits above the round
 * end. The bail loop stands perpendicular to the face so the chain runs left–right
 * through it and the pendant faces forward when worn.
 */

const BAIL_TUBE = 0.45;

/** Stone frame → pendant frame: length (+x) hangs down, table faces the viewer. */
function hangMatrix(): THREE.Matrix4 {
  const down = new THREE.Vector3(0, -1, 0);
  const face = new THREE.Vector3(0, 0, 1);
  const across = new THREE.Vector3().crossVectors(down, face);
  return new THREE.Matrix4().makeBasis(down, face, across);
}

function bailLoop(topX: number, y: number): THREE.Vector3[] {
  const a = 2.4; // along the hang direction
  const b = 1.35; // front-to-back
  const cx = topX - a * 0.72;
  return Array.from({ length: 64 }, (_, i) => {
    const t = (i / 64) * Math.PI * 2;
    return new THREE.Vector3(cx + Math.cos(t) * a, y + Math.sin(t) * b, 0);
  });
}

export function buildPendantPiece(design: JewelryDesign, collector: PieceCollector): void {
  const stone = buildStoneModel(design.cut, design.carat, getCadGem(design.gem).sizingGravity);
  const seatY = stone.culetY - 0.35;
  const head: HeadBuild =
    design.head === "bezel"
      ? buildBezelHead({ stone, seatY })
      : buildProngHead({ stone, style: design.head === "6-prong" ? "6-prong" : "4-prong", seatY });
  const matrix = hangMatrix();
  collector.addMetal("Heads", head.parts, matrix);
  collector.addProngs(head.prongs, matrix);
  collector.addStones({ label: "Center stone", role: "gem", gem: design.gem, model: stone, matrices: [matrix] });

  const prongReach = 1.7 * prongRadiusFor(stone, 4);
  const back = outlineAt(stone, Math.PI).point.x; // the round end, where the bail goes
  let top = back - 1.2;
  let bailY = 0;
  if (design.halo !== "none") {
    const halo = buildHalo({ center: stone, kind: design.halo, headReach: prongReach, carriers: head.carriers });
    collector.addMetal("Heads", halo.metal, matrix);
    collector.addStones({
      label: "Halo",
      role: "accent-gem",
      gem: design.accentGem,
      model: halo.meleeModel,
      matrices: halo.melee.map((m) => matrix.clone().multiply(m.matrix)),
    });
    if (design.halo === "halo") {
      top = back - halo.reach + 0.25;
      bailY = stone.girdleBottom - 0.35;
    }
  }
  const bail = [tubeAlongLoop(bailLoop(top, bailY), BAIL_TUBE, 12)];
  if (design.halo !== "halo" && head.prongs.length > 0) {
    // No halo frame to carry the bail: bridge it to the prong nearest the top.
    const anchor = head.prongs.reduce((best, p) => (p.girdlePoint.x < best.girdlePoint.x ? p : best));
    const joint = anchor.path[Math.floor(anchor.path.length * 0.55)]!;
    bail.push(capsuleAlongPath([new THREE.Vector3(top + 0.2, bailY, 0), joint.clone()], BAIL_TUBE * 0.9));
  }
  collector.addMetal("Metal 1", bail, matrix);
}
