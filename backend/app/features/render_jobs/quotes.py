"""What render jobs would cost and make, before anything is held or queued (ADR 0005, "Credits").

A quote plans a create request as creating it would, so it refuses what creating would refuse.
A bulk quote prices each job on its own and lists the ones that can't be made, so the studio's
"Multiple" mode can show the price of the rest and why the others are out.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.features.billing.plans import get_quotas, normalize_tier
from app.features.billing.quota_service import get_or_create_billing
from app.features.render_jobs.job_files import frame_size
from app.features.render_jobs.service import PlannedJob, bulk_refusal, check_bulk_size, plan_job
from app.models.user import User
from app.schemas.render_job import (
    RenderJobBulkQuote,
    RenderJobBulkQuoteItem,
    RenderJobCreate,
    RenderJobQuote,
    RenderJobRefusal,
)


def _short_of_credits(credits: int, balance: int) -> list[str]:
    if balance >= credits:
        return []
    return [f"This needs {credits} render credits and {balance} are left."]


def _quote(planned: PlannedJob, watermark: bool, warnings: list[str]) -> RenderJobQuote:
    width, height = frame_size(planned.kind, planned.spec)
    return RenderJobQuote(
        credits=planned.credits,
        width=width,
        height=height,
        frames=planned.spec["frames"],
        outputs=planned.spec["output_names"],
        watermark=watermark,
        warnings=warnings,
    )


def quote_job(db: Session, user: User, body: RenderJobCreate) -> RenderJobQuote:
    """What a create request would cost and make; 400, 402 or 404 as creating it would answer."""
    planned = plan_job(db, user, body)
    billing = get_or_create_billing(db, user)
    watermark = get_quotas(normalize_tier(billing.plan_tier)).watermark_exports
    warnings = [*planned.warnings, *_short_of_credits(planned.credits, billing.render_credits_balance)]
    return _quote(planned, watermark, warnings)


def _quote_item(db: Session, user: User, body: RenderJobCreate, watermark: bool) -> RenderJobBulkQuoteItem:
    try:
        planned = plan_job(db, user, body)
    except HTTPException as exc:
        return RenderJobBulkQuoteItem(refused=RenderJobRefusal(status=exc.status_code, detail=str(exc.detail)))
    return RenderJobBulkQuoteItem(quote=_quote(planned, watermark, list(planned.warnings)))


def quote_jobs(db: Session, user: User, bodies: list[RenderJobCreate]) -> RenderJobBulkQuote:
    """What a bulk request would cost and make, job by job.

    A job that can't be made (a bad spec or look, a size above the plan's cap, a scene or
    variant that isn't the caller's) is refused with the status and reason creating it would
    answer, and costs nothing in the total. A plan without bulk requests refuses the request
    as a whole, and its jobs are still priced.
    """
    check_bulk_size(len(bodies))
    billing = get_or_create_billing(db, user)
    tier = normalize_tier(billing.plan_tier)
    items = [_quote_item(db, user, body, get_quotas(tier).watermark_exports) for body in bodies]
    credits = sum(item.quote.credits for item in items if item.quote is not None)
    refusal = bulk_refusal(tier)
    return RenderJobBulkQuote(
        credits=credits,
        items=items,
        refused=RenderJobRefusal(status=402, detail=refusal) if refusal else None,
        warnings=_short_of_credits(credits, billing.render_credits_balance),
    )
