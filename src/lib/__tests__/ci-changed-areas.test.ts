import { describe, expect, it } from "vitest";
import { changedAreas, harnessFiles } from "../../../scripts/ci/changed-areas.mjs";

describe("CI change detection", () => {
  const rendered = harnessFiles();

  it("follows the render harness's imports to everything it draws", () => {
    // Reached only through other modules: the stage a scene setup puts the jewelry on, and the gem.
    expect(rendered.has("src/features/scene-setups/ui/SceneSetupStage.tsx")).toBe(true);
    expect(rendered.has("src/components/DiamondGem.tsx")).toBe(true);
    // Marketing pages are not part of the harness.
    expect(rendered.has("src/app/pricing/page.tsx")).toBe(false);
  });

  it("follows the harness's worker-only modes, which the public app never loads", () => {
    expect(rendered.has("src/app/render-harness/page.worker.tsx")).toBe(true);
    expect(rendered.has("src/features/render/harness/render-images.ts")).toBe(true);
    expect(rendered.has("src/features/render/harness/cameras.ts")).toBe(true);
    expect(rendered.has("src/features/render/harness/render-frames.ts")).toBe(true);
    // The studio's own video camera paths, which server videos move on.
    expect(rendered.has("src/lib/video-camera-path.ts")).toBe(true);
  });

  it.each([
    [["README.md", "docs/QUALITY-GATES.md"], { web: false, backend: false, render: false }],
    [["backend/app/main.py"], { web: false, backend: true, render: false }],
    [["src/app/pricing/page.tsx"], { web: true, backend: false, render: false }],
    [["src/components/DiamondGem.tsx"], { web: true, backend: false, render: true }],
    [["tests/goldens/studio.png"], { web: true, backend: false, render: true }],
    [["tests/goldens/fixtures/export-still.json"], { web: true, backend: false, render: true }],
    [["src/app/render-harness/page.worker.tsx"], { web: true, backend: false, render: true }],
    // The export goldens capture through the render worker's sink.
    [["scripts/render-worker/sink.mjs"], { web: true, backend: false, render: true }],
    [[".github/workflows/ci.yml"], { web: true, backend: true, render: true }],
    [["package-lock.json"], { web: true, backend: true, render: true }],
  ])("%j needs %j", (paths, areas) => {
    expect(changedAreas(paths, rendered)).toEqual(areas);
  });
});
