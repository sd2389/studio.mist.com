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
      .map((e) => path.join((e as unknown as { parentPath: string }).parentPath, e.name));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const rel = path.relative(dir, f);
      expect(src.includes("viewer-quality"), `${rel} must not import viewer-quality`).toBe(false);
    }
  });
});
