"""What its owner's plan lets a render job be (docs/adr/0005-server-exports.md, "Plans").

Every image and frame within the plan's longest side; a turntable within the plan's frame rate
and length, an 8K one within the shorter length 8K videos have; a spin within the plan's frames
and size. A job past any of them is 402, before anything is held.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.features.billing.plans import PLAN_LABELS, VIDEO_4K_MEGAPIXELS, PlanTier, get_quotas, normalize_tier
from app.features.billing.quota_service import assert_image_resolution, get_or_create_billing
from app.features.render_jobs.specs import FrameSize, Spec, SpinSpec, TurntableSpec
from app.models.user import User


def is_8k_video(width: int, height: int) -> bool:
    """Whether a video's frames are 8K: more megapixels than 4K's price tier."""
    return width * height / 1_000_000 > VIDEO_4K_MEGAPIXELS


def _turntable_refusal(spec: TurntableSpec, tier: PlanTier) -> str | None:
    quotas, plan = get_quotas(tier), PLAN_LABELS[tier]
    if spec.fps > quotas.max_video_fps:
        return f"Frame rate limit exceeded for {plan} (max {quotas.max_video_fps} fps)."
    seconds, at_8k = quotas.max_video_seconds, ""
    if is_8k_video(spec.width, spec.height):
        if quotas.max_8k_video_seconds == 0:
            return f"8K video (above {VIDEO_4K_MEGAPIXELS} megapixels a frame) is part of Grow and Studio, not {plan}."
        seconds, at_8k = quotas.max_8k_video_seconds, " at 8K"
    if spec.frames > seconds * spec.fps:
        return f"Video length limit exceeded for {plan} (max {seconds} s{at_8k})."
    return None


def _spin_refusal(spec: SpinSpec, tier: PlanTier) -> str | None:
    quotas, plan = get_quotas(tier), PLAN_LABELS[tier]
    if spec.frames > quotas.max_spin_frames:
        return f"Spin frame limit exceeded for {plan} (max {quotas.max_spin_frames} frames)."
    if spec.size > quotas.max_spin_size:
        return f"Spin size limit exceeded for {plan} (max {quotas.max_spin_size} px)."
    return None


def plan_refusal(tier: PlanTier, spec: Spec) -> str | None:
    """Why the plan doesn't make this job, the longest side aside; None when it does."""
    if isinstance(spec, TurntableSpec):
        return _turntable_refusal(spec, tier)
    if isinstance(spec, SpinSpec):
        return _spin_refusal(spec, tier)
    return None


def assert_plan_allows(db: Session, user: User, spec: Spec) -> None:
    """402 unless the owner's plan makes this job: its images or frames within the plan's longest
    side (a spin's size cap is within it on every plan), and a turntable's or a spin's limits."""
    if isinstance(spec, FrameSize):
        assert_image_resolution(db, user, spec.width, spec.height)
    if refusal := plan_refusal(normalize_tier(get_or_create_billing(db, user).plan_tier), spec):
        raise HTTPException(status_code=402, detail=refusal)
