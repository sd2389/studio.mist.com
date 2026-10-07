"""API keys as the profile page and /v1/whoami see them (features/api_keys)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.features.api_keys.keys import API_SCOPES, ApiScope
from app.schemas.utc import UTCDateTime


class ApiKeyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    scopes: list[ApiScope] = Field(min_length=1, max_length=len(API_SCOPES))
    # Unset: the key works until it is revoked.
    expires_in_days: int | None = Field(default=None, ge=1, le=365)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Name the key")
        return name

    @field_validator("scopes")
    @classmethod
    def _canonical_scopes(cls, value: list[ApiScope]) -> list[ApiScope]:
        """Each scope once, in the order API_SCOPES lists them."""
        return [scope for scope in API_SCOPES if scope in value]


class ApiKeyOut(BaseModel):
    """A key without its secret: the whole key is only in ApiKeyCreated."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prefix: str
    scopes: list[ApiScope]
    created_at: UTCDateTime
    last_used_at: UTCDateTime | None
    expires_at: UTCDateTime | None
    revoked_at: UTCDateTime | None


class ApiKeyCreated(ApiKeyOut):
    # The whole key, in this answer only: it is never stored, logged or shown again.
    secret: str


class ApiKeyList(BaseModel):
    items: list[ApiKeyOut]
    # Most keys a user may have that are neither revoked nor expired.
    max_active: int


class WhoAmI(BaseModel):
    """The key a /v1 request came with, and the owner it acts as."""

    key: ApiKeyOut
    user_id: int
    plan_tier: str
