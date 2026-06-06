"""Public feature flag snapshot — no auth required."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.features.feature_flags import service as feature_flag_service
from app.schemas.feature_flags import FeatureFlagsSnapshot

router = APIRouter()


@router.get("", response_model=FeatureFlagsSnapshot)
def get_flags(db: Session = Depends(get_db)) -> FeatureFlagsSnapshot:
    return feature_flag_service.snapshot(db)
