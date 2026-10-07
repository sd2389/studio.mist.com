"""The customer API, /v1 (docs/adr/0006-bulk-pipeline.md, Phase G): API keys only.

G1 mounts only `whoami`, which proves the key and its owner; G2 adds the endpoints, each behind
`api_principal(<scope>)`. Hidden (404) while the `bulk_pipeline` flag is off.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_feature
from app.database import get_db
from app.features.api_keys.principal import ApiPrincipal, api_principal
from app.features.api_keys.service import plan_tier_of
from app.schemas.api_key import ApiKeyOut, WhoAmI

router = APIRouter(dependencies=[Depends(require_feature("bulk_pipeline", hidden=True))])


@router.get("/whoami", response_model=WhoAmI)
def whoami(
    principal: Annotated[ApiPrincipal, Depends(api_principal())],
    db: Session = Depends(get_db),
) -> WhoAmI:
    return WhoAmI(
        key=ApiKeyOut.model_validate(principal.key),
        user_id=principal.user.id,
        plan_tier=plan_tier_of(db, principal.user),
    )
