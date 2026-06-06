"""Billing HTTP adapter — account, checkout, portal, webhooks."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_feature
from app.database import get_db
from app.features.billing import service as billing_service
from app.features.billing.stripe_service import handle_webhook
from app.models.user import User
from app.schemas.billing import (
    CheckoutResponse,
    CheckoutSubscriptionRequest,
    CheckoutTopUpRequest,
    PortalResponse,
    PricingCatalog,
    UserBillingSnapshot,
)

router = APIRouter()


@router.get("/account", response_model=UserBillingSnapshot)
def get_account(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserBillingSnapshot:
    return billing_service.get_account(db, user)


@router.get("/pricing", response_model=PricingCatalog)
def pricing_catalog() -> PricingCatalog:
    return billing_service.get_pricing_catalog()


@router.post("/checkout/subscription", response_model=CheckoutResponse)
def checkout_subscription(
    body: CheckoutSubscriptionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_feature("billing")),
) -> CheckoutResponse:
    return billing_service.checkout_subscription(db, user, body.price_id)


@router.post("/checkout/topup", response_model=CheckoutResponse)
def checkout_topup(
    body: CheckoutTopUpRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_feature("billing")),
) -> CheckoutResponse:
    return billing_service.checkout_topup(db, user, body.pack_id)


@router.post("/portal", response_model=PortalResponse)
def billing_portal(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _: None = Depends(require_feature("billing")),
) -> PortalResponse:
    return billing_service.billing_portal(db, user)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
) -> dict[str, str]:
    payload = await request.body()
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")
    return handle_webhook(db, payload, stripe_signature)
