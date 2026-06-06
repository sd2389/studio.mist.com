export type AiImageSubMode = "shoot" | "model" | "custom";

export type AiModelVariant = "hand" | "neck" | "ear";

export type AiShootPreset = {
  id: string;
  label: string;
  gradient: string;
  prompt: string;
};

export const AI_MODEL_VARIANTS: { id: AiModelVariant; label: string; description: string }[] = [
  {
    id: "hand",
    label: "Hand",
    description: "Ring or bracelet worn on a model hand.",
  },
  {
    id: "neck",
    label: "Neck",
    description: "Necklace or pendant on a model neckline.",
  },
  {
    id: "ear",
    label: "Ear",
    description: "Earrings on a model ear close-up.",
  },
];

/** Gemora-parity lifestyle / studio shoot presets (clean-room prompts). */
export const AI_SHOOT_PRESETS: AiShootPreset[] = [
  {
    id: "marble-velvet",
    label: "Marble & velvet",
    gradient: "from-stone-200 to-amber-100/80",
    prompt:
      "luxury jewelry product photo on white marble surface with soft velvet accent, macro studio lighting, shallow depth of field, editorial catalog",
  },
  {
    id: "warm-wood",
    label: "Warm wood",
    gradient: "from-amber-100 to-orange-50",
    prompt:
      "fine jewelry on warm walnut wood tray, soft window light, lifestyle catalog shot, natural shadows, premium boutique styling",
  },
  {
    id: "jewelry-box",
    label: "Jewelry box",
    gradient: "from-rose-100 to-stone-200",
    prompt:
      "jewelry inside an open luxury jewelry box with satin lining, soft studio lighting, gift presentation, high-end catalog photography",
  },
  {
    id: "greenery",
    label: "Greenery",
    gradient: "from-emerald-100 to-lime-50",
    prompt:
      "jewelry styled with fresh green botanical accents, bright natural daylight, airy lifestyle editorial, crisp gem sparkle",
  },
  {
    id: "dark-studio",
    label: "Dark studio",
    gradient: "from-zinc-700 to-neutral-900",
    prompt:
      "jewelry on dark charcoal studio backdrop, dramatic rim lighting, high contrast luxury advertising, sharp metal reflections",
  },
  {
    id: "ice-crystal",
    label: "Ice & crystal",
    gradient: "from-sky-100 to-cyan-50",
    prompt:
      "jewelry on frosted ice crystal surface with cool blue studio lighting, winter luxury campaign, crisp highlights on gems",
  },
  {
    id: "neutral-studio",
    label: "Neutral studio",
    gradient: "from-zinc-200 to-neutral-100",
    prompt:
      "luxury jewelry catalog photo, macro shot, studio lighting, sharp gem focus, neutral seamless background",
  },
  {
    id: "sandstone",
    label: "Sandstone",
    gradient: "from-amber-50 to-stone-300",
    prompt:
      "jewelry on textured sandstone plinth, warm Mediterranean daylight, resort luxury editorial, soft golden reflections",
  },
];

export const DEFAULT_AI_CUSTOM_PROMPT =
  "luxury jewelry catalog photo, macro shot, studio lighting, sharp gem focus, creative art-directed background";

export function shootPresetById(id: string): AiShootPreset | undefined {
  return AI_SHOOT_PRESETS.find((preset) => preset.id === id);
}
