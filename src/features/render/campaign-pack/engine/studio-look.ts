import * as THREE from "three";
import { readViewportBackdrop, WHITE_BACKDROP, type ExportBackdrop } from "@/lib/export-backdrop";
import { getHiresRefs } from "@/stores/hires-export-store";
import { sceneHasStudioSet } from "../../lib/stage-visibility";
import type { PackBackground } from "../domain/types";
import { sceneHasTracedGems } from "./gem-scope";

export type ResolvedBackdrop = { backdrop: ExportBackdrop; label: string };

function describeBackdrop(backdrop: ExportBackdrop): string {
  if (backdrop.kind === "color") return backdrop.color;
  if (backdrop.kind === "image") return "scene image";
  return backdrop.kind === "linear-gradient" ? "scene linear gradient" : "scene radial gradient";
}

/** The stage's current background as a flat backdrop: solid colour, CSS gradient or image. */
export function readSceneBackdrop(): ExportBackdrop | null {
  const refs = getHiresRefs();
  if (!refs) return null;
  const background = refs.scene.background;
  if (background instanceof THREE.Color) return { kind: "color", color: `#${background.getHexString()}` };
  return readViewportBackdrop(refs.gl.domElement);
}

export type StudioLook = { backdrop: ExportBackdrop | null; hasStudioSet: boolean; hasTracedGems: boolean };

/** What the studio shows right now: backdrop, whether a styled set is on stage, traced gems. */
export function readStudioLook(): StudioLook {
  const scene = getHiresRefs()?.scene;
  return {
    backdrop: readSceneBackdrop(),
    hasStudioSet: sceneHasStudioSet(scene),
    hasTracedGems: sceneHasTracedGems(scene),
  };
}

/** What a pack's JPGs, spins and videos are flattened onto, and how its README names it. */
export function resolvePackBackdrop(background: PackBackground): ResolvedBackdrop {
  if (background.kind === "custom") {
    return { backdrop: { kind: "color", color: background.color }, label: background.color.toUpperCase() };
  }
  if (background.kind === "scene") {
    const scene = readSceneBackdrop();
    if (scene) return { backdrop: scene, label: describeBackdrop(scene) };
  }
  return { backdrop: WHITE_BACKDROP, label: "#FFFFFF (white)" };
}
