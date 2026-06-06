from typing import Literal

from pydantic import BaseModel, Field

AiSubMode = Literal["shoot", "model", "custom"]
AiModelVariant = Literal["hand", "neck", "ear"]


class AiBackgroundBody(BaseModel):
    jewelry_b64: str = Field(..., min_length=24, description="PNG data URL or raw base64")
    prompt: str | None = Field(
        default=None,
        max_length=2000,
        description="Custom prompt when sub_mode=custom; SDXL override otherwise",
    )
    sub_mode: AiSubMode = Field(
        default="custom",
        description="shoot = preset lifestyle scene; model = on-model; custom = free prompt",
    )
    preset_id: str | None = Field(
        default=None,
        max_length=64,
        description="Shoot preset id when sub_mode=shoot",
    )
    model_variant: AiModelVariant | None = Field(
        default="hand",
        description="Placement hint when sub_mode=model",
    )
