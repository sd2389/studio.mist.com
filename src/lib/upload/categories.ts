/** Gemora-aligned jewelry categories for upload metadata. */
export const JEWELRY_CATEGORIES = [
  "Ring",
  "Engagement Ring",
  "Wedding Band",
  "Necklace",
  "Pendant",
  "Earrings",
  "Stud Earrings",
  "Hoop Earrings",
  "Bracelet",
  "Bangle",
  "Anklet",
  "Brooch",
  "Cufflinks",
  "Watch",
  "Other",
] as const;

export type JewelryCategory = (typeof JEWELRY_CATEGORIES)[number];

export const DEFAULT_JEWELRY_CATEGORY: JewelryCategory = "Ring";
