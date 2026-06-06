from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SceneListItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    name: str | None
    sku: str | None = None
    category: str | None = None
    note: str | None = None
    model_key: str
    material: str
    lighting: str
    model_config_data: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="model_config",
        serialization_alias="model_config",
    )
    slot_selections: dict[str, str] = Field(default_factory=dict)
    scene_settings: dict[str, Any] = Field(default_factory=dict)
    variants: dict[str, Any] = Field(default_factory=dict)
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
    sku: str | None = None
    category: str | None = None
    note: str | None = None
    model_key: str
    material: str
    lighting: str
    model_config_data: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="model_config",
        serialization_alias="model_config",
    )
    slot_selections: dict[str, str] = Field(default_factory=dict)
    scene_settings: dict[str, Any] = Field(default_factory=dict)
    variants: dict[str, Any] = Field(default_factory=dict)
    model_url: str | None
    thumbnail_key: str | None
    thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime
    renders: list[RenderItem]


class ScenePatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str | None = Field(default=None, max_length=255)
    sku: str | None = Field(default=None, max_length=128)
    category: str | None = Field(default=None, max_length=128)
    note: str | None = Field(default=None, max_length=4096)
    material: str | None = Field(default=None, max_length=64)
    lighting: str | None = Field(default=None, max_length=64)
    model_config_data: dict[str, Any] | None = Field(
        default=None,
        validation_alias="model_config",
        serialization_alias="model_config",
    )
    slot_selections: dict[str, str] | None = None
    scene_settings: dict[str, Any] | None = None
    variants: dict[str, Any] | None = None
