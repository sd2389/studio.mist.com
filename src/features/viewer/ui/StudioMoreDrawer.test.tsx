import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaterialSwatch } from "@/components/ui/material-swatch";

/*
 * The studio's More drawer before or without the source catalogue. Server rendering runs no
 * effects, so the catalogue request is never answered, as while it is pending; a failed one
 * leaves the catalogue unset the same way, and only adds an error line above the slots.
 */

/** Every swatch the drawer draws, with what clicking it does. */
const swatches: Pick<Parameters<typeof MaterialSwatch>[0], "id" | "onClick">[] = [];

vi.mock("@/components/ui/material-swatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/material-swatch")>();
  function RecordedSwatch(props: Parameters<typeof actual.MaterialSwatch>[0]) {
    swatches.push({ id: props.id, onClick: props.onClick });
    return <actual.MaterialSwatch {...props} />;
  }
  return { ...actual, MaterialSwatch: RecordedSwatch };
});

const { isGemPresetId } = await import("@/lib/gem-gpu/gem-configs");
const { buildModelConfigFromSlots } = await import("@/lib/slot-materials/model-config");
const { useMaterialPresetStore } = await import("@/stores/material-preset-store");
const { StudioMoreDrawer } = await import("./StudioMoreDrawer");

/** A bulk design: its "Pave" layer is of kind `default`, with the gem role its conversion found. */
function paveDesignConfig() {
  const config = buildModelConfigFromSlots(["Metal 1", "Gem 1", "Pave"]);
  return {
    ...config,
    slots: config.slots.map((slot) => (slot.slotId === "Pave" ? { ...slot, role: "gem" as const } : slot)),
  };
}

function renderDrawer(activeSlot: string, modelConfig = paveDesignConfig()) {
  swatches.length = 0;
  renderToStaticMarkup(
    <StudioMoreDrawer modelConfig={modelConfig} activeSlot={activeSlot} onActiveSlotChange={() => {}} />,
  );
  return swatches;
}

beforeEach(() => {
  useMaterialPresetStore.setState({
    preset: "gold-14k-yellow",
    slotSelections: { "Metal 1": "gold-14k-yellow", "Gem 1": "diamond", Pave: "gold-14k-yellow" },
  });
});

describe("the More drawer without the source catalogue", () => {
  it("offers a Pave layer of the gem role the gem presets, and applies one to that layer", () => {
    const offered = renderDrawer("Pave");

    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((swatch) => !isGemPresetId(swatch.id))).toEqual([]);
    offered.find((swatch) => swatch.id === "ruby")!.onClick!();

    expect(useMaterialPresetStore.getState().slotSelections).toEqual({
      "Metal 1": "gold-14k-yellow",
      "Gem 1": "diamond",
      Pave: "ruby",
    });
  });

  it("offers a metal slot with no stored options the metal presets, and applies one to that slot", () => {
    const offered = renderDrawer("Metal 1", { ...paveDesignConfig(), materialOptionsBySlot: {} });

    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((swatch) => isGemPresetId(swatch.id))).toEqual([]);
    offered.find((swatch) => swatch.id === "platinum")!.onClick!();

    expect(useMaterialPresetStore.getState().slotSelections["Metal 1"]).toBe("platinum");
    expect(useMaterialPresetStore.getState().slotSelections.Pave).toBe("gold-14k-yellow");
  });
});
