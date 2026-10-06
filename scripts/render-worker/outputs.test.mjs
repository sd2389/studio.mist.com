import { describe, expect, it } from "vitest";
import { SPIN_VIEWER_NAME, spinFrameNames } from "../../src/features/render/harness/spin-files";
import { spinFileNames } from "./outputs.mjs";

describe("spinFileNames", () => {
  // The sink takes only these names, so they must be the ones the harness posts.
  it("names a spin's files as its page posts them: the frames in turning order, then the viewer", () => {
    for (const spec of [{ frames: 72, format: "jpeg" }, { frames: 3, format: "png" }, { frames: 144, format: "jpeg" }, { frames: 1000, format: "png" }]) {
      expect(spinFileNames(spec)).toEqual([...spinFrameNames(spec), SPIN_VIEWER_NAME]);
    }
    expect(spinFileNames({ frames: 2, format: "jpeg" })).toEqual(["frame_001.jpg", "frame_002.jpg", "spin.html"]);
  });
});
