from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field


class RenderJobCreate(BaseModel):
    """A render job to create. The service checks `kind`, `spec` and `look` (400 naming the field)."""

    model_config = ConfigDict(extra="forbid")

    kind: str = Field(min_length=1, max_length=24)
    scene_id: int
    # The look comes from `look` (the studio's current state), else the saved variant, else the scene.
    variant_id: str | None = Field(default=None, min_length=1, max_length=64)
    look: dict[str, Any] | None = None
    # The outputs' file stem; without it, the scene's SKU or name.
    name: str | None = Field(default=None, max_length=255)
    spec: dict[str, Any]


class RenderJobBulkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobs: list[RenderJobCreate] = Field(min_length=1)


class RenderJobOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int = Field(exclude=True)
    kind: str
    label: str | None
    filename: str | None
    content_type: str | None
    bytes: int
    width: int | None
    height: int | None

    @computed_field
    @property
    def download_url(self) -> str:
        return f"/render-jobs/{self.job_id}/outputs/{self.id}/download"


class RenderJobOut(BaseModel):
    """A job, as every user endpoint returns it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    status: str
    scene_id: int | None
    batch_id: int | None
    spec: dict[str, Any]
    watermark: bool
    credits: int
    credit_state: str
    progress: float
    stage: str | None
    attempts: int
    error: str | None
    error_code: str | None
    cancel_requested_at: datetime | None
    outputs: list[RenderJobOutput] = Field(default_factory=list)
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


class RenderJobBulkOut(BaseModel):
    jobs: list[RenderJobOut]


class RenderJobPage(BaseModel):
    """The caller's jobs, newest first; pass `next_before` as `before` for the next page."""

    items: list[RenderJobOut]
    next_before: int | None


class RenderJobQuote(BaseModel):
    """What a job would cost and make, before anything is spent."""

    credits: int
    width: int
    height: int
    frames: int
    outputs: list[str]
    watermark: bool
    warnings: list[str]


class RenderJobStatus(BaseModel):
    """What the worker routes answer with."""

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
    # Decided from the owner's plan when the job was created, so the render carries the mark.
    watermark: bool


class RenderJobFailRequest(BaseModel):
    error: str = Field(..., max_length=1024)
