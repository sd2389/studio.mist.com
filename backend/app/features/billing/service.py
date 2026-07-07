"""Billing feature orchestration — account snapshot and pricing catalog."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.features.billing.plans import PLAN_LABELS, PLAN_QUOTAS, TOP_UP_PACKS, PlanTier
from app.features.billing.quota_service import _features_for_tier, get_or_create_billing, snapshot
from app.models.user import User
from app.schemas.billing import (
    CheckoutResponse,
    PlanFeatures,
    PortalResponse,
    PricingCatalog,
    PricingPlan,
    QuotaBalances,
    UserBillingSnapshot,
)


def get_account(db: Session, user: User) -> UserBillingSnapshot:
    get_or_create_billing(db, user)
    return snapshot(db, user)


def _quota_balances_for_tier(tier: PlanTier) -> QuotaBalances:
    quotas = PLAN_QUOTAS[tier]
    return QuotaBalances(
        model_credits=quotas.model_credits,
        ai_image_credits=quotas.ai_image_credits,
        render_credits=quotas.render_credits,
        custom_material_credits=quotas.custom_material_credits,
        custom_asset_credits=quotas.custom_asset_credits,
        storage_bytes_used=0,
        storage_bytes_limit=quotas.storage_bytes,
    )


def get_pricing_catalog() -> PricingCatalog:
    settings = get_settings()
    price_ids = {
        "grow": settings.stripe_price_grow,
        "studio": settings.stripe_price_studio,
    }
    monthly_labels = {"free": "$0", "grow": "$49/mo", "studio": "$199/mo"}

    plans: list[PricingPlan] = []
    for tier in ("free", "grow", "studio"):
        plans.append(
            PricingPlan(
                tier=tier,
                label=PLAN_LABELS[tier],
                monthly_price_label=monthly_labels[tier],
                quotas=_quota_balances_for_tier(tier),  # type: ignore[arg-type]
                features=_features_for_tier(tier),  # type: ignore[arg-type]
                stripe_price_id=price_ids.get(tier),
            )
        )

    topup_prices = {
        "model_10": settings.stripe_price_topup_model_10,
        "model_25": settings.stripe_price_topup_model_25,
        "ai_50": settings.stripe_price_topup_ai_50,
        "ai_150": settings.stripe_price_topup_ai_150,
    }
    top_ups = [
        {
            "id": pack_id,
            "label": pack["label"],
            "credits": pack["credits"],
            "kind": pack["kind"],
            "stripe_price_id": topup_prices.get(pack_id),
        }
        for pack_id, pack in TOP_UP_PACKS.items()
    ]

    return PricingCatalog(plans=plans, top_ups=top_ups)


def checkout_subscription(db: Session, user: User, price_id: str) -> CheckoutResponse:
    from app.features.billing.stripe_service import create_subscription_checkout

    url = create_subscription_checkout(db, user, price_id)
    return CheckoutResponse(url=url)


def checkout_topup(db: Session, user: User, pack_id: str) -> CheckoutResponse:
    from app.features.billing.stripe_service import create_topup_checkout

    url = create_topup_checkout(db, user, pack_id)
    return CheckoutResponse(url=url)


def billing_portal(db: Session, user: User) -> PortalResponse:
    from app.features.billing.stripe_service import create_portal_session

    url = create_portal_session(db, user)
    return PortalResponse(url=url)
