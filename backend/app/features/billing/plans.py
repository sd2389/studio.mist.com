"""Plan tiers and quota allotments — single source of truth for billing."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

PlanTier = Literal["free", "grow", "studio"]

GB = 1024**3


@dataclass(frozen=True)
class PlanQuotas:
    model_credits: int
    ai_image_credits: int
    custom_material_credits: int
    custom_asset_credits: int
    storage_bytes: int
    max_variants_per_model: int
    max_image_resolution: int
    watermark_exports: bool


PLAN_QUOTAS: dict[PlanTier, PlanQuotas] = {
    "free": PlanQuotas(
        model_credits=50,
        ai_image_credits=150,
        custom_material_credits=5,
        custom_asset_credits=5,
        storage_bytes=5 * GB,
        max_variants_per_model=3,
        max_image_resolution=4096,
        watermark_exports=True,
    ),
    "grow": PlanQuotas(
        model_credits=75,
        ai_image_credits=150,
        custom_material_credits=25,
        custom_asset_credits=25,
        storage_bytes=150 * GB,
        max_variants_per_model=15,
        max_image_resolution=8192,
        watermark_exports=False,
    ),
    "studio": PlanQuotas(
        model_credits=500,
        ai_image_credits=500,
        custom_material_credits=100,
        custom_asset_credits=100,
        storage_bytes=500 * GB,
        max_variants_per_model=50,
        max_image_resolution=8192,
        watermark_exports=False,
    ),
}

PLAN_LABELS: dict[PlanTier, str] = {
    "free": "Free",
    "grow": "Grow",
    "studio": "Studio",
}

TOP_UP_PACKS: dict[str, dict[str, int | str]] = {
    "model_10": {"label": "10 model credits", "credits": 10, "kind": "model"},
    "model_25": {"label": "25 model credits", "credits": 25, "kind": "model"},
    "ai_50": {"label": "50 AI image credits", "credits": 50, "kind": "ai"},
    "ai_150": {"label": "150 AI image credits", "credits": 150, "kind": "ai"},
}


def normalize_tier(raw: str | None) -> PlanTier:
    value = (raw or "free").lower().strip()
    if value in PLAN_QUOTAS:
        return value  # type: ignore[return-value]
    return "free"


def get_quotas(tier: PlanTier) -> PlanQuotas:
    return PLAN_QUOTAS[tier]
