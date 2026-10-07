import type { LookTemplate } from "@/lib/api/ingest";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import type { SlotRole } from "@/lib/slot-materials/model-config";

const ROLE_ORDER: readonly SlotRole[] = ["metal", "gem", "accent"];
const ROLE_CAPTIONS: Record<SlotRole, string> = { metal: "Metal", gem: "Gem", accent: "Accent" };

/** One swatch of a template: what it covers (a role, or one slot of a role), and its material. */
export type TemplateSwatch = { key: string; caption: string; material: SlotMaterialRef; label: string };

/**
 * A template's materials as the look picker shows them, role by role: the role's material, then
 * each slot that keeps its own (a two-tone ring's Heads), captioned with the slot's name.
 */
export function templateSwatches({ template, labels }: LookTemplate): TemplateSwatch[] {
  const swatch = (key: string, caption: string, material: SlotMaterialRef): TemplateSwatch => ({
    key,
    caption,
    material,
    label: labels[material] ?? material,
  });
  return ROLE_ORDER.flatMap((role) => {
    const material = template.materials[role];
    const own = Object.entries(template.slot_materials[role] ?? {});
    return [
      ...(material ? [swatch(role, ROLE_CAPTIONS[role], material)] : []),
      ...own.map(([slot, slotMaterial]) => swatch(`${role}:${slot}`, slot, slotMaterial)),
    ];
  });
}

/** The templates with `made` first, in place of its older copy (a scene's template made again). */
export function withTemplateFirst(templates: readonly LookTemplate[], made: LookTemplate): LookTemplate[] {
  return [made, ...templates.filter((template) => template.id !== made.id)];
}
