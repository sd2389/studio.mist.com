"""What a render job costs, from RENDER_CREDIT_COSTS in plans.py."""

from __future__ import annotations

import math

from app.features.billing.plans import (
    PACK_SCOPE_CREDITS,
    RENDER_CREDIT_COSTS,
    SPIN_DOUBLE_ABOVE_FRAMES,
    VIDEO_CREDIT_SECONDS,
    VIDEO_DOUBLE_ABOVE_FPS,
)
from app.features.render_jobs.campaign_pack import PackPart
from app.features.render_jobs.specs import AngleSetSpec, CampaignPackSpec, Spec, SpinSpec, StillSpec, TurntableSpec


def tier_credits(tiers: tuple[tuple[float, int], ...], megapixels: float) -> int:
    """The credits of the first tier whose size reaches `megapixels`."""
    for limit, credits in tiers:
        if megapixels <= limit:
            return credits
    raise ValueError(f"{megapixels:.1f} MP is larger than any priced size")


def still_image_credits(width: int, height: int) -> int:
    return tier_credits(RENDER_CREDIT_COSTS["still_image"], width * height / 1_000_000)


def video_credits(width: int, height: int, fps: int, frames: int) -> int:
    """A turntable: its frame size's credits for every started 10 seconds, double above 30 fps."""
    started = math.ceil(frames / (VIDEO_CREDIT_SECONDS * fps))
    credits = started * tier_credits(RENDER_CREDIT_COSTS["video_10s"], width * height / 1_000_000)
    return 2 * credits if fps > VIDEO_DOUBLE_ABOVE_FPS else credits


def spin_credits(size: int, frames: int) -> int:
    """A spin: its frame size's credits, double above 72 frames."""
    credits = tier_credits(RENDER_CREDIT_COSTS["spin"], size * size / 1_000_000)
    return 2 * credits if frames > SPIN_DOUBLE_ABOVE_FRAMES else credits


def pack_part_credits(part: PackPart) -> int:
    """One part of a Campaign Pack, priced as the job of its kind would be; the ASET image is 1."""
    if part.kind == "still":
        return still_image_credits(part.width, part.height)
    if part.kind == "scope":
        return PACK_SCOPE_CREDITS
    if part.kind == "spin":
        return spin_credits(part.width, part.frames)
    return video_credits(part.width, part.height, part.fps, part.frames)


def render_job_cost(kind: str, spec: Spec) -> int:
    """The render credits a job holds, priced by the pixels it asks for; a Campaign Pack is the
    sum of its parts."""
    if kind == "still" and isinstance(spec, StillSpec):
        return still_image_credits(spec.width, spec.height)
    if kind == "angle_set" and isinstance(spec, AngleSetSpec):
        return len(spec.cameras) * still_image_credits(spec.width, spec.height)
    if kind == "turntable" and isinstance(spec, TurntableSpec):
        return video_credits(spec.width, spec.height, spec.fps, spec.frames)
    if kind == "spin" and isinstance(spec, SpinSpec):
        return spin_credits(spec.size, spec.frames)
    if kind == "campaign_pack" and isinstance(spec, CampaignPackSpec):
        return sum(pack_part_credits(part) for part in spec.parts())
    raise ValueError(f"No price for a '{kind}' job")
