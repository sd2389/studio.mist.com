import secrets
from datetime import datetime, timedelta

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SESSION_TTL_DAYS = 30
RESET_TOKEN_TTL_HOURS = 24


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def new_reset_token() -> str:
    return secrets.token_urlsafe(32)


def session_expires_at() -> datetime:
    return datetime.utcnow() + timedelta(days=SESSION_TTL_DAYS)


def reset_token_expires_at() -> datetime:
    return datetime.utcnow() + timedelta(hours=RESET_TOKEN_TTL_HOURS)
