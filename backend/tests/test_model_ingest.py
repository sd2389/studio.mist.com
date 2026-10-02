"""Model ingest: a saved model costs exactly one credit, and a refused one costs nothing."""

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.features.billing.quota_service import get_or_create_billing
from app.features.upload import service as upload_service
from app.models.scene import Scene


def balances(db, user) -> tuple[int, int]:
    """(model credits left, storage bytes used)."""
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.model_credits_balance, billing.storage_bytes_used


def scene_count(db) -> int:
    return db.execute(select(func.count(Scene.id))).scalar_one()


def test_a_scene_whose_credit_is_gone_at_commit_is_not_saved(db, sample_user):
    """The early credit check passed, then a concurrent save spent the last credit."""
    billing = get_or_create_billing(db, sample_user)
    billing.model_credits_balance = 0
    db.commit()
    now = datetime.utcnow()
    scene = Scene(model_key="customers/1/models/a-ring.glb", user_id=sample_user.id, created_at=now, updated_at=now)

    with pytest.raises(HTTPException) as exc:
        upload_service.save_scene_and_charge(db, scene, billing, 1_000)

    assert exc.value.status_code == 402
    assert scene_count(db) == 0
    assert balances(db, sample_user) == (0, 0)
