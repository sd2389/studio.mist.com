import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function readUi(name: string) {
  return readFileSync(
    path.join(process.cwd(), "src/features/viewer/ui", name),
    "utf8",
  );
}

describe("studio primary IA", () => {
  it("primary bar exposes Metal, Gem, Light, Export, and More", () => {
    const src = readUi("StudioPrimaryBar.tsx");
    for (const label of ["Metal", "Gem", "Light", "Export", "More"]) {
      expect(src.includes(label), `missing ${label}`).toBe(true);
    }
  });

  it("scene buckets live in More, not primary bar", () => {
    const primary = readUi("StudioPrimaryBar.tsx");
    const more = readUi("StudioMoreDrawer.tsx");
    expect(primary.includes("ENVIRONMENT-METAL")).toBe(false);
    expect(more.includes("ENVIRONMENT-METAL") || more.includes("Scene buckets")).toBe(true);
  });

  it("studio chrome uses a 280px sidebar and 52px top bar", () => {
    const shell = readUi("ViewerShell.tsx");
    const topBar = readUi("StudioTopBar.tsx");
    expect(shell.includes("w-[280px]")).toBe(true);
    expect(shell.includes("h-[52px]") || topBar.includes("h-[52px]") || topBar.includes("h-13")).toBe(true);
    expect(shell.includes("md:flex")).toBe(true);
  });

  it("studio shell drops ice chrome, export orb, fake quality, and Controls FAB", () => {
    const shell = readUi("ViewerShell.tsx");
    expect(shell.includes("#eaeff5")).toBe(false);
    expect(shell.includes("size-28")).toBe(false);
    expect(shell.includes("glass-panel")).toBe(false);
    expect(shell.includes("Quality / High")).toBe(false);
    expect(shell.includes("SlidersHorizontal")).toBe(false);
    expect(shell.includes(">Controls<") || shell.includes('"Controls"')).toBe(false);
  });

  it("embed chrome is 48px and has no shopper dock or primary bar", () => {
    const shell = readUi("ViewerShell.tsx");
    const embed = readUi("EmbedChrome.tsx");
    expect(embed.includes("h-12")).toBe(true);

    const embedStart = shell.indexOf('variant === "embed"');
    expect(embedStart).toBeGreaterThan(-1);
    const embedReturn = shell.indexOf("return (", embedStart);
    const studioReturn = shell.indexOf("return (", embedReturn + 1);
    const embedBlock = shell.slice(embedReturn, studioReturn);
    expect(embedBlock.includes("StudioPrimaryBar")).toBe(false);
    expect(embedBlock.includes("shopper")).toBe(false);
    expect(embedBlock.includes("MetalPicker") || embedBlock.includes("shopper dock")).toBe(false);
  });
});
