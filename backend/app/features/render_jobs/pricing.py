"""What a render job costs, from RENDER_CREDIT_COSTS in plans.py."""

from __future__ import annotations

from app.features.billing.plans import RENDER_CREDIT_COSTS
from app.features.render_jobs.specs import AngleSetSpec, Spec, StillSpec


def tier_credits(tiers: tuple[tuple[float, int], ...], megapixels: float) -> int:
    """The credits of the first tier whose size reaches `megapixels`."""
    for limit, credits in tiers:
        if megapixels <= limit:
            return credits
    raise ValueError(f"{megapixels:.1f} MP is larger than any priced size")


def still_image_credits(width: int, height: int) -> int:
    return tier_credits(RENDER_CREDIT_COSTS["still_image"], width * height / 1_000_000)


def render_job_cost(kind: str, spec: Spec) -> int:
    """The render credits a job holds, priced by the pixels it asks for."""
    if kind == "still" and isinstance(spec, StillSpec):
        return still_image_credits(spec.width, spec.height)
    if kind == "angle_set" and isinstance(spec, AngleSetSpec):
        return len(spec.cameras) * still_image_credits(spec.width, spec.height)
    raise ValueError(f"No price for a '{kind}' job")
