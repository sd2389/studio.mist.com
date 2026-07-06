import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Invariant: the export/render feature must never import viewer quality
 * degradation. Exports are always full fidelity regardless of preview setting.
 */
describe("export parity invariant", () => {
  it("render feature does not depend on viewer-quality", () => {
    const dir = path.join(process.cwd(), "src/features/render");
    const files = ["ui/RenderFidelityBridge.tsx", "ui/HiresExportBridge.tsx", "ui/ScreenshotBridge.tsx"];
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src.includes("viewer-quality"), `${f} must not import viewer-quality`).toBe(false);
    }
  });
});
