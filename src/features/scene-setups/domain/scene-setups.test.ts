import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE_SETUP_ID,
  isSceneSetupId,
  resolveSceneSetup,
  SCENE_SETUPS,
  sceneSetupBackground,
} from "./scene-setups";

describe("scene setups", () => {
  it("has unique ids and a default first entry", () => {
    const ids = SCENE_SETUPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SCENE_SETUPS[0]!.id).toBe(DEFAULT_SCENE_SETUP_ID);
  });

  it("falls back to the default sweep for unknown or missing ids", () => {
    expect(resolveSceneSetup(undefined).id).toBe(DEFAULT_SCENE_SETUP_ID);
    expect(resolveSceneSetup("retired-scene").id).toBe(DEFAULT_SCENE_SETUP_ID);
    expect(resolveSceneSetup("black-mirror").id).toBe("black-mirror");
  });

  it("lets only the default sweep follow the lighting preset's backdrop", () => {
    for (const setup of SCENE_SETUPS) {
      if (setup.id === DEFAULT_SCENE_SETUP_ID) expect(sceneSetupBackground(setup)).toBeNull();
      else expect(sceneSetupBackground(setup)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("turns star glints on by default only for dark sets", () => {
    const sparkling = SCENE_SETUPS.filter((s) => s.starGlints).map((s) => s.id);
    expect(sparkling).toEqual(["black-mirror", "still-water", "crystal-garden"]);
  });

  it("recognises valid ids only", () => {
    expect(isSceneSetupId("still-water")).toBe(true);
    expect(isSceneSetupId("still water")).toBe(false);
    expect(isSceneSetupId(3)).toBe(false);
  });
});
