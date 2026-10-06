"""A batch's render plan: what each design gets rendered once it is converted, priced as the
render jobs it becomes (docs/adr/0006-bulk-pipeline.md, "Render plans").

The stills are one angle_set job a design, checked, capped by the owner's plan and priced as a
job's spec is (ADR 0005), so the plan costs what its jobs will hold. Turntables and spins wait
for their job kinds (ADR 0005, B1): until then a plan names neither. Submitting a batch holds
the plan's credits for every design; making the jobs from them is F2's.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, ValidationInfo, field_validator, model_validator
from sqlalchemy.orm import Session

from app.core.validation import validation_detail
from app.features.billing.quota_service import assert_image_resolution
from app.features.render_jobs.pricing import render_job_cost
from app.features.render_jobs.specs import DEFAULT_MARGIN_PCT, PackAngle, parse_spec
from app.models.user import User

# A square still of at most 36 megapixels, a job's largest image.
MAX_STILL_SIZE = 6000


class PlanPart(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class StillsPlan(PlanPart):
    """Square stills from the Campaign Pack's angles, framed on the piece."""

    angles: list[PackAngle] = Field(min_length=1, max_length=4)
    size: int = Field(ge=64, le=MAX_STILL_SIZE)
    format: Literal["png", "jpeg"] = "jpeg"
    jpeg_quality: float = Field(default=0.92, ge=0.8, le=1)
    transparent: bool = False
    margin_pct: float = Field(default=DEFAULT_MARGIN_PCT, ge=0, le=20)

    @field_validator("angles")
    @classmethod
    def _each_once(cls, angles: list[str]) -> list[str]:
        if len(set(angles)) != len(angles):
            raise ValueError("each angle at most once")
        return angles


class RenderPlan(PlanPart):
    stills: StillsPlan
    turntable: dict[str, Any] | None = None
    spin: dict[str, Any] | None = None
    # Copy each design's outputs to the public bucket beside its published model (F2).
    publish_media: bool = True
    # The still that becomes the scene's thumbnail (F2).
    thumbnail_from: PackAngle | None = None

    @field_validator("turntable", "spin")
    @classmethod
    def _not_yet(cls, value: dict[str, Any] | None, info: ValidationInfo) -> None:
        if value is not None:
            raise ValueError(f"not available yet: a render plan makes a {info.field_name} once render jobs do (ADR 0005, B1)")
        return None

    @model_validator(mode="after")
    def _thumbnail_is_a_still(self) -> RenderPlan:
        if self.thumbnail_from is not None and self.thumbnail_from not in self.stills.angles:
            raise ValueError("thumbnail_from: one of the stills' angles")
        return self


def stills_job_spec(stills: StillsPlan) -> dict[str, Any]:
    """The angle_set spec a design's stills render with."""
    return {
        "cameras": [{"angle": angle, "margin_pct": stills.margin_pct} for angle in stills.angles],
        "width": stills.size,
        "height": stills.size,
        "format": stills.format,
        "jpeg_quality": stills.jpeg_quality,
        "transparent": stills.transparent,
    }


def plan_render(db: Session, user: User, raw: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """The render plan normalised, and the render credits it costs a design: 400 naming the field
    of a plan that isn't one, 402 for stills larger than the owner's plan renders."""
    try:
        plan = RenderPlan.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=validation_detail(exc, "render_plan")) from exc
    try:
        spec = parse_spec("angle_set", stills_job_spec(plan.stills))
    except HTTPException as exc:
        raise HTTPException(status_code=400, detail=f"render_plan.stills: {exc.detail}") from exc
    assert_image_resolution(db, user, spec.width, spec.height)
    return plan.model_dump(mode="json"), render_job_cost("angle_set", spec)
