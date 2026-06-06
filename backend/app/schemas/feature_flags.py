from datetime import datetime

from pydantic import BaseModel, Field


class FeatureFlagsSnapshot(BaseModel):
    flags: dict[str, bool]


class FeatureFlagRow(BaseModel):
    key: str
    label: str
    description: str
    category: str
    default_enabled: bool
    enabled: bool
    updated_at: datetime | None = None


class FeatureFlagsAdminResponse(BaseModel):
    features: list[FeatureFlagRow]


class SetFeatureFlagRequest(BaseModel):
    enabled: bool = Field(...)
