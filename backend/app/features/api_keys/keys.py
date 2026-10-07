"""What an API key is: its scopes, its format, and the hash that is all the database keeps.

A key reads `mist_<prefix>_<secret>`: the prefix is 8 random lowercase letters and digits, not
secret, unique, and how a request's key is found; the secret is 32 random bytes from `secrets`
in base62 (43 characters). The database keeps the prefix and an HMAC-SHA-256 of the whole key
with API_KEY_PEPPER, compared in constant time (docs/adr/0006-bulk-pipeline.md).
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import string
from typing import Literal, get_args

from fastapi import HTTPException

from app.config import get_settings

ApiScope = Literal[
    "batches:read",
    "batches:write",
    "render_jobs:read",
    "render_jobs:write",
    "scenes:read",
    "webhooks:write",
]
API_SCOPES: tuple[ApiScope, ...] = get_args(ApiScope)

KEY_MARKER = "mist_"
PREFIX_LENGTH = 8
SECRET_BYTES = 32
# 62**43 > 2**256: every 32-byte secret fits in 43 base62 characters.
SECRET_LENGTH = 43

_PREFIX_ALPHABET = string.ascii_lowercase + string.digits
_BASE62 = string.digits + string.ascii_uppercase + string.ascii_lowercase
_KEY_PATTERN = re.compile(
    rf"^{KEY_MARKER}([a-z0-9]{{{PREFIX_LENGTH}}})_[0-9A-Za-z]{{{SECRET_LENGTH}}}$"
)
# Outside production only, so a fresh checkout and the tests need no setting.
_DEV_PEPPER = "development-only-api-key-pepper"
_MIN_PEPPER_LENGTH = 32


def is_api_key(token: str) -> bool:
    """Whether a bearer token has an API key's form. A session token (43 URL-safe characters)
    never does, whatever it starts with."""
    return _KEY_PATTERN.match(token) is not None


def prefix_of(key: str) -> str | None:
    """The prefix of a well-formed key, else None."""
    match = _KEY_PATTERN.match(key)
    return match.group(1) if match else None


def _base62(data: bytes, length: int) -> str:
    number = int.from_bytes(data, "big")
    digits: list[str] = []
    while number:
        number, remainder = divmod(number, 62)
        digits.append(_BASE62[remainder])
    return "".join(reversed(digits)).rjust(length, "0")


def new_prefix() -> str:
    return "".join(secrets.choice(_PREFIX_ALPHABET) for _ in range(PREFIX_LENGTH))


def new_key(prefix: str) -> str:
    """A whole key under `prefix`, with a fresh secret."""
    return f"{KEY_MARKER}{prefix}_{_base62(secrets.token_bytes(SECRET_BYTES), SECRET_LENGTH)}"


def _pepper() -> bytes:
    settings = get_settings()
    pepper = settings.api_key_pepper
    if settings.app_env.lower() != "production":
        return (pepper or _DEV_PEPPER).encode()
    if not pepper or len(pepper) < _MIN_PEPPER_LENGTH:
        raise HTTPException(status_code=503, detail="API keys are not available")
    return pepper.encode()


def hash_key(key: str) -> str:
    """Hex HMAC-SHA-256 of the whole key with the server's pepper."""
    return hmac.new(_pepper(), key.encode(), hashlib.sha256).hexdigest()


def hash_matches(key: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_key(key), stored_hash)
