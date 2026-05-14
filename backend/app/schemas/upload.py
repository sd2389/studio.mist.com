from pydantic import BaseModel, Field
from typing import Any


class PresignRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str | None = Field(default=None, max_length=128)


class RegisterRequest(BaseModel):
    key: str = Field(..., min_length=3, max_length=512)
    material: str = Field(default="original", max_length=64)
    model_config_data: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="model_config",
        serialization_alias="model_config",
    )
    slot_selections: dict[str, str] = Field(default_factory=dict)
    scene_settings: dict[str, Any] = Field(default_factory=dict)
