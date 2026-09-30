import { parseCatalogMaterialSlug } from "@/lib/catalog/catalog-material-ref";
import type { GemItem, MetalItem } from "@/lib/catalog/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { ProductSpecs, StoneSpec } from "./types";
import { metalDisplayNameFromSlug, parseFinishFromSlug } from "./parse-catalog-metal";

type Args = {
  specs: ProductSpecs;
  slotSelections: Record<string, string>;
  modelConfig: PersistedModelConfig;
  metalsBySlug: Map<string, MetalItem>;
  gemsBySlug: Map<string, GemItem>;
};

function isEmpty(value: string | null | undefined): boolean {
  return value == null || value === "";
}

export function suggestProductSpecsFromMaterials(args: Args): ProductSpecs {
  const { specs, slotSelections, modelConfig, metalsBySlug, gemsBySlug } = args;
  const next = { ...specs, stones: [...specs.stones] };

  const slots = modelConfig.slots ?? [];
  // SlotKind is lowercase: "metal" | "gem" | "accent" | "default".
  // "Heads" ingest slots are inferred as kind "metal" (see inferSlotKind).
  const metalSlot = slots.find((s) => s.kind === "metal" && slotSelections[s.slotId]);
  if (metalSlot) {
    const ref = slotSelections[metalSlot.slotId];
    const catalogSlug = parseCatalogMaterialSlug(ref);
    if (catalogSlug) {
      const item = metalsBySlug.get(catalogSlug);
      const slug = item?.slug ?? catalogSlug;
      if (isEmpty(next.metal_type)) next.metal_type = metalDisplayNameFromSlug(slug);
      if (isEmpty(next.finish)) next.finish = parseFinishFromSlug(slug);
    } else if (!ref.startsWith("custom:")) {
      // Built-in preset ids (e.g. gold-14k-yellow) are stored without a catalog: prefix.
      if (isEmpty(next.metal_type)) next.metal_type = metalDisplayNameFromSlug(ref);
      if (isEmpty(next.finish)) next.finish = parseFinishFromSlug(ref);
    } else if (isEmpty(next.metal_type)) {
      next.metal_type = ref;
    }
  }

  const gemSlots = slots.filter((s) => s.kind === "gem" && slotSelections[s.slotId]);
  if (gemSlots.length > 0 && next.stones.length === 0) {
    next.stones = gemSlots.map((slot): StoneSpec => {
      const ref = slotSelections[slot.slotId];
      const catalogSlug = parseCatalogMaterialSlug(ref);
      const gemName = catalogSlug ? gemsBySlug.get(catalogSlug)?.label ?? catalogSlug : ref;
      return {
        id: crypto.randomUUID(),
        gem_type: gemName,
        carat: null,
        clarity: null,
        color: null,
        fancy_color: "",
        cut: null,
        quantity: 1,
      };
    });
    if (next.stone_count == null) next.stone_count = next.stones.length;
  }

  return next;
}
