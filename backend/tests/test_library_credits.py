"""Library credits: an accepted asset or material costs exactly one credit, committed with it,
and a save whose credit is gone keeps nothing, even when another save took the last one."""

import io

import pytest
from fastapi import HTTPException, UploadFile
from image_samples import raster
from sqlalchemy import update

from app.core import storage as storage_mod
from app.core.storage.local import LocalBackend
from app.features.billing.plans import get_quotas
from app.features.billing.quota_service import (
    consume_custom_asset_credit,
    consume_custom_material_credit,
    get_or_create_billing,
)
from app.features.user_library import assets_service, materials_service, swatch_service
from app.models.billing import UserBilling
from app.models.user_library import UserAsset, UserMaterial
from app.schemas.library import CreateUserMaterialRequest

BACKGROUND = raster("PNG")


@pytest.fixture()
def store(tmp_path, monkeypatch) -> LocalBackend:
    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    return backend


@pytest.fixture()
def billing(db, sample_user) -> UserBilling:
    return get_or_create_billing(db, sample_user)


def set_balances(db, billing: UserBilling, **values) -> None:
    """Change the row underneath the session, as a concurrent request would: the loaded
    `billing` object keeps the values it read before."""
    db.execute(update(UserBilling.__table__).where(UserBilling.__table__.c.id == billing.id).values(**values))
    db.commit()


def fresh(db, billing: UserBilling) -> UserBilling:
    db.refresh(billing)
    return billing


def stored_assets(store: LocalBackend, user_id: int) -> list[str]:
    return sorted(p.name for p in store._root.glob(f"customers/{user_id}/assets/*/*"))


def upload_background(db, user):
    return assets_service.upload_asset(
        db, user.id, file=UploadFile(io.BytesIO(BACKGROUND), filename="backdrop.png"), asset_type="background"
    )


def create_material(db, user):
    return materials_service.create_material(db, user.id, CreateUserMaterialRequest(kind="metal", label="Rose"))


# --- The conditional updates ---------------------------------------------------------


def test_an_asset_credit_and_its_storage_wait_for_the_callers_commit(db, billing):
    credits = billing.custom_asset_credits_balance
    consume_custom_asset_credit(db, billing, 500)
    db.rollback()
    assert (fresh(db, billing).custom_asset_credits_balance, billing.storage_bytes_used) == (credits, 0)

    consume_custom_asset_credit(db, billing, 500)
    db.commit()
    assert (fresh(db, billing).custom_asset_credits_balance, billing.storage_bytes_used) == (credits - 1, 500)


@pytest.mark.parametrize(
    ("taken", "detail"),
    [
        ({"custom_asset_credits_balance": 0}, "No custom asset credits remaining."),
        ({"storage_bytes_used": get_quotas("free").storage_bytes - 100}, "Storage limit reached."),
    ],
    ids=["last-credit", "last-bytes"],
)
def test_an_asset_credit_or_storage_another_upload_took_is_not_spent_twice(db, billing, taken, detail):
    set_balances(db, billing, **taken)
    with pytest.raises(HTTPException) as exc:
        consume_custom_asset_credit(db, billing, 500)
    assert (exc.value.status_code, exc.value.detail) == (402, detail)


def test_a_material_credit_waits_for_the_callers_commit_and_is_never_spent_twice(db, billing):
    credits = billing.custom_material_credits_balance
    consume_custom_material_credit(db, billing)
    db.rollback()
    assert fresh(db, billing).custom_material_credits_balance == credits

    set_balances(db, billing, custom_material_credits_balance=0)
    with pytest.raises(HTTPException) as exc:
        consume_custom_material_credit(db, billing)
    assert exc.value.status_code == 402


# --- Assets ------------------------------------------------------------------------------


def test_an_uploaded_asset_costs_one_credit_and_its_bytes(db, sample_user, billing, store):
    credits = billing.custom_asset_credits_balance

    upload_background(db, sample_user)

    assert (fresh(db, billing).custom_asset_credits_balance, billing.storage_bytes_used) == (credits - 1, len(BACKGROUND))
    assert len(stored_assets(store, sample_user.id)) == db.query(UserAsset).count() == 1


def test_two_uploads_racing_for_the_last_asset_credit_cannot_both_win(db, sample_user, billing, store, monkeypatch):
    """Both pass the early check on a balance of 1; the second finds it spent at commit."""
    set_balances(db, billing, custom_asset_credits_balance=1)
    stale = fresh(db, billing)
    monkeypatch.setattr(assets_service, "assert_custom_asset_credit", lambda db, user, size: stale)

    upload_background(db, sample_user)
    with pytest.raises(HTTPException) as exc:
        upload_background(db, sample_user)

    assert exc.value.status_code == 402
    assert len(stored_assets(store, sample_user.id)) == db.query(UserAsset).count() == 1
    assert fresh(db, billing).custom_asset_credits_balance == 0


# --- Materials ---------------------------------------------------------------------------


def test_a_created_material_costs_one_credit(db, sample_user, billing, monkeypatch):
    monkeypatch.setattr(swatch_service, "generate_material_swatch", lambda db, row: True)
    credits = billing.custom_material_credits_balance

    create_material(db, sample_user)

    assert fresh(db, billing).custom_material_credits_balance == credits - 1
    assert db.query(UserMaterial).count() == 1


def test_two_saves_racing_for_the_last_material_credit_cannot_both_win(db, sample_user, billing, monkeypatch):
    swatches: list[int] = []
    monkeypatch.setattr(swatch_service, "generate_material_swatch", lambda db, row: swatches.append(row.id))
    set_balances(db, billing, custom_material_credits_balance=1)
    stale = fresh(db, billing)
    monkeypatch.setattr(materials_service, "assert_custom_material_credit", lambda db, user: stale)

    create_material(db, sample_user)
    with pytest.raises(HTTPException) as exc:
        create_material(db, sample_user)

    assert exc.value.status_code == 402
    assert db.query(UserMaterial).count() == len(swatches) == 1  # no row, no swatch for the loser
    assert fresh(db, billing).custom_material_credits_balance == 0
