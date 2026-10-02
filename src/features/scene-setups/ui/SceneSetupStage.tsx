"use client";

import type { SceneSetup } from "../domain/scene-setups";
import { SceneFloor } from "./SceneFloor";
import { MarblePlinth, plinthDims, QuartzCrystals, SilkDrape } from "./SceneProps";
import { useModelBounds } from "./use-model-bounds";

/** Marks set pieces (floors, props) so transparent captures can hide the set and keep the piece. */
export const SCENE_SETUP_SET_KEY = "sceneSetupSet" as const;

type SceneSetupStageProps = {
  setup: SceneSetup;
  /** The colour actually behind the canvas; reflective floors dissolve into it. */
  background: string;
};

/** Builds the chosen studio set around the jewelry model's live bounds. */
export function SceneSetupStage({ setup, background }: SceneSetupStageProps) {
  const bounds = useModelBounds();
  if (!bounds) return null;

  const plinth = setup.props.includes("plinth-marble") ? plinthDims(bounds) : null;
  const floorBounds = plinth ? { ...bounds, floorY: bounds.floorY - plinth.height } : bounds;

  return (
    <group userData={{ [SCENE_SETUP_SET_KEY]: true }}>
      <SceneFloor floor={setup.floor} bounds={floorBounds} background={background} />
      {plinth ? <MarblePlinth bounds={bounds} dims={plinth} /> : null}
      {setup.props.includes("crystals") ? <QuartzCrystals bounds={bounds} /> : null}
      {setup.props.includes("silk") ? <SilkDrape bounds={bounds} /> : null}
    </group>
  );
}
