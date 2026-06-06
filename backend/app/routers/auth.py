"""Auth HTTP adapter — delegates to auth feature service."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.deps import _extract_bearer, get_current_user
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.features.auth import service as auth_service
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    ContactRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ResetPasswordRequest,
    SignUpRequest,
    UpdateProfileRequest,
    UserPublic,
)

router = APIRouter()

_auth_signup_limit = rate_limit_dependency("auth-signup", max_requests=20, window_seconds=3600)
_auth_login_limit = rate_limit_dependency("auth-login", max_requests=30, window_seconds=3600)
_auth_forgot_limit = rate_limit_dependency("auth-forgot-password", max_requests=10, window_seconds=3600)
_auth_contact_limit = rate_limit_dependency("auth-contact", max_requests=10, window_seconds=3600)
_auth_reset_limit = rate_limit_dependency("auth-reset-password", max_requests=10, window_seconds=3600)


@router.post("/signup", response_model=AuthResponse)
def signup(
    body: SignUpRequest,
    db: Session = Depends(get_db),
    _rate: Annotated[None, Depends(_auth_signup_limit)] = None,
) -> AuthResponse:
    return auth_service.sign_up(db, body)


@router.post("/login", response_model=AuthResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    _rate: Annotated[None, Depends(_auth_login_limit)] = None,
) -> AuthResponse:
    return auth_service.login(db, body)


@router.post("/logout", response_model=MessageResponse)
def logout(
    db: Session = Depends(get_db),
    authorization: Annotated[str | None, Header()] = None,
) -> MessageResponse:
    token = _extract_bearer(authorization)
    if not token:
        return MessageResponse(message="Logged out")
    return auth_service.logout(db, token)


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(user)


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    _rate: Annotated[None, Depends(_auth_forgot_limit)] = None,
) -> MessageResponse:
    return auth_service.forgot_password(db, body)


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _rate: Annotated[None, Depends(_auth_reset_limit)] = None,
) -> MessageResponse:
    return auth_service.reset_password(db, body)


@router.post("/contact", response_model=MessageResponse)
def contact(
    body: ContactRequest,
    db: Session = Depends(get_db),
    _rate: Annotated[None, Depends(_auth_contact_limit)] = None,
) -> MessageResponse:
    return auth_service.submit_contact(db, body)


@router.patch("/profile", response_model=UserPublic)
def update_profile(
    body: UpdateProfileRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserPublic:
    return auth_service.update_profile(db, user, body)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    return auth_service.change_password(db, user, body)
