from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SceneListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    name: str | None
    model_key: str
    material: str
    lighting: str
    model_config_data: dict[str, Any] = Field(
        validation_alias="model_config",
        serialization_alias="model_config",
    )
    slot_selections: dict[str, str]
    scene_settings: dict[str, Any]
    model_url: str | None
    thumbnail_key: str | None
    thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime
    render_count: int


class RenderItem(BaseModel):
    id: int
    scene_id: int
    key: str
    bytes: int
    kind: str
    material: str | None
    lighting: str | None
    width: int | None
    height: int | None
    created_at: datetime
    url: str | None


class SceneDetail(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    name: str | None
    model_key: str
    material: str
    lighting: str
    model_config_data: dict[str, Any] = Field(
        validation_alias="model_config",
        serialization_alias="model_config",
    )
    slot_selections: dict[str, str]
    scene_settings: dict[str, Any]
    model_url: str | None
    thumbnail_key: str | None
    thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime
    renders: list[RenderItem]


class ScenePatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, max_length=255)
    material: str | None = Field(default=None, max_length=64)
    lighting: str | None = Field(default=None, max_length=64)
    model_config_data: dict[str, Any] | None = Field(
        default=None,
        validation_alias="model_config",
        serialization_alias="model_config",
    )
    slot_selections: dict[str, str] | None = None
    scene_settings: dict[str, Any] | None = None
