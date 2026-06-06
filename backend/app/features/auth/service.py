"""User registration, sessions, and password reset."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import (
    hash_password,
    new_reset_token,
    new_session_token,
    reset_token_expires_at,
    session_expires_at,
    verify_password,
)
from app.features.auth.email_service import send_contact_notification, send_password_reset_email
from app.features.admin.role import is_admin_email, maybe_promote_admin
from app.features.billing.quota_service import get_or_create_billing
from app.models.user import ContactMessage, PasswordResetToken, Session as DbSession, User
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


def _to_public(user: User) -> UserPublic:
    return UserPublic.model_validate(user)


def _create_session(db: Session, user: User) -> str:
    token = new_session_token()
    db.add(
        DbSession(
            token=token,
            user_id=user.id,
            expires_at=session_expires_at(),
        )
    )
    db.commit()
    return token


def sign_up(db: Session, body: SignUpRequest) -> AuthResponse:
    email = body.email.strip().lower()
    existing = db.execute(select(User).where(User.email == email)).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    now = datetime.utcnow()
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        name=(body.name or "").strip() or None,
        role="admin" if is_admin_email(email) else "user",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    get_or_create_billing(db, user)
    token = _create_session(db, user)
    return AuthResponse(user=_to_public(user), token=token)


def login(db: Session, body: LoginRequest) -> AuthResponse:
    email = body.email.strip().lower()
    user = db.execute(select(User).where(User.email == email)).scalars().first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    maybe_promote_admin(user)
    db.commit()
    token = _create_session(db, user)
    return AuthResponse(user=_to_public(user), token=token)


def logout(db: Session, token: str) -> MessageResponse:
    session = db.execute(select(DbSession).where(DbSession.token == token)).scalars().first()
    if session is not None:
        db.delete(session)
        db.commit()
    return MessageResponse(message="Logged out")


def forgot_password(db: Session, body: ForgotPasswordRequest) -> MessageResponse:
    email = body.email.strip().lower()
    user = db.execute(select(User).where(User.email == email)).scalars().first()
    if user is not None:
        token = new_reset_token()
        db.add(
            PasswordResetToken(
                token=token,
                user_id=user.id,
                expires_at=reset_token_expires_at(),
            )
        )
        db.commit()
        settings = get_settings()
        base = settings.app_public_url.rstrip("/")
        reset_url = f"{base}/reset-password#token={token}"
        send_password_reset_email(to=user.email, reset_url=reset_url)
    return MessageResponse(message="If that email exists, a reset link was sent.")


def reset_password(db: Session, body: ResetPasswordRequest) -> MessageResponse:
    row = db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == body.token)
    ).scalars().first()
    if row is None or row.used_at is not None or row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.password_hash = hash_password(body.password)
    user.updated_at = datetime.utcnow()
    row.used_at = datetime.utcnow()
    for session in db.execute(select(DbSession).where(DbSession.user_id == user.id)).scalars():
        db.delete(session)
    db.commit()
    return MessageResponse(message="Password updated. You can sign in with your new password.")


def update_profile(db: Session, user: User, body: UpdateProfileRequest) -> UserPublic:
    if body.name is not None:
        user.name = body.name.strip() or None
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return _to_public(user)


def change_password(db: Session, user: User, body: ChangePasswordRequest) -> MessageResponse:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.updated_at = datetime.utcnow()
    for session in db.execute(select(DbSession).where(DbSession.user_id == user.id)).scalars():
        db.delete(session)
    db.commit()
    return MessageResponse(message="Password updated. Please sign in again.")


def submit_contact(db: Session, body: ContactRequest) -> MessageResponse:
    db.add(
        ContactMessage(
            name=body.name.strip(),
            email=body.email.strip().lower(),
            message=body.message.strip(),
        )
    )
    db.commit()
    send_contact_notification(name=body.name, email=body.email, message=body.message)
    return MessageResponse(message="Thanks — we'll get back to you soon.")
