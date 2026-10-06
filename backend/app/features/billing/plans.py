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
    render_credits: int
    custom_material_credits: int
    custom_asset_credits: int
    storage_bytes: int
    max_variants_per_model: int
    # Longest side of a still or a video frame.
    max_image_resolution: int
    max_polygons: int
    watermark_exports: bool
    # Server exports (docs/adr/0005-server-exports.md). The job and video limits are the
    # ADR's proposals, still open questions for the owner.
    # Several scenes or variants in one request (POST /render-jobs/bulk).
    batch_export: bool
    campaign_pack: bool
    # One owner's jobs a worker runs at once, and their unfinished (waiting or running) jobs.
    max_running_jobs: int
    max_queued_jobs: int
    max_video_fps: int
    max_video_seconds: int
    # 8K turntables are shorter; 0 means none.
    max_8k_video_seconds: int
    max_spin_frames: int
    max_spin_size: int


PLAN_QUOTAS: dict[PlanTier, PlanQuotas] = {
    "free": PlanQuotas(
        # Enough to try the studio on a few real pieces; packs and plans add more.
        model_credits=3,
        ai_image_credits=25,
        render_credits=25,
        custom_material_credits=5,
        custom_asset_credits=5,
        storage_bytes=5 * GB,
        max_variants_per_model=3,
        max_image_resolution=4096,
        max_polygons=100_000,
        watermark_exports=True,
        batch_export=False,
        campaign_pack=False,
        max_running_jobs=1,
        max_queued_jobs=5,
        max_video_fps=30,
        max_video_seconds=20,
        max_8k_video_seconds=0,
        max_spin_frames=72,
        max_spin_size=1080,
    ),
    "grow": PlanQuotas(
        model_credits=75,
        ai_image_credits=150,
        render_credits=300,
        custom_material_credits=25,
        custom_asset_credits=25,
        storage_bytes=150 * GB,
        max_variants_per_model=15,
        max_image_resolution=8192,
        max_polygons=500_000,
        watermark_exports=False,
        batch_export=True,
        campaign_pack=True,
        max_running_jobs=2,
        max_queued_jobs=20,
        max_video_fps=60,
        max_video_seconds=60,
        max_8k_video_seconds=20,
        max_spin_frames=144,
        max_spin_size=2048,
    ),
    "studio": PlanQuotas(
        model_credits=500,
        ai_image_credits=500,
        render_credits=1500,
        custom_material_credits=100,
        custom_asset_credits=100,
        storage_bytes=500 * GB,
        max_variants_per_model=50,
        max_image_resolution=8192,
        max_polygons=2_000_000,
        watermark_exports=False,
        batch_export=True,
        campaign_pack=True,
        max_running_jobs=4,
        max_queued_jobs=50,
        max_video_fps=60,
        max_video_seconds=60,
        max_8k_video_seconds=20,
        max_spin_frames=144,
        max_spin_size=2048,
    ),
}

# Render credits, as ADR 0005 proposes them (an open question for the owner); pricing.py applies
# them. One credit is about one 2K still. Each tier is (up to this many megapixels, credits).
RENDER_CREDIT_COSTS: dict[str, tuple[tuple[float, int], ...]] = {
    # A still, per image: 2K 16:9 and 2000² → 1; 4K 16:9, 3000² → 2; 4000² → 3; 8K → 4.
    "still_image": ((4.2, 1), (9.0, 2), (17.0, 3), (36.0, 4)),
    # A turntable, per started 10 seconds, by frame size: 720p → 2; 1080p and 1080² → 3;
    # 4K → 8; 8K → 20. Above 30 fps it counts double.
    "video_10s": ((1.0, 2), (2.1, 3), (8.3, 8), (36.0, 20)),
    # A spin of up to 72 frames: 1080² → 2; 2048² → 4. Up to 144 frames counts double.
    "spin": ((1.2, 2), (4.2, 4)),
    # A Campaign Pack is the sum of its images, turntables and spins, plus 1 for the ASET image.
    # A conversion costs no render credit: a design costs 1 model credit, as an upload does.
}

# Most jobs one POST /render-jobs/bulk may create (ADR 0005's default, an open question).
MAX_BULK_RENDER_JOBS = 100

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

MB = 1024**2


@dataclass(frozen=True)
class BatchLimits:
    """What one bulk upload may hold (docs/adr/0006-bulk-pipeline.md, "Limits for batches")."""

    max_designs: int  # 0: the plan has no bulk upload
    max_bytes: int  # every file of the batch, companions included
    max_file_bytes: int  # one CAD file or companion
    max_open_batches: int  # batches not yet finished (draft or processing)


# The ADR's defaults, open questions for the owner.
BATCH_LIMITS: dict[PlanTier, BatchLimits] = {
    "free": BatchLimits(max_designs=0, max_bytes=0, max_file_bytes=100 * MB, max_open_batches=3),
    "grow": BatchLimits(max_designs=100, max_bytes=5 * GB, max_file_bytes=100 * MB, max_open_batches=3),
    "studio": BatchLimits(max_designs=500, max_bytes=20 * GB, max_file_bytes=100 * MB, max_open_batches=3),
}


def normalize_tier(raw: str | None) -> PlanTier:
    value = (raw or "free").lower().strip()
    if value in PLAN_QUOTAS:
        return value  # type: ignore[return-value]
    return "free"


def get_quotas(tier: PlanTier) -> PlanQuotas:
    return PLAN_QUOTAS[tier]


def get_batch_limits(tier: PlanTier) -> BatchLimits:
    return BATCH_LIMITS[tier]
