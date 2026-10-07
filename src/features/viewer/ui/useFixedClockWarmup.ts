"use client";

import { advance } from "@react-three/fiber";
import { useEffect } from "react";
import { getHiresRefs } from "@/stores/hires-export-store";

/** Clock step between frames: frame N is drawn at N / 60 s, whatever the wall clock says. */
const FRAME_SECONDS = 1 / 60;

/**
 * Keeps a `frameloop="never"` canvas drawing on the fixed clock, a frame every animation frame
 * from frame `first`, until the function it returns is called: for work that waits on what the
 * stage's frames do, such as the Campaign Pack's environment probe, which the live environment
 * bridge answers from its frame callback.
 */
export function tickFixedClock(first: number): () => void {
  let frame = first;
  let raf = 0;
  const tick = () => {
    advance(frame * FRAME_SECONDS);
    frame += 1;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/**
 * For a canvas on `frameloop="never"` (the render harness): once the scene has mounted, so
 * everything it suspends on (model, environments) has loaded, draws exactly `frames` frames on
 * a fixed clock, then stops and calls `onSettled`. What the canvas holds then depends on neither
 * load speed nor the wall clock. `onSettled` must keep its identity; a new one starts over.
 */
export function useFixedClockWarmup(enabled: boolean, frames: number, onSettled: () => void): void {
  useEffect(() => {
    if (!enabled) return;

    let drawn = 0;
    let raf = 0;

    const tick = () => {
      if (getHiresRefs()) {
        drawn += 1;
        advance(drawn * FRAME_SECONDS);
        if (drawn >= frames) {
          onSettled();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, frames, onSettled]);
}
