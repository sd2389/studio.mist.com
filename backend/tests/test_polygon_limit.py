"""Polygon plan limit assert (upload gate)."""

import pytest
from fastapi import HTTPException

from app.features.billing.quota_service import assert_polygon_limit, get_or_create_billing


def test_assert_polygon_limit_allows_at_cap(db, sample_user):
    billing = assert_polygon_limit(db, sample_user, 100_000)
    assert billing is not None


def test_assert_polygon_limit_402_when_over_free_cap(db, sample_user):
    get_or_create_billing(db, sample_user)  # defaults free
    with pytest.raises(HTTPException) as exc:
        assert_polygon_limit(db, sample_user, 100_001)
    assert exc.value.status_code == 402
    assert "Polygon limit" in str(exc.value.detail)


def test_assert_polygon_limit_grow_cap(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    billing.plan_tier = "grow"
    db.commit()
    assert_polygon_limit(db, sample_user, 500_000)
    with pytest.raises(HTTPException) as exc:
        assert_polygon_limit(db, sample_user, 500_001)
    assert exc.value.status_code == 402


def test_assert_polygon_limit_rejects_negative(db, sample_user):
    with pytest.raises(HTTPException) as exc:
        assert_polygon_limit(db, sample_user, -1)
    assert exc.value.status_code == 400


# --- Upload API wiring ---------------------------------------------------


def test_register_request_requires_polygon_count():
    from pydantic import ValidationError

    from app.schemas.upload import RegisterRequest

    with pytest.raises(ValidationError):
        RegisterRequest(key="users/1/models/a.glb")


def test_register_request_accepts_polygon_count():
    from app.schemas.upload import RegisterRequest

    body = RegisterRequest(key="users/1/models/a.glb", polygon_count=50_000)
    assert body.polygon_count == 50_000


def test_direct_save_rejects_over_cap_before_consuming_model_credit(db, sample_user):
    from model_samples import glb_with_triangles

    from app.features.upload import service as upload_service

    billing = get_or_create_billing(db, sample_user)
    before = billing.model_credits_balance

    with pytest.raises(HTTPException) as exc:
        upload_service.save_direct_multipart(
            db,
            user=sample_user,
            filename="model.glb",
            body=glb_with_triangles(100_001),
            model_config_raw=None,
            slot_selections_raw=None,
            scene_settings_raw=None,
        )

    assert exc.value.status_code == 402
    db.refresh(billing)
    assert billing.model_credits_balance == before
