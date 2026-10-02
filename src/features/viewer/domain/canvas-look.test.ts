import { describe, expect, it } from "vitest";
import { LIGHTING_PRESETS } from "@/lib/viewer-lighting";
import type { SceneSettingsBuckets } from "@/lib/slot-materials/model-config";
import { resolveCanvasLook, type CanvasLookInput } from "./canvas-look";

const EMPTY_SETTINGS: SceneSettingsBuckets = {
  "ENVIRONMENT-METAL": null,
  "ENVIRONMENT-GEM": null,
  GROUND: null,
  BACKGROUND: null,
  VJSON: null,
};

function input(sceneSettings: Partial<SceneSettingsBuckets> = {}): CanvasLookInput {
  return {
    lighting: "studio",
    sceneSettings: { ...EMPTY_SETTINGS, ...sceneSettings },
    metalEnvironment: null,
    gemEnvironment: null,
    backgroundItem: null,
    groundItem: null,
  };
}

describe("resolveCanvasLook", () => {
  it("follows the lighting preset on the default studio sweep", () => {
    const look = resolveCanvasLook(input());
    expect(look.metal.file).toBe(LIGHTING_PRESETS.studio.hdr);
    expect(look.gem.file).toBeNull();
    expect(look.gem.tent).toBe(LIGHTING_PRESETS.studio.gemTent);
    expect(look.background).toBe(LIGHTING_PRESETS.studio.background);
    expect(look.stage.floor.kind).toBe("shadow");
    expect(look.exposure).toBeCloseTo(LIGHTING_PRESETS.studio.exposure);
  });

  it("lets a studio scene bring its own backdrop, tent and exposure", () => {
    const look = resolveCanvasLook(input({ sceneSetup: "black-mirror" }));
    expect(look.background).toBe("#0B0C0F");
    expect(look.gem.tent).toBe("contrast");
    expect(look.stage.floor.kind).toBe("mirror");
    expect(look.exposure).toBeGreaterThan(LIGHTING_PRESETS.studio.exposure);
  });

  it("applies the user's exposure on top of the scene's", () => {
    const base = resolveCanvasLook(input({ sceneSetup: "still-water" })).exposure;
    const boosted = resolveCanvasLook(input({ sceneSetup: "still-water", advanced: { exposure: 1.5 } })).exposure;
    expect(boosted).toBeCloseTo(base * 1.5);
  });

  it("drops the contact shadow when the ground is set to none", () => {
    const look = resolveCanvasLook(input({ GROUND: "ground-none" }));
    expect(look.stage.floor).toEqual({ kind: "shadow", opacity: 0 });
  });
});
