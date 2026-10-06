import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const drawn = vi.hoisted(() => [] as number[]);
vi.mock("@react-three/fiber", () => ({ advance: (timestamp: number) => drawn.push(timestamp) }));

const { tickFixedClock } = await import("./useFixedClockWarmup");

/** The browser's animation frames, run one at a time by the test. */
const animationFrames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function runAnimationFrame() {
  const due = [...animationFrames.values()];
  animationFrames.clear();
  for (const callback of due) callback(performance.now());
}

beforeEach(() => {
  drawn.length = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFrames.set(nextFrameId, callback);
    return nextFrameId++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => animationFrames.delete(id));
});

afterEach(() => {
  animationFrames.clear();
  vi.unstubAllGlobals();
});

describe("tickFixedClock", () => {
  it("draws the stage every animation frame on the fixed clock, from the frame it is given, until stopped", () => {
    const stop = tickFixedClock(61);
    expect(drawn).toEqual([]);
    runAnimationFrame();
    runAnimationFrame();
    runAnimationFrame();
    stop();
    runAnimationFrame();

    // Frame N at N / 60 s.
    expect(drawn.map((seconds) => seconds * 60)).toEqual([61, 62, 63].map((frame) => expect.closeTo(frame, 9)));
    expect(animationFrames.size).toBe(0);
  });
});
