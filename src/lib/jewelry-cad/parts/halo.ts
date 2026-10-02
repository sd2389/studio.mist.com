import * as THREE from "three";
import { offsetOutlineRound, resampleClosed, type Vec2 } from "@/lib/stones/outlines";
import { closedLength, sampleClosedEvenly, startAtPositiveX, type PathSample } from "@/lib/jewelry-cad/geometry/path2d";
import { capsuleAlongPath, sphereGeometry, sweepRings, type Ring } from "@/lib/jewelry-cad/geometry/sweep";
import { shankProfile } from "@/lib/jewelry-cad/parts/shank-profile";
import { buildMeleeModel, rayToPolygon, type StoneModel } from "@/lib/jewelry-cad/stones/stone-model";

/**
 * Halo and hidden halo, in the center stone's frame.
 *
 * A halo is a ring of melee on a metal frame that follows the center outline at a fixed
 * distance. Melee are spaced evenly with a minimum gap; each gap gets a bead on the inner
 * and outer rail that bites over both neighbours' girdles. The frame's inner rail overlaps
 * the center's prongs (or bezel wall) so the halo is carried by the head.
 *
 * The hidden halo is the same construction wrapped around the upper pavilion, tilted so
 * the melee face outward and sparkle in profile.
 */

export type HaloKind = "halo" | "hidden";

export type HaloInput = {
  center: StoneModel;
  kind: HaloKind;
  /** How far the head's metal reaches outside the girdle at girdle height (mm). */
  headReach: number;
  /** Centrelines of head metal (prong wires, bezel wall) the frame is bridged to. */
  carriers: THREE.Vector3[][];
  meleeDiameter?: number;
};

export type MeleePlacement = { matrix: THREE.Matrix4; diameter: number };

export type HaloBuild = {
  metal: THREE.BufferGeometry[];
  melee: MeleePlacement[];
  meleeModel: StoneModel;
  /** Outer reach of the frame beyond the center girdle (mm). */
  reach: number;
};

const GAP = 0.12;
const RAIL = 0.22;

function meleeSizeFor(center: StoneModel, kind: HaloKind): number {
  const w = Math.min(center.length, center.width);
  return kind === "halo" ? THREE.MathUtils.clamp(0.2 * w, 1.0, 1.8) : THREE.MathUtils.clamp(0.16 * w, 0.9, 1.5);
}

type Frame = { origin: THREE.Vector3; x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 };

/** Local frame at a curve sample: x along the curve, y the melee's table normal. */
function frameAt(sample: PathSample, height: number, tilt: number): Frame {
  const t = new THREE.Vector3(sample.tangent.x, 0, sample.tangent.z);
  const n = new THREE.Vector3(sample.normal.x, 0, sample.normal.z);
  const y = new THREE.Vector3(0, Math.cos(tilt), 0).addScaledVector(n, Math.sin(tilt)).normalize();
  const z = new THREE.Vector3().crossVectors(t, y).normalize();
  return { origin: new THREE.Vector3(sample.point.x, height, sample.point.z), x: t, y, z };
}

function frameMatrix(f: Frame): THREE.Matrix4 {
  return new THREE.Matrix4().makeBasis(f.x, f.y, f.z).setPosition(f.origin);
}

function atFrame(f: Frame, across: number, up: number): THREE.Vector3 {
  return f.origin.clone().addScaledVector(f.z, across).addScaledVector(f.y, up);
}

/** Centre-line of the melee ring, starting on the +x axis. */
function haloCurve(input: HaloInput, melee: number): { curve: Vec2[]; height: number; tilt: number } {
  const { center } = input;
  if (input.kind === "halo") {
    const offset = input.headReach + GAP + melee / 2;
    const curve = startAtPositiveX(resampleClosed(offsetOutlineRound(center.outline, offset), 256));
    return { curve, height: center.girdleBottom - 0.05, tilt: 0 };
  }
  const tilt = (52 * Math.PI) / 180;
  const depth = center.girdleBottom - center.culetY;
  const y = center.girdleBottom - 0.32 * depth;
  const section = center.sectionAt(y);
  const reach = input.headReach + GAP + (melee / 2) * Math.cos(tilt) + 0.2;
  const curve = Array.from({ length: 256 }, (_, i) => {
    const theta = (i / 256) * Math.PI * 2;
    const r = rayToPolygon(section, theta) + reach;
    return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
  });
  return { curve, height: y, tilt };
}

/** First point where a carrier line passes height y (nearest point if it never does). */
function pointAtHeight(path: THREE.Vector3[], y: number): THREE.Vector3 {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!, b = path[i + 1]!;
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return a.clone().lerp(b, (y - a.y) / (b.y - a.y));
  }
  return path.reduce((best, p) => (Math.abs(p.y - y) < Math.abs(best.y - y) ? p : best)).clone();
}

/**
 * Short bars from the head's metal into the frame — the solder joints that carry a real
 * halo. Each runs from a carrier at the frame's mid-height to the nearest frame section.
 */
function bridges(carriers: THREE.Vector3[][], frames: Frame[], midUp: number, inward: number): THREE.BufferGeometry[] {
  const midHeight = atFrame(frames[0]!, inward, midUp).y;
  return carriers.map((carrier) => {
    const guess = pointAtHeight(carrier, midHeight);
    let best = frames[0]!;
    for (const f of frames) {
      if (f.origin.distanceToSquared(guess) < best.origin.distanceToSquared(guess)) best = f;
    }
    const target = atFrame(best, inward, midUp);
    return capsuleAlongPath([pointAtHeight(carrier, target.y), target], 0.26, { radialSegments: 10, capRings: 3 });
  });
}

export function buildHalo(input: HaloInput): HaloBuild {
  const d = input.meleeDiameter ?? meleeSizeFor(input.center, input.kind);
  const meleeModel = buildMeleeModel(d);
  const { curve, height, tilt } = haloCurve(input, d);
  const count = Math.max(8, Math.floor(closedLength(curve) / (d + GAP)));

  // A halo's melee tables sit just under the center's girdle; the hidden halo's melee are
  // centred on their curve. The frame holds the pavilions either way.
  const originY = tilt === 0 ? height - meleeModel.tableY : height;
  const melee = sampleClosedEvenly(curve, count).map((s) => ({
    matrix: frameMatrix(frameAt(s, originY, tilt)),
    diameter: d,
  }));

  const frameTop = meleeModel.girdleBottom - 0.02;
  const frameBottom = meleeModel.culetY - 0.22;
  const profile = shankProfile("flat", d + 2 * RAIL, frameTop - frameBottom);
  const frames = sampleClosedEvenly(curve, 160).map((s) => frameAt(s, originY, tilt));
  const rings: Ring[] = frames.map((f) => profile.map((p) => atFrame(f, p.x, frameBottom + p.z)));
  const metal: THREE.BufferGeometry[] = [sweepRings(rings, { closed: true })];
  metal.push(...bridges(input.carriers, frames, (frameTop + frameBottom) / 2, (d / 2 + RAIL) * 0.55));

  const bead = Math.max(0.19, 0.2 * d);
  for (const s of sampleClosedEvenly(curve, count, 0.5)) {
    const f = frameAt(s, originY, tilt);
    for (const side of [-1, 1]) {
      metal.push(sphereGeometry(atFrame(f, side * (d / 2) * 0.8, frameTop + bead * 0.25), bead, 12, 7));
    }
  }
  return { metal, melee, meleeModel, reach: input.headReach + GAP + d + RAIL };
}
