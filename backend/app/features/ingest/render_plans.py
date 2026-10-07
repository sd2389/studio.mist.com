"""A batch's render plan: what each design gets rendered once it is converted, priced as the
render jobs it becomes (docs/adr/0006-bulk-pipeline.md, "Render plans").

A plan's stills are one angle_set job a design, its turntable and its spin one job each. Each is
checked as that job's spec, capped by the owner's plan and priced as the job will be (ADR 0005),
so the plan costs what its jobs will hold. Submitting a batch holds the plan's credits for every
design; once a design's scene is made, renders.py makes its jobs, which take what it holds.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy.orm import Session

from app.core.validation import validation_detail
from app.features.render_jobs.plan_limits import assert_plan_allows
from app.features.render_jobs.pricing import render_job_cost
from app.features.render_jobs.specs import DEFAULT_MARGIN_PCT, AngleSetSpec, PackAngle, Spec, SpinSpec, parse_spec
from app.models.user import User

# A square still of at most 36 megapixels, a job's largest image.
MAX_STILL_SIZE = 6000
MAX_TURNTABLE_SECONDS = 60
# The orbit each design's turntable takes: once round the piece from the Campaign Pack's
# three-quarter angle (35° round, 24° up), framed on the piece as that still is. A turntable
# job's path can't take the pack's own orbit (20° up, its distance fitted at every azimuth),
# which only spins and packs have. Its price and its plan's caps don't depend on it.
TURNTABLE_PATH = {"orbit": {"start": {"angle": "three-quarter"}}}


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


class TurntablePlan(PlanPart):
    """A video once round the piece; its frame size and rate are checked as a turntable job's."""

    width: int
    height: int
    fps: int = 30
    seconds: int = Field(ge=1, le=MAX_TURNTABLE_SECONDS)
    quality: Literal["standard", "high", "max"] = "high"


class RenderPlan(PlanPart):
    stills: StillsPlan | None = None
    turntable: TurntablePlan | None = None
    spin: SpinSpec | None = None  # a spin job's spec, as it is
    # Copy each design's outputs to the public bucket beside its published model. Off unless
    # asked: the outputs stay private, downloaded through the API.
    publish_media: bool = False
    # The still that becomes the scene's thumbnail once its angle set completes.
    thumbnail_from: PackAngle | None = None

    @model_validator(mode="after")
    def _renders_something(self) -> RenderPlan:
        if self.stills is None and self.turntable is None and self.spin is None:
            raise ValueError("a render plan makes stills, a turntable or a spin; leave it out to render nothing")
        if self.thumbnail_from is not None and (self.stills is None or self.thumbnail_from not in self.stills.angles):
            raise ValueError("thumbnail_from: one of the stills' angles")
        return self


@dataclass(frozen=True)
class PlannedRender:
    """One job of a design's plan: its kind, its spec and the credits it costs."""

    kind: str
    spec: Spec
    credits: int

    @property
    def files(self) -> int:
        """How many files it makes: an image an angle, else one video or one ZIP."""
        return len(self.spec.cameras) if isinstance(self.spec, AngleSetSpec) else 1


def stills_job_spec(stills: StillsPlan) -> dict[str, Any]:
    return {
        "cameras": [{"angle": angle, "margin_pct": stills.margin_pct} for angle in stills.angles],
        "width": stills.size,
        "height": stills.size,
        "format": stills.format,
        "jpeg_quality": stills.jpeg_quality,
        "transparent": stills.transparent,
    }


def turntable_job_spec(turntable: TurntablePlan) -> dict[str, Any]:
    return {
        "width": turntable.width,
        "height": turntable.height,
        "fps": turntable.fps,
        "frames": turntable.seconds * turntable.fps,
        "quality": turntable.quality,
        "path": TURNTABLE_PATH,
    }


def job_specs(plan: RenderPlan) -> list[tuple[str, str, dict[str, Any]]]:
    """The jobs a design's plan becomes: the plan's field, the job's kind and its spec."""
    specs = []
    if plan.stills is not None:
        specs.append(("stills", "angle_set", stills_job_spec(plan.stills)))
    if plan.turntable is not None:
        specs.append(("turntable", "turntable", turntable_job_spec(plan.turntable)))
    if plan.spin is not None:
        specs.append(("spin", "spin", plan.spin.model_dump(mode="json")))
    return specs


def _spec_refused(field: str, exc: HTTPException) -> HTTPException:
    """A job spec's 400, named by the plan's field: 'spec.width: …' becomes 'render_plan.turntable.width: …'."""
    detail = str(exc.detail)
    if detail.startswith(("spec.", "spec:")):
        return HTTPException(status_code=400, detail=f"render_plan.{field}{detail.removeprefix('spec')}")
    return HTTPException(status_code=400, detail=f"render_plan.{field}: {detail}")


def _parsed_plan(raw: dict[str, Any]) -> RenderPlan:
    try:
        return RenderPlan.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=validation_detail(exc, "render_plan")) from exc


def _planned(plan: RenderPlan) -> list[tuple[str, PlannedRender]]:
    """Each of the plan's jobs with the plan's field it comes from, checked and priced."""
    renders = []
    for field, kind, raw_spec in job_specs(plan):
        try:
            spec = parse_spec(kind, raw_spec)
        except HTTPException as exc:
            raise _spec_refused(field, exc) from exc
        renders.append((field, PlannedRender(kind=kind, spec=spec, credits=render_job_cost(kind, spec))))
    return renders


def checked_plan(db: Session, user: User, raw: dict[str, Any]) -> tuple[RenderPlan, list[PlannedRender]]:
    """The render plan and the jobs it makes for each design: 400 naming the field of a plan that
    isn't one, 402 for one the owner's plan doesn't render (a size, a frame rate, a length, an 8K
    video or a spin above its caps)."""
    plan = _parsed_plan(raw)
    renders = _planned(plan)
    for _, planned in renders:
        assert_plan_allows(db, user, planned.spec)
    return plan, [planned for _, planned in renders]


def plan_render(db: Session, user: User, raw: dict[str, Any]) -> tuple[dict[str, Any], int]:
    """The render plan normalised, and the render credits it costs a design (see checked_plan)."""
    plan, renders = checked_plan(db, user, raw)
    return plan.model_dump(mode="json"), sum(planned.credits for planned in renders)


def planned_renders(plan: dict[str, Any]) -> list[PlannedRender]:
    """The jobs a batch's plan, kept normalised, makes for each design, priced as when it was
    checked; 400 for one that no longer reads as a plan."""
    return [planned for _, planned in _planned(_parsed_plan(plan))]
