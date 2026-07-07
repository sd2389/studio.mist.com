from datetime import datetime

from pydantic import BaseModel, Field


class RenderJobCreate(BaseModel):
    scene_id: int
    lighting: str = Field(default="studio", max_length=32)
    preset: str = Field(default="gold-18k-yellow", max_length=64)
    width: int = Field(default=2048, ge=256, le=8192)
    height: int = Field(default=2048, ge=256, le=8192)


class RenderJobStatus(BaseModel):
    id: int
    status: str
    result_url: str | None = None
    error: str | None = None
    attempts: int
    created_at: datetime

    model_config = {"from_attributes": True}


class RenderJobPayload(BaseModel):
    model_url: str
    lighting: str
    preset: str
    width: int
    height: int


class RenderJobFailRequest(BaseModel):
    error: str = Field(..., max_length=1024)
