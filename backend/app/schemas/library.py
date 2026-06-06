"""User library request/response DTOs."""

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field


class UserMaterialItem(BaseModel):
    id: int
    kind: str
    slug: str
    label: str
    params: dict[str, Any] = Field(default_factory=dict)
    category: str | None = None
    family: str | None = None
    gem_family: str | None = None
    swatch_url: str | None = None
    sort_weight: int = 0
    created_at: datetime | None = None


class CreateUserMaterialRequest(BaseModel):
    kind: str
    label: str
    params: dict[str, Any] = Field(default_factory=dict)
    category: str | None = None
    family: str | None = None
    gem_family: str | None = None


class UpdateUserMaterialRequest(BaseModel):
    label: str | None = None
    params: dict[str, Any] | None = None


class UserAssetItem(BaseModel):
    id: int
    asset_type: str
    label: str
    url: str | None = None
    preview_url: str | None = None
    mime_type: str | None = None
    byte_size: int | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class CreateUserAssetRequest(BaseModel):
    asset_type: str
    label: str
    storage_key: str
    preview_key: str | None = None
    mime_type: str | None = None
    byte_size: int | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


ItemT = TypeVar("ItemT")


class LibraryPage(BaseModel, Generic[ItemT]):
    items: list[ItemT]
    total: int
    limit: int
    offset: int
