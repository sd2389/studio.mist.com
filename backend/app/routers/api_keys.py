"""API keys on the profile page: make, list and revoke them (features/api_keys/service.py).

These are session routes: get_current_user refuses an API key, so a key can't manage keys. The
web app reaches them through its proxies (src/app/api/api-keys/), which turn the httpOnly,
SameSite=Lax session cookie into the Authorization header, as every signed-in mutating route
does; the API reads no cookie, so a request another site makes the browser send carries no session.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user, require_feature
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.features.api_keys import service as api_key_service
from app.models.user import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreated, ApiKeyList, ApiKeyOut

router = APIRouter()

_key_change = rate_limit_dependency(
    "api-keys",
    max_requests=get_settings().rate_limit_api_key_changes_per_hour,
    require_auth=True,
)
_KeyId = Annotated[int, Path(ge=1, le=2_147_483_647)]


@router.get("", response_model=ApiKeyList)
def list_keys(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ApiKeyList:
    return api_key_service.list_keys(db, user)


# The customer API is part of the bulk pipeline (ADR 0006): no new key while its flag is off.
@router.post(
    "",
    status_code=201,
    response_model=ApiKeyCreated,
    dependencies=[Depends(require_feature("bulk_pipeline", hidden=True))],
)
def create_key(
    body: ApiKeyCreate,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_key_change)] = None,
) -> ApiKeyCreated:
    """The new key, with its secret in this answer only."""
    response.headers["Cache-Control"] = "no-store"
    return api_key_service.create_key(db, user, body)


@router.delete("/{key_id}", response_model=ApiKeyOut)
def revoke_key(
    key_id: _KeyId,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_key_change)] = None,
) -> ApiKeyOut:
    return api_key_service.revoke_key(db, user, key_id)
