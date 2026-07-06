import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Invariant: the export/render feature must never import viewer quality
 * degradation. Exports are always full fidelity regardless of preview setting.
 */
describe("export parity invariant", () => {
  it("render feature does not depend on viewer-quality", () => {
    const dir = path.join(process.cwd(), "src/features/render");
    const files = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
      .map((e) => path.join(e.parentPath, e.name));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const rel = path.relative(dir, f);
      expect(src.includes("viewer-quality"), `${rel} must not import viewer-quality`).toBe(false);
    }
  });

  it("downloadPng uses full-fidelity offscreen path, not live canvas toDataURL", () => {
    const sidebarPath = path.join(
      process.cwd(),
      "src/features/viewer/ui/StudioSidebar.tsx",
    );
    const src = readFileSync(sidebarPath, "utf8");

    // Extract the downloadPng function body by slicing between its declaration
    // and the next top-level "async function" / "function" declaration.
    const start = src.indexOf("async function downloadPng()");
    expect(start, "downloadPng function must exist in StudioSidebar").toBeGreaterThan(-1);

    // Find the closing brace by scanning for the next peer function declaration.
    const afterStart = src.indexOf("\n  async function ", start + 1);
    const afterStart2 = src.indexOf("\n  function ", start + 1);
    const endMarker =
      afterStart === -1
        ? afterStart2
        : afterStart2 === -1
          ? afterStart
          : Math.min(afterStart, afterStart2);
    const fnBody = endMarker === -1 ? src.slice(start) : src.slice(start, endMarker);

    // Must call the offscreen renderAtResolution path.
    expect(fnBody.includes("renderAtResolution"), "downloadPng must call renderAtResolution").toBe(
      true,
    );

    // Must NOT call toDataURL on the live canvas (the old degraded path).
    expect(
      fnBody.includes("toDataURL"),
      "downloadPng must not call toDataURL on the live canvas",
    ).toBe(false);

    // Must NOT call captureFrameToDataUrl (the old screenshot-store path).
    expect(
      fnBody.includes("captureFrameToDataUrl"),
      "downloadPng must not use the live screenshot store",
    ).toBe(false);
  });
});
