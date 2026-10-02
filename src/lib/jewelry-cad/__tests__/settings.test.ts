import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildJewelry, CENTRE_STONE_CUTS, getPreset, splitIslands, usSizeToInnerDiameterMm, type JewelryDesign } from "@/lib/jewelry-cad";
import { buildProngHead, prongRadiusFor, type ProngHeadStyle } from "@/lib/jewelry-cad/parts/prong-head";
import { buildStoneModel, outlineAt } from "@/lib/jewelry-cad/stones/stone-model";
import { bounds, distanceToPolyline, metalComponents, partBySlot } from "./helpers";

const SEAT = 0.3; // fraction of the prong radius the girdle bites into the wire

describe("prong heads (stone frame)", () => {
  const styles: ProngHeadStyle[] = ["4-prong", "6-prong", "basket"];
  const cases = CENTRE_STONE_CUTS.flatMap((cut) => styles.map((style) => [cut.id, style] as const));

  it.each(cases)("%s / %s: every prong grips the girdle and curls over the crown", (cut, style) => {
    const stone = buildStoneModel(cut, 1, 3.52);
    const head = buildProngHead({ stone, style, seatY: stone.culetY - 0.5 });
    const r = prongRadiusFor(stone, style === "6-prong" ? 6 : 4);
    expect(head.prongs).toHaveLength(style === "6-prong" ? 6 : 4);
    for (const prong of head.prongs) {
      // The girdle edge sits inside the wire by the seat depth: in contact, not floating.
      const d = distanceToPolyline(prong.girdlePoint, prong.path);
      expect(d).toBeLessThan(r - SEAT * r * 0.5);
      expect(d).toBeGreaterThan(r * 0.4);

      // The tip ends inside the girdle outline, resting on (not buried in) the crown.
      const tip = prong.path[prong.path.length - 1]!;
      const theta = Math.atan2(tip.z, tip.x);
      expect(Math.hypot(tip.x, tip.z)).toBeLessThan(Math.hypot(outlineAt(stone, theta).point.x, outlineAt(stone, theta).point.z));
      const crown = stone.topAt(tip.x, tip.z);
      expect(crown).not.toBeNull();
      expect(tip.y - prong.tipRadius).toBeGreaterThan(crown! - 0.12);
      expect(tip.y - prong.tipRadius).toBeLessThan(crown! + 0.12);

      // Below the girdle the wire hugs the pavilion instead of standing off it.
      expect(prong.path[0]!.y).toBeLessThan(stone.culetY);
    }
  });
});

const RING_PRESETS = ["solitaire", "halo", "pave", "three-stone", "bezel"] as const;

function ringWith(id: (typeof RING_PRESETS)[number], patch: Partial<JewelryDesign> = {}) {
  return buildJewelry({ ...getPreset(id).design, ...patch });
}

describe("assembled rings", () => {
  it.each(RING_PRESETS)("%s: center stone sits at a real height above the band", (id) => {
    const built = ringWith(id);
    const design = built.design;
    const gem = bounds(partBySlot(built.parts, "Gem 1"));
    const bandTop = usSizeToInnerDiameterMm(design.ringSize) / 2 + design.bandThickness;
    // Culet clears the band (never pokes into the finger), the table is not floating off.
    expect(gem.min.y).toBeGreaterThan(bandTop + 0.15);
    expect(gem.min.y).toBeLessThan(bandTop + 1.2);
    expect(built.specs.ring!.settingHeightMm).toBeGreaterThan(4);
    expect(built.specs.ring!.settingHeightMm).toBeLessThan(10);
    // Centred on the top of the ring.
    expect(Math.abs((gem.min.x + gem.max.x) / 2)).toBeLessThan(0.05);
    expect(Math.abs((gem.min.z + gem.max.z) / 2)).toBeLessThan(0.05);
  });

  it.each(RING_PRESETS)("%s: no floating metal — every part is joined to the band", (id) => {
    expect(metalComponents(ringWith(id).parts)).toBe(1);
  }, 30_000);

  it.each([
    ["cathedral", { cathedral: true, head: "basket" }],
    ["hidden halo", { halo: "hidden", head: "4-prong" }],
    ["channel band", { bandStones: "channel" }],
    ["half eternity", { centerStone: false, bandStones: "eternity-half" }],
    ["pear halo", { cut: "pear", halo: "halo", head: "4-prong" }],
    ["princess bezel", { cut: "princess", head: "bezel" }],
  ] as const)("%s: assembles without floating parts", (_name, patch) => {
    expect(metalComponents(ringWith("solitaire", patch as Partial<JewelryDesign>).parts)).toBe(1);
  }, 30_000);

  it("puts prongs on the center girdle in the assembled ring", () => {
    const built = ringWith("solitaire");
    expect(built.prongs).toHaveLength(6);
    for (const p of built.prongs) {
      expect(distanceToPolyline(p.girdlePoint, p.path)).toBeLessThan(p.radius);
    }
    // Girdle points lie on the stone: within the gem's bounds.
    const gem = bounds(partBySlot(built.parts, "Gem 1")).expandByScalar(0.05);
    for (const p of built.prongs) expect(gem.containsPoint(p.girdlePoint)).toBe(true);
  });

  it("sets elongated stones north–south (length along the finger)", () => {
    const built = ringWith("solitaire", { cut: "oval" });
    const gem = bounds(partBySlot(built.parts, "Gem 1"));
    const size = gem.getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.x * 1.25);
  });

  it("fits pavé melee to the band and keeps their pavilions inside the metal", () => {
    const built = ringWith("pave");
    const pave = built.specs.stones.find((s) => s.label === "Pavé")!;
    expect(pave.count).toBeGreaterThanOrEqual(10);
    expect(pave.lengthMm).toBeLessThan(built.design.bandWidth);
    const inner = usSizeToInnerDiameterMm(built.design.ringSize) / 2;
    const outer = inner + built.specs.ring!.bandThicknessMm;
    // Each melee's culet stays inside the metal but well clear of the finger.
    for (const island of splitIslands(partBySlot(built.parts, "Accent 1").geometry)) {
      const p = island.getAttribute("position");
      let lowest = Infinity;
      let highest = 0;
      for (let i = 0; i < p.count; i++) {
        const r = Math.hypot(p.getX(i), p.getY(i));
        lowest = Math.min(lowest, r);
        highest = Math.max(highest, r);
      }
      expect(lowest).toBeGreaterThan(inner + 0.3);
      expect(lowest).toBeLessThan(outer);
      expect(highest).toBeGreaterThan(outer); // the crown stands proud of the band
    }
  });
});

describe("studs and pendant", () => {
  it.each(["studs", "pendant"] as const)("%s: no floating metal", (id) => {
    expect(metalComponents(buildJewelry(getPreset(id).design).parts)).toBe(1 + (id === "studs" ? 1 : 0));
  }, 30_000);

  it("studs face forward on 10 mm posts", () => {
    const built = buildJewelry(getPreset("studs").design);
    const metal = bounds(partBySlot(built.parts, "Metal 1"));
    expect(metal.max.z - metal.min.z).toBeGreaterThan(10);
    const gem = bounds(partBySlot(built.parts, "Gem 1"));
    expect(gem.max.z).toBeGreaterThan(metal.max.z);
  });
});
