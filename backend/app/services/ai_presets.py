"""Clean-room AI shoot presets and on-model prompt templates."""

from __future__ import annotations

from typing import Literal

AiSubMode = Literal["shoot", "model", "custom"]
AiModelVariant = Literal["hand", "neck", "ear"]

SHOOT_PRESETS: dict[str, str] = {
    "marble-velvet": (
        "luxury jewelry product photo on white marble surface with soft velvet accent, "
        "macro studio lighting, shallow depth of field, editorial catalog"
    ),
    "warm-wood": (
        "fine jewelry on warm walnut wood tray, soft window light, lifestyle catalog shot, "
        "natural shadows, premium boutique styling"
    ),
    "jewelry-box": (
        "jewelry inside an open luxury jewelry box with satin lining, soft studio lighting, "
        "gift presentation, high-end catalog photography"
    ),
    "greenery": (
        "jewelry styled with fresh green botanical accents, bright natural daylight, "
        "airy lifestyle editorial, crisp gem sparkle"
    ),
    "dark-studio": (
        "jewelry on dark charcoal studio backdrop, dramatic rim lighting, high contrast "
        "luxury advertising, sharp metal reflections"
    ),
    "ice-crystal": (
        "jewelry on frosted ice crystal surface with cool blue studio lighting, winter luxury "
        "campaign, crisp highlights on gems"
    ),
    "neutral-studio": (
        "luxury jewelry catalog photo, macro shot, studio lighting, sharp gem focus, "
        "neutral seamless background"
    ),
    "sandstone": (
        "jewelry on textured sandstone plinth, warm Mediterranean daylight, resort luxury "
        "editorial, soft golden reflections"
    ),
}

DEFAULT_CUSTOM_PROMPT = (
    "luxury jewelry catalog photo, macro shot, studio lighting, sharp gem focus, "
    "creative art-directed background"
)

MODEL_PROMPTS: dict[AiModelVariant, str] = {
    "hand": (
        "professional jewelry advertising photo, elegant female hand wearing the jewelry, "
        "natural skin tones, soft studio lighting, shallow depth of field, luxury campaign"
    ),
    "neck": (
        "professional jewelry advertising photo, elegant female neckline wearing the necklace, "
        "natural skin tones, soft studio lighting, luxury editorial campaign"
    ),
    "ear": (
        "professional jewelry advertising photo, close-up of model ear wearing earrings, "
        "natural skin tones, soft studio lighting, crisp gem sparkle, luxury campaign"
    ),
}


def resolve_prompt(
    *,
    sub_mode: AiSubMode,
    preset_id: str | None,
    model_variant: AiModelVariant | None,
    custom_prompt: str | None,
) -> str:
    if sub_mode == "shoot":
        if preset_id and preset_id in SHOOT_PRESETS:
            return SHOOT_PRESETS[preset_id]
        return SHOOT_PRESETS["neutral-studio"]

    if sub_mode == "model":
        variant = model_variant or "hand"
        return MODEL_PROMPTS.get(variant, MODEL_PROMPTS["hand"])

    prompt = (custom_prompt or DEFAULT_CUSTOM_PROMPT).strip()
    return prompt or DEFAULT_CUSTOM_PROMPT
