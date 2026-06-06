"""Admin HTTP adapter — users, credits, support ops."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_admin_user
from app.database import get_db
from app.features.admin import service as admin_service
from app.features.feature_flags import service as feature_flag_service
from app.models.user import User
from app.schemas.admin import (
    AdminAnalytics,
    AdminOverview,
    AdminUserDetail,
    AdminUserListResponse,
    BillingEventListResponse,
    ContactMessageListResponse,
    CreditAdjustRequest,
    ImpersonateResponse,
    ResetAllotmentsRequest,
    SetActiveRequest,
    TopUserRow,
)
from app.schemas.feature_flags import (
    FeatureFlagRow,
    FeatureFlagsAdminResponse,
    SetFeatureFlagRequest,
)

router = APIRouter()


@router.get("/overview", response_model=AdminOverview)
def overview(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> AdminOverview:
    return admin_service.get_overview(db)


@router.get("/analytics", response_model=AdminAnalytics)
def analytics(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> AdminAnalytics:
    return admin_service.get_analytics(db)


@router.get("/analytics/top-users", response_model=list[TopUserRow])
def top_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[TopUserRow]:
    return admin_service.list_top_users(db, limit=limit)


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
    q: Annotated[str | None, Query(max_length=255)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserListResponse:
    return admin_service.list_users(db, q=q, limit=limit, offset=offset)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> AdminUserDetail:
    return admin_service.get_user_detail(db, user_id)


@router.patch("/users/{user_id}/active", response_model=AdminUserDetail)
def set_active(
    user_id: int,
    body: SetActiveRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> AdminUserDetail:
    return admin_service.set_user_active(db, user_id, is_active=body.is_active, admin=admin)


@router.post("/users/{user_id}/credits", response_model=AdminUserDetail)
def adjust_credits(
    user_id: int,
    body: CreditAdjustRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> AdminUserDetail:
    return admin_service.adjust_user_credits(
        db,
        user_id,
        kind=body.kind,
        delta=body.delta,
        reason=body.reason,
        admin=admin,
    )


@router.post("/users/{user_id}/reset-allotments", response_model=AdminUserDetail)
def reset_allotments(
    user_id: int,
    body: ResetAllotmentsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> AdminUserDetail:
    return admin_service.reset_user_allotments(db, user_id, tier=body.tier, admin=admin)


@router.post("/users/{user_id}/impersonate", response_model=ImpersonateResponse)
def impersonate(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> ImpersonateResponse:
    return admin_service.impersonate_user(db, user_id, admin)


@router.get("/billing-events", response_model=BillingEventListResponse)
def billing_events(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> BillingEventListResponse:
    return admin_service.list_billing_events(db, limit=limit, offset=offset)


@router.get("/contact-messages", response_model=ContactMessageListResponse)
def contact_messages(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ContactMessageListResponse:
    return admin_service.list_contact_messages(db, limit=limit, offset=offset)


@router.get("/features", response_model=FeatureFlagsAdminResponse)
def list_features(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
) -> FeatureFlagsAdminResponse:
    return feature_flag_service.list_for_admin(db)


@router.patch("/features/{key}", response_model=FeatureFlagRow)
def set_feature(
    key: str,
    body: SetFeatureFlagRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> FeatureFlagRow:
    return feature_flag_service.apply_update(db, key, body, admin)
