import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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

  it("embed is view only: 48px chrome, the studio's stage, no material switcher or primary bar", () => {
    const shell = readUi("ViewerShell.tsx");
    const embed = readUi("EmbedChrome.tsx");
    expect(embed.includes("h-12")).toBe(true);

    // The shell hands the embed variant to EmbedView, at the end of the file.
    const embedStart = shell.indexOf("function EmbedView(");
    expect(embedStart).toBeGreaterThan(-1);
    const embedBlock = shell.slice(embedStart);
    const studioBlock = shell.slice(0, embedStart);
    expect(studioBlock.includes('variant === "embed"')).toBe(true);
    expect(embedBlock.includes("StudioPrimaryBar")).toBe(false);
    expect(/shopper|picker|swatch/i.test(embedBlock)).toBe(false);
    // Both draw the piece with the same stage, so the embed shows what the studio shows.
    expect(embedBlock.includes("<ViewerStage {...stage}")).toBe(true);
    expect(studioBlock.includes("<ViewerStage {...stage}")).toBe(true);
    expect(existsSync(path.join(process.cwd(), "src/features/viewer/ui/EmbedShopperMaterials.tsx"))).toBe(false);
  });

  it("embed fullscreen and zoom controls keep 44px phone tap targets", () => {
    expect(readUi("EmbedChrome.tsx").includes("size-11!")).toBe(true);
    const zoom = readUi("ZoomControls.tsx");
    expect(zoom.includes("size-11!")).toBe(true);
    expect(zoom.includes("hidden md:inline-flex")).toBe(true);
    expect(readUi("ViewerShell.tsx").includes("touchLayout")).toBe(true);
  });

  it("studio shell mounts a single sidebar and a collapsible phone tab bar", () => {
    const shell = readUi("ViewerShell.tsx");
    expect(shell.split("<StudioSidebar").length - 1).toBe(1);
    expect(shell.includes("collapsible")).toBe(true);
    expect(shell.includes("max-h-[50vh]")).toBe(true);
    expect(shell.includes("chrome=\"responsive\"")).toBe(true);
  });

  it("metal tab exposes finish chips from the shared finish catalog", () => {
    const metal = readUi("MetalPickerPanel.tsx");
    const finishes = readUi("FinishChipRow.tsx");
    expect(metal.includes("FinishChipRow")).toBe(true);
    expect(finishes.includes("FINISHES")).toBe(true);
  });
});
