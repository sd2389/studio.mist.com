import * as THREE from "three";
import { buildBandStones, channelDiameterFor, eternityDiameterFor, paveDiameterFor, type BandStoneKind } from "@/lib/jewelry-cad/parts/band-stones";
import { buildBezelHead, bezelWallFor } from "@/lib/jewelry-cad/parts/bezel-head";
import { buildHalo } from "@/lib/jewelry-cad/parts/halo";
import { buildProngHead, prongRadiusFor, type HeadBuild } from "@/lib/jewelry-cad/parts/prong-head";
import { buildShank, shankOuterRadius, shankSurface, type CathedralShoulders, type ShankParams } from "@/lib/jewelry-cad/parts/shank";
import type { PieceCollector } from "@/lib/jewelry-cad/pieces/collector";
import { getCadGem } from "@/lib/jewelry-cad/stones/gem-types";
import { buildMeleeModel, buildStoneModel, type StoneModel } from "@/lib/jewelry-cad/stones/stone-model";
import { usSizeToInnerDiameterMm } from "@/lib/jewelry-cad/units/ring-size";
import type { HeadStyle, JewelryDesign } from "@/lib/jewelry-cad/types";

/**
 * Ring assembly (ring frame: finger along z, top of the ring +y, mm).
 *
 * Order matters: the center stone decides how tall the head is, the head decides where
 * the cathedral shoulders peak and where pavé may start, and only then is the shank swept.
 * Stones sit at a real height — the culet clears the band by `clearance` — and every
 * metal part is joined to another (prong feet in the base ring, the ring on the band).
 */

const TOP = Math.PI / 2;
const SIDE_STONE_GAP = 0.35;
const SIDE_STONE_WEIGHT = 0.3;

export type RingBuildInfo = { bandThickness: number };

function clearanceFor(stone: StoneModel): number {
  return Math.max(0.45, 0.07 * Math.min(stone.length, stone.width));
}

/** Stone frame → ring frame for a head standing on the band at angle φ. */
export function headMatrix(phi: number, girdleRadius: number): THREE.Matrix4 {
  const lift = new THREE.Matrix4().makeTranslation(Math.cos(phi) * girdleRadius, Math.sin(phi) * girdleRadius, 0);
  const tilt = new THREE.Matrix4().makeRotationZ(phi - TOP);
  const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2); // stone length runs along the finger
  return lift.multiply(tilt).multiply(turn);
}

function buildHead(stone: StoneModel, style: HeadStyle, seatY: number): HeadBuild {
  return style === "bezel" ? buildBezelHead({ stone, seatY }) : buildProngHead({ stone, style, seatY });
}

/** How far the head's metal reaches beyond the girdle at girdle height. */
function headReach(stone: StoneModel, style: HeadStyle): number {
  if (style === "bezel") return bezelWallFor(stone);
  const r = prongRadiusFor(stone, style === "6-prong" ? 6 : 4);
  return 1.7 * r;
}

function bandStoneKind(design: JewelryDesign): BandStoneKind | null {
  if (design.bandStones === "none") return null;
  return design.bandStones.startsWith("eternity") ? "eternity" : (design.bandStones as BandStoneKind);
}

/** Band stones need their pavilions inside the metal: thicken the band if they would poke through. */
function bandThicknessFor(design: JewelryDesign, width: number): number {
  const kind = bandStoneKind(design);
  if (!kind) return design.bandThickness;
  const d = kind === "eternity" ? eternityDiameterFor(width) : kind === "channel" ? channelDiameterFor(width) : paveDiameterFor(width);
  const melee = buildMeleeModel(d);
  const culetDepth = 0.04 + melee.girdleTop - melee.culetY;
  return Math.max(design.bandThickness, culetDepth + 0.4);
}

function cathedralFor(stone: StoneModel, girdleY: number, plainTop: number, clearance: number, style: HeadStyle): CathedralShoulders {
  const depth = stone.girdleBottom - stone.culetY;
  const archY = girdleY + stone.girdleBottom - 0.45 * depth;
  const peakX = stone.width * 0.3 + headReach(stone, style) * 0.6;
  const peak = Math.atan2(peakX, archY);
  return {
    height: Math.max(0.4, Math.hypot(peakX, archY) - plainTop),
    peak,
    spread: peak + 0.55,
    centerRise: Math.max(0, clearance - 0.2),
  };
}

/** `rim`: how far outside the girdle a neighbouring stone must stay (prongs interleave; a halo does not). */
type CenterPlan = { stone: StoneModel; head: HeadBuild; matrix: THREE.Matrix4; rim: number };

/** The center stone and the height of its girdle: the culet clears the plain band by `clearance`. */
function centerStoneFor(design: JewelryDesign, plainTop: number): { stone: StoneModel; girdleY: number; clearance: number } {
  const stone = buildStoneModel(design.cut, design.carat, getCadGem(design.gem).sizingGravity);
  const clearance = clearanceFor(stone);
  return { stone, clearance, girdleY: plainTop + clearance - stone.culetY };
}

function placeCenter(design: JewelryDesign, collector: PieceCollector, params: ShankParams, stone: StoneModel, girdleY: number): CenterPlan {
  const seatRadius = shankOuterRadius(params, TOP, 0);
  const head = buildHead(stone, design.head, seatRadius - girdleY);
  const matrix = headMatrix(TOP, girdleY);
  collector.addMetal("Heads", head.parts, matrix);
  collector.addProngs(head.prongs, matrix);
  collector.addStones({ label: "Center stone", role: "gem", gem: design.gem, model: stone, matrices: [matrix] });

  const reach = headReach(stone, design.head);
  let rim = reach * 0.5;
  if (design.halo !== "none") {
    const halo = buildHalo({ center: stone, kind: design.halo, headReach: reach, carriers: head.carriers });
    collector.addMetal("Heads", halo.metal, matrix);
    collector.addStones({
      label: design.halo === "halo" ? "Halo" : "Hidden halo",
      role: "accent-gem",
      gem: design.accentGem,
      model: halo.meleeModel,
      matrices: halo.melee.map((m) => matrix.clone().multiply(m.matrix)),
    });
    if (design.halo === "halo") rim = halo.reach;
  }
  return { stone, head, matrix, rim };
}

function girdlePoints(stone: StoneModel, reach: number, matrix: THREE.Matrix4): THREE.Vector3[] {
  return stone.outline.points
    .filter((_, i) => i % 2 === 0)
    .map((p) => {
      const k = 1 + reach / Math.max(1e-6, Math.hypot(p.x, p.z));
      return new THREE.Vector3(p.x * k, 0, p.z * k).applyMatrix4(matrix);
    });
}

function minDistance(a: THREE.Vector3[], b: THREE.Vector3[]): number {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, p.distanceToSquared(q));
  return Math.sqrt(best);
}

function sideMatrix(side: StoneModel, params: ShankParams, offset: number): THREE.Matrix4 {
  const phi = TOP - offset;
  return headMatrix(phi, shankOuterRadius(params, phi, 0) + clearanceFor(side) - side.culetY);
}

/**
 * Angle from the top where a side stone (on the +x side) clears the center and its halo:
 * its rim must lie wholly beyond the center's along the band, and no closer than the gap.
 * (Distance alone is not enough — a small rim nested inside a big one is "far" from it.)
 */
function sideStoneOffset(center: CenterPlan, side: StoneModel, params: ShankParams): number {
  const centerRim = girdlePoints(center.stone, center.rim, center.matrix);
  const centerEdge = Math.max(...centerRim.map((p) => p.x));
  const sideReach = headReach(side, "4-prong") * 0.5;
  let lo = 0.02;
  let hi = 1.3;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const rim = girdlePoints(side, sideReach, sideMatrix(side, params, mid));
    const tooClose = Math.min(...rim.map((p) => p.x)) < centerEdge || minDistance(centerRim, rim) < SIDE_STONE_GAP;
    if (tooClose) lo = mid;
    else hi = mid;
  }
  return hi;
}

function placeSideStones(design: JewelryDesign, collector: PieceCollector, params: ShankParams, center: CenterPlan): number {
  const side = buildStoneModel(design.cut, design.carat * SIDE_STONE_WEIGHT, getCadGem(design.accentGem).sizingGravity);
  const offset = sideStoneOffset(center, side, params);
  const style: HeadStyle = design.head === "bezel" ? "bezel" : "basket";
  const matrices: THREE.Matrix4[] = [];
  for (const sign of [1, -1]) {
    const phi = TOP - sign * offset;
    const girdleRadius = shankOuterRadius(params, phi, 0) + clearanceFor(side) - side.culetY;
    const head = buildHead(side, style, shankOuterRadius(params, phi, 0) - girdleRadius);
    const matrix = headMatrix(phi, girdleRadius);
    collector.addMetal("Heads", head.parts, matrix);
    collector.addProngs(head.prongs, matrix);
    matrices.push(matrix);
  }
  collector.addStones({ label: "Side stones", role: "accent-gem", gem: design.accentGem, model: side, matrices });
  const r = shankOuterRadius(params, TOP - offset, 0);
  return offset + Math.asin(Math.min(0.95, (side.width / 2 + headReach(side, style) + 0.3) / r));
}

function placeBandStones(design: JewelryDesign, collector: PieceCollector, params: ShankParams, startAngle: number): void {
  const kind = bandStoneKind(design);
  if (!kind) return;
  const eternity = kind === "eternity";
  const endAngle = design.bandStones === "eternity-full" ? Math.PI : eternity ? 1.66 : 1.22;
  const build = buildBandStones({
    shank: shankSurface(params),
    kind,
    startAngle: eternity ? 0 : startAngle,
    endAngle,
    diameter: eternity ? eternityDiameterFor(params.width) : undefined,
  });
  collector.addMetal("Metal 1", build.metal);
  const label = eternity ? "Eternity stones" : kind === "channel" ? "Channel stones" : "Pavé";
  collector.addStones({
    label,
    role: eternity ? "gem" : "accent-gem",
    gem: eternity ? design.gem : design.accentGem,
    model: build.model,
    matrices: build.stones,
  });
}

export function buildRingPiece(design: JewelryDesign, collector: PieceCollector): RingBuildInfo {
  const innerRadius = usSizeToInnerDiameterMm(design.ringSize) / 2;
  const hasCenter = design.centerStone;
  const params: ShankParams = {
    innerRadius,
    width: design.bandWidth,
    thickness: bandThicknessFor(design, design.bandWidth),
    profile: design.profile,
    taper: hasCenter ? design.taper : 0,
    cathedral: null,
  };
  const plainTop = shankOuterRadius(params, TOP, 0);

  let bandStart = 0;
  if (hasCenter) {
    const { stone, girdleY, clearance } = centerStoneFor(design, plainTop);
    // Cathedral arches rise from the band to the head; side stones would sit on them.
    if (design.cathedral && !design.sideStones) params.cathedral = cathedralFor(stone, girdleY, plainTop, clearance, design.head);
    const center = placeCenter(design, collector, params, stone, girdleY);
    const top = shankOuterRadius(params, TOP, 0);
    bandStart = Math.asin(Math.min(0.95, (center.head.footprint.z + 0.3) / top));
    if (design.sideStones) bandStart = placeSideStones(design, collector, params, center);
  }
  placeBandStones(design, collector, params, bandStart);
  collector.addMetal("Metal 1", [buildShank(params).geometry]);
  return { bandThickness: params.thickness };
}
