import { describe, expect, it } from "vitest";
import { isGemPickerSlot, type SlotSelectionMap } from "@/lib/slot-materials/material-rules";
import { buildModelConfigFromSlots, type PersistedModelConfig, type SlotRole } from "@/lib/slot-materials/model-config";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { filterSlotsByKind } from "@/features/viewer/ui/studio-selection-utils";

const SLOTS = ["Heads", "Metal 1", "Gem 1", "Accent 1", "Pave"];

/** A model config whose slots carry the roles given, as F1 stores them on a bulk design. */
function configWithRoles(roles: Record<string, SlotRole> = {}): PersistedModelConfig {
  const config = buildModelConfigFromSlots(SLOTS);
  return { ...config, slots: config.slots.map((slot) => ({ ...slot, role: roles[slot.slotId] })) };
}

function pickerLists(modelConfig: PersistedModelConfig, selections: SlotSelectionMap) {
  return {
    metal: filterSlotsByKind(SLOTS, "metal", modelConfig, selections),
    gem: filterSlotsByKind(SLOTS, "gem", modelConfig, selections),
  };
}

describe("the studio pickers' slot lists", () => {
  it("list a slot of no known part under metals while it holds a metal and has no role", () => {
    expect(configWithRoles().slots.find((slot) => slot.slotId === "Pave")?.kind).toBe("default");
    expect(pickerLists(configWithRoles(), { Pave: "gold-18k-white" })).toEqual({
      metal: ["Heads", "Metal 1", "Pave"],
      gem: ["Gem 1", "Accent 1"],
    });
    expect(pickerLists(configWithRoles(), {}).gem).toEqual(["Gem 1", "Accent 1"]);
  });

  it("list it under gems when it holds a stone, so the stone can be swapped for another", () => {
    expect(pickerLists(configWithRoles(), { Pave: "diamond" })).toEqual({
      metal: ["Heads", "Metal 1"],
      gem: ["Gem 1", "Accent 1", "Pave"],
    });
  });

  it("list it under gems when its stored role is a stone's, whatever it holds", () => {
    for (const role of ["gem", "accent"] as const) {
      expect(pickerLists(configWithRoles({ Pave: role }), { Pave: "gold-14k-yellow" }).gem).toContain("Pave");
      expect(pickerLists(configWithRoles({ Pave: role }), {}).gem).toContain("Pave");
    }
    expect(pickerLists(configWithRoles({ Pave: "metal" }), { Pave: "gold-14k-yellow" }).metal).toContain("Pave");
  });

  it("keep slots named for metal or stone where their names put them", () => {
    const roles = { Heads: "gem", "Metal 1": "accent", "Gem 1": "metal", "Accent 1": "metal" } as const;
    const selections: SlotSelectionMap = { Heads: "diamond", "Metal 1": "ruby", "Gem 1": "platinum" };
    expect(pickerLists(configWithRoles(roles), selections)).toEqual({
      metal: ["Heads", "Metal 1", "Pave"],
      gem: ["Gem 1", "Accent 1"],
    });
  });

  it("tell a catalogue stone from a catalogue metal", () => {
    const catalog = useCatalogParamsStore.getState();
    catalog.registerGem("picker-test-sapphire", { ior: 1.77 });
    expect(isGemPickerSlot("Pave", configWithRoles(), { Pave: "catalog:picker-test-sapphire" })).toBe(true);
    expect(isGemPickerSlot("Pave", configWithRoles(), { Pave: "catalog:picker-test-unknown" })).toBe(false);
  });
});
