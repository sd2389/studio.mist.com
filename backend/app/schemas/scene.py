from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.catalog import BackgroundItem, EnvironmentItem, GemItem, GroundItem, MetalItem
from app.schemas.library import UserMaterialItem
from app.schemas.product_specs import ProductSpecs


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
    product_specs: dict[str, Any] = Field(default_factory=dict)
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


class SceneLook(BaseModel):
    """The catalogue items and library materials a scene's saved look draws from."""

    environments: list[EnvironmentItem] = Field(default_factory=list)
    backgrounds: list[BackgroundItem] = Field(default_factory=list)
    grounds: list[GroundItem] = Field(default_factory=list)
    metals: list[MetalItem] = Field(default_factory=list)
    gems: list[GemItem] = Field(default_factory=list)
    user_materials: list[UserMaterialItem] = Field(default_factory=list)


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
    product_specs: dict[str, Any] = Field(default_factory=dict)
    model_url: str | None
    thumbnail_key: str | None
    thumbnail_url: str | None
    created_at: datetime
    updated_at: datetime
    renders: list[RenderItem]
    # Lets a view that only displays the scene (the embed) draw it without the auth-gated
    # catalogue or the owner's library.
    look: SceneLook = Field(default_factory=SceneLook)


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
    product_specs: ProductSpecs | None = None
