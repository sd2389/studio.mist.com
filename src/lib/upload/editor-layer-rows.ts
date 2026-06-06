import type { LayerRow } from "@/lib/upload/layer-state";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";

/** Build layer rows for the in-editor Layers tab (visibility only; no rename). */
export function buildEditorLayerRows(config: PersistedModelConfig): LayerRow[] {
  const materialProps = config.materialProps ?? {};
  const slotRenames = config.slotRenames ?? {};
  const slotTokens = config.slotTokens ?? {};

  const rawBySlot = new Map<string, string>();
  for (const [raw, slotId] of Object.entries(slotRenames)) {
    if (!rawBySlot.has(slotId)) rawBySlot.set(slotId, raw);
  }
  for (const [slotId, tokens] of Object.entries(slotTokens)) {
    if (rawBySlot.has(slotId)) continue;
    const token = tokens[0];
    if (token) {
      const match = Object.keys(slotRenames).find(
        (raw) => raw.trim().toLowerCase() === token.trim().toLowerCase(),
      );
      rawBySlot.set(slotId, match ?? slotId);
    } else {
      rawBySlot.set(slotId, slotId);
    }
  }

  const slotIds =
    config.slots.length > 0
      ? config.slots.map((slot) => slot.slotId)
      : Object.keys(slotTokens).length > 0
        ? Object.keys(slotTokens)
        : ["Metal 01"];

  return slotIds.map((slotId) => ({
    rawName: rawBySlot.get(slotId) ?? slotId,
    slotId,
    visible: materialProps[slotId]?.visible ?? true,
  }));
}
