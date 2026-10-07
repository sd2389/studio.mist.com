"""FastAPI dependencies shared across routers."""

from datetime import datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.features.api_keys.keys import is_api_key
from app.models.user import Session as DbSession
from app.models.user import User


def extract_bearer(authorization: str | None) -> str | None:
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
    """The signed-in user of a session token. An API key is refused: keys work only on /v1
    (features/api_keys/principal.py), and sessions never do there."""
    token = extract_bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if is_api_key(token):
        raise HTTPException(status_code=401, detail="API keys work only on /v1")
    user = resolve_user_from_token(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


def get_optional_user(
    db: Session = Depends(get_db),
    authorization: Annotated[str | None, Header()] = None,
) -> User | None:
    """As get_current_user, but None for no session; an API key is no session."""
    token = extract_bearer(authorization)
    if not token or is_api_key(token):
        return None
    return resolve_user_from_token(db, token)


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_feature(key: str, *, hidden: bool = False):
    """Block the route when an admin-disabled product feature is off: 503, or for a `hidden`
    feature 404, as if the route weren't there (the web app's proxies answer the same)."""

    def _check(
        db: Session = Depends(get_db),
    ) -> None:
        from app.features.feature_flags import service as feature_flag_service

        if feature_flag_service.is_enabled(db, key):
            return
        if hidden:
            raise HTTPException(status_code=404, detail="Not Found")
        raise HTTPException(status_code=503, detail=f"Feature '{key}' is temporarily unavailable")

    return _check
