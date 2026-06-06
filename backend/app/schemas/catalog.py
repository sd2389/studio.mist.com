"""Catalog response DTOs. One item shape per entity, plus a paginated wrapper."""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field


class CatalogItem(BaseModel):
    slug: str
    label: str
    params: dict[str, Any] = Field(default_factory=dict)
    sort_weight: int = 0
    swatch_url: str | None = None


class MetalItem(CatalogItem):
    category: str
    family: str


class GemItem(CatalogItem):
    gem_family: str


class EnvironmentItem(CatalogItem):
    env_type: str
    preview_url: str | None = None
    master_url: str | None = None
    default_rotation: float = 0.0
    default_intensity: float = 1.0


class BackgroundItem(CatalogItem):
    is_transparent: bool = False


class GroundItem(CatalogItem):
    pass


class ScenePresetItem(CatalogItem):
    pass


ItemT = TypeVar("ItemT", bound=CatalogItem)


class CatalogPage(BaseModel, Generic[ItemT]):
    items: list[ItemT]
    total: int
    limit: int
    offset: int
