"""SKUs are unique across the platform: one already taken is a 409 on upload and on PATCH,
never a 500 from the unique index. A bulk upload's design in progress reserves its SKU too."""

from datetime import datetime

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from image_samples import raster
from model_samples import REAL_GLB

from app.core import storage
from app.core.deps import get_current_user
from app.core.storage.local import LocalBackend
from app.database import get_db
from app.features.billing.quota_service import get_or_create_billing
from app.features.scene import service as scene_service
from app.features.scene.service import patch_scene_by_id
from app.features.scene.skus import SKU_RESERVED, assert_sku_available
from app.features.upload import service as upload_service
from app.main import app
from app.models import IngestBatch, IngestItem
from app.models.scene import Scene
from app.models.user import User
from app.schemas.scene import ScenePatch

NOW = datetime(2026, 5, 1)


def _scene(db, user_id: int, name: str, sku: str | None = None) -> Scene:
    scene = Scene(
        user_id=user_id,
        name=name,
        sku=sku,
        model_key=f"customers/{user_id}/models/{name}.glb",
        created_at=NOW,
        updated_at=NOW,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def _other_user(db) -> User:
    user = User(email="other@example.com", password_hash="hash", role="user", created_at=NOW, updated_at=NOW)
    db.add(user)
    db.commit()
    return user


def test_patch_to_a_sku_another_owner_holds_is_409_and_changes_nothing(db, sample_user):
    other = _other_user(db)
    _scene(db, other.id, "theirs", sku="R-1")
    mine = _scene(db, sample_user.id, "mine", sku="M-1")

    with pytest.raises(HTTPException) as exc:
        patch_scene_by_id(db, mine.id, sample_user.id, ScenePatch(sku="R-1", name="Renamed"))

    assert (exc.value.status_code, exc.value.detail) == (409, "SKU already exists")
    db.expire_all()
    assert (db.get(Scene, mine.id).sku, db.get(Scene, mine.id).name) == ("M-1", "mine")


def test_a_scene_keeps_its_own_sku_and_may_take_a_free_one(db, sample_user):
    scene = _scene(db, sample_user.id, "ring", sku="R-1")

    assert patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(sku="R-1", name="Ring")).sku == "R-1"
    assert patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(sku="R-2")).sku == "R-2"


def test_skus_differ_by_case(db, sample_user):
    _scene(db, sample_user.id, "upper", sku="R-1")
    lower = _scene(db, sample_user.id, "lower")

    assert patch_scene_by_id(db, lower.id, sample_user.id, ScenePatch(sku="r-1")).sku == "r-1"


def test_a_sku_taken_after_the_check_is_409_not_500(db, sample_user, monkeypatch):
    """Another save takes the SKU between the check and the commit: the unique index refuses it."""
    _scene(db, sample_user.id, "first", sku="R-1")
    second = _scene(db, sample_user.id, "second")
    monkeypatch.setattr(scene_service, "assert_sku_available", lambda *_args: None)

    with pytest.raises(HTTPException) as exc:
        patch_scene_by_id(db, second.id, sample_user.id, ScenePatch(sku="R-1"))

    assert exc.value.status_code == 409
    db.expire_all()
    assert db.get(Scene, second.id).sku is None


def test_the_patch_route_answers_409_for_a_taken_sku(db, sample_user):
    _scene(db, sample_user.id, "first", sku="R-1")
    second = _scene(db, sample_user.id, "second")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: sample_user
    try:
        res = TestClient(app).patch(f"/scenes/{second.id}", json={"sku": "R-1"})
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 409
    assert res.json()["detail"] == "SKU already exists"


@pytest.fixture()
def files(tmp_path, monkeypatch) -> LocalBackend:
    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage, "get_storage", lambda: backend)
    monkeypatch.setattr(storage, "get_public_storage", lambda: None)
    return backend


def _upload(db, user, **fields) -> dict:
    return upload_service.save_direct_multipart(
        db,
        user=user,
        filename="ring.glb",
        body=REAL_GLB,
        model_config_raw=None,
        slot_selections_raw=None,
        scene_settings_raw=None,
        **fields,
    )


def test_an_upload_with_a_taken_sku_is_409(db, sample_user, files):
    _scene(db, sample_user.id, "first", sku="R-1")

    with pytest.raises(HTTPException) as exc:
        _upload(db, sample_user, sku="R-1")

    assert exc.value.status_code == 409


def test_uploads_with_a_blank_sku_have_none_and_never_collide(db, sample_user, files):
    first = _upload(db, sample_user, sku="")
    second = _upload(db, sample_user, sku="")

    assert db.get(Scene, first["scene_id"]).sku is None
    assert db.get(Scene, second["scene_id"]).sku is None


def _stored(backend: LocalBackend) -> list[str]:
    root = backend._root
    return sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file())


def _balances(db, user) -> tuple[int, int]:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.model_credits_balance, billing.storage_bytes_used


@pytest.fixture()
def lost_race(db, sample_user, monkeypatch):
    """Another upload took R-1 after this one's check: the check passes, the index refuses."""
    _scene(db, sample_user.id, "first", sku="R-1")
    monkeypatch.setattr(upload_service, "assert_sku_available", lambda *_args: None)
    return _balances(db, sample_user)


def test_a_direct_upload_that_loses_a_sku_race_is_409_and_keeps_nothing(db, sample_user, files, lost_race):
    with pytest.raises(HTTPException) as exc:
        _upload(db, sample_user, sku="R-1")

    assert (exc.value.status_code, exc.value.detail) == (409, "SKU already exists")
    assert _stored(files) == []
    assert _balances(db, sample_user) == lost_race
    assert db.query(Scene).count() == 1


def test_a_registered_upload_that_loses_a_sku_race_is_409_and_keeps_nothing(db, sample_user, files, lost_race):
    uid = sample_user.id
    model_key = f"customers/{uid}/models/{'a' * 32}-ring.glb"
    thumbnail_key = f"customers/{uid}/thumbnails/{'b' * 32}-thumbnail.webp"
    files.put_bytes(model_key, REAL_GLB)
    files.put_bytes(thumbnail_key, raster("WEBP", (64, 64)))

    with pytest.raises(HTTPException) as exc:
        upload_service.register_after_presign(
            db,
            user=sample_user,
            key=model_key,
            sku="R-1",
            thumbnail_key=thumbnail_key,
            material="original",
            model_config_data=None,
            slot_selections=None,
            scene_settings=None,
        )

    assert exc.value.status_code == 409
    assert _stored(files) == []  # neither the presigned uploads nor their checked copies
    assert _balances(db, sample_user) == lost_race


def _reserving_design(db, user_id: int, sku: str, status: str) -> None:
    """A bulk upload's design holding `sku` while it is at `status` (docs/adr/0006-bulk-pipeline.md)."""
    batch = IngestBatch(user_id=user_id, name="Rings", options={}, created_at=NOW, updated_at=NOW)
    db.add(batch)
    db.commit()
    db.add(
        IngestItem(
            batch_id=batch.id, user_id=user_id, position=0, filename="r.stl", source_key="k", source_bytes=1,
            sku=sku, name="R", category="Ring", status=status, created_at=NOW, updated_at=NOW,
        )
    )
    db.commit()


def test_a_sku_a_design_in_progress_reserves_is_409_for_an_upload_and_a_patch(db, sample_user, files):
    _reserving_design(db, _other_user(db).id, "R-1", "converting")
    mine = _scene(db, sample_user.id, "mine")

    with pytest.raises(HTTPException) as upload:
        _upload(db, sample_user, sku="R-1")
    with pytest.raises(HTTPException) as patch:
        patch_scene_by_id(db, mine.id, sample_user.id, ScenePatch(sku="R-1"))

    assert (upload.value.status_code, upload.value.detail) == (409, SKU_RESERVED)
    assert (patch.value.status_code, patch.value.detail) == (409, SKU_RESERVED)
    assert db.query(Scene).filter(Scene.sku == "R-1").count() == 0


@pytest.mark.parametrize("status", ["done", "failed", "skipped", "canceled"])
def test_a_finished_design_reserves_its_sku_no_more(db, sample_user, files, status):
    _reserving_design(db, _other_user(db).id, "R-1", status)

    assert db.get(Scene, _upload(db, sample_user, sku="R-1")["scene_id"]).sku == "R-1"


def test_a_design_may_take_the_sku_it_reserves(db, sample_user):
    _reserving_design(db, sample_user.id, "R-1", "converting")
    item_id = db.query(IngestItem).one().id

    assert_sku_available(db, "R-1", item_id=item_id)
    with pytest.raises(HTTPException):
        assert_sku_available(db, "R-1")
