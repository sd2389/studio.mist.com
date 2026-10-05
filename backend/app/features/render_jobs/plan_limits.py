"""What its owner's plan lets a render job be (docs/adr/0005-server-exports.md, "Plans").

Every image and frame within the plan's longest side; a turntable within the plan's frame rate
and length, an 8K one within the shorter length 8K videos have; a spin within the plan's frames
and size; a Campaign Pack only on Grow and Studio, each of its turntables and spins within the
same limits. A job past any of them is 402, before anything is held.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.features.billing.plans import PLAN_LABELS, VIDEO_4K_MEGAPIXELS, PlanTier, get_quotas, normalize_tier
from app.features.billing.quota_service import assert_image_resolution, get_or_create_billing
from app.features.render_jobs.specs import CampaignPackSpec, FrameSize, Spec, SpinSpec, TurntableSpec
from app.models.user import User


def is_8k_video(width: int, height: int) -> bool:
    """Whether a video's frames are 8K: more megapixels than 4K's price tier."""
    return width * height / 1_000_000 > VIDEO_4K_MEGAPIXELS


def video_refusal(width: int, height: int, fps: int, frames: int, tier: PlanTier) -> str | None:
    """Why the plan doesn't make this turntable; None when it does."""
    quotas, plan = get_quotas(tier), PLAN_LABELS[tier]
    if fps > quotas.max_video_fps:
        return f"Frame rate limit exceeded for {plan} (max {quotas.max_video_fps} fps)."
    seconds, at_8k = quotas.max_video_seconds, ""
    if is_8k_video(width, height):
        if quotas.max_8k_video_seconds == 0:
            return f"8K video (above {VIDEO_4K_MEGAPIXELS} megapixels a frame) is part of Grow and Studio, not {plan}."
        seconds, at_8k = quotas.max_8k_video_seconds, " at 8K"
    if frames > seconds * fps:
        return f"Video length limit exceeded for {plan} (max {seconds} s{at_8k})."
    return None


def spin_refusal(size: int, frames: int, tier: PlanTier) -> str | None:
    """Why the plan doesn't make this spin; None when it does."""
    quotas, plan = get_quotas(tier), PLAN_LABELS[tier]
    if frames > quotas.max_spin_frames:
        return f"Spin frame limit exceeded for {plan} (max {quotas.max_spin_frames} frames)."
    if size > quotas.max_spin_size:
        return f"Spin size limit exceeded for {plan} (max {quotas.max_spin_size} px)."
    return None


def _pack_refusal(spec: CampaignPackSpec, tier: PlanTier) -> str | None:
    if not get_quotas(tier).campaign_pack:
        return f"The Campaign Pack is part of Grow and Studio, not {PLAN_LABELS[tier]}."
    for part in spec.parts():
        refusal = None
        if part.kind == "turntable":
            refusal = video_refusal(part.width, part.height, part.fps, part.frames, tier)
        elif part.kind == "spin":
            refusal = spin_refusal(part.width, part.frames, tier)
        if refusal:
            return refusal
    return None


def plan_refusal(tier: PlanTier, spec: Spec) -> str | None:
    """Why the plan doesn't make this job, the longest side aside; None when it does."""
    if isinstance(spec, TurntableSpec):
        return video_refusal(spec.width, spec.height, spec.fps, spec.frames, tier)
    if isinstance(spec, SpinSpec):
        return spin_refusal(spec.size, spec.frames, tier)
    if isinstance(spec, CampaignPackSpec):
        return _pack_refusal(spec, tier)
    return None


def assert_plan_allows(db: Session, user: User, spec: Spec) -> None:
    """402 unless the owner's plan makes this job: its images or frames within the plan's longest
    side, and a turntable's, a spin's or a Campaign Pack's own limits. (A spin's size cap is
    within the longest side on every plan, and so are a pack's sizes on the plans that have it.)"""
    if isinstance(spec, FrameSize):
        assert_image_resolution(db, user, spec.width, spec.height)
    if refusal := plan_refusal(normalize_tier(get_or_create_billing(db, user).plan_tier), spec):
        raise HTTPException(status_code=402, detail=refusal)
