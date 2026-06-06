"""FastAPI dependencies shared across routers."""

from datetime import datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import Session as DbSession
from app.models.user import User


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def resolve_user_from_token(db: Session, token: str) -> User | None:
    row = db.execute(
        select(DbSession, User)
        .join(User, User.id == DbSession.user_id)
        .where(DbSession.token == token)
    ).first()
    if row is None:
        return None
    session, user = row
    if session.expires_at < datetime.utcnow():
        db.delete(session)
        db.commit()
        return None
    if not user.is_active:
        return None
    return user


def get_current_user(
    db: Session = Depends(get_db),
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = resolve_user_from_token(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def get_optional_user(
    db: Session = Depends(get_db),
    authorization: Annotated[str | None, Header()] = None,
) -> User | None:
    token = _extract_bearer(authorization)
    if not token:
        return None
    return resolve_user_from_token(db, token)


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_feature(key: str):
    """Block the route when an admin-disabled product feature is off."""

    def _check(
        db: Session = Depends(get_db),
    ) -> None:
        from app.features.feature_flags import service as feature_flag_service

        if not feature_flag_service.is_enabled(db, key):
            raise HTTPException(status_code=503, detail=f"Feature '{key}' is temporarily unavailable")

    return _check
