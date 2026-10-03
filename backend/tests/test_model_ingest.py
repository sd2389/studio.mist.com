"""Model ingest: only real binary glTF 2.0 is stored, its own triangle count meets the plan,
and an accepted model costs exactly one credit while a refused one costs nothing."""

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from model_samples import COMPRESSED_GLB, REAL_GLB, RENAMED_FILES, TRUNCATED_GLB, glb, glb_with_triangles, mesh_doc
from sqlalchemy import func, select

from app.core import storage as storage_mod
from app.core.deps import get_current_user
from app.core.rate_limit import get_rate_limiter
from app.core.storage.local import LocalBackend
from app.database import get_db
from app.features.billing.quota_service import get_or_create_billing
from app.features.upload import service as upload_service
from app.main import app
from app.models.scene import Scene

NOT_GLB = {kind: RENAMED_FILES[kind] for kind in ("step", "3dm", "obj", "iges", "stl", "fbx", "gltf-json")}
BROKEN_GLB = {
    "truncated": TRUNCATED_GLB,
    "trailing-bytes": REAL_GLB + RENAMED_FILES["step"],
    "no-triangles": glb(mesh_doc(300, mode=1)),  # lines only
}


@pytest.fixture()
def store(tmp_path, monkeypatch) -> LocalBackend:
    """Local storage in a temp dir; nothing is published to a public bucket."""
    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    monkeypatch.setattr(storage_mod, "get_public_storage", lambda: None)
    return backend


@pytest.fixture()
def client(db, sample_user, store):
    """The API, signed in as `sample_user`."""
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: sample_user
    get_rate_limiter().reset()
    yield TestClient(app)
    app.dependency_overrides.clear()
    get_rate_limiter().reset()


def balances(db, user) -> tuple[int, int]:
    """(model credits left, storage bytes used)."""
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.model_credits_balance, billing.storage_bytes_used


def scene_count(db) -> int:
    return db.execute(select(func.count(Scene.id))).scalar_one()


def stored_models(backend: LocalBackend, user_id: int) -> list[str]:
    """Keys of every model object stored for the user."""
    root = backend._root
    return sorted(path.relative_to(root).as_posix() for path in root.glob(f"customers/{user_id}/models/*"))


def save_direct(db, user, body: bytes, filename: str = "ring.glb", **fields) -> dict:
    return upload_service.save_direct_multipart(
        db,
        user=user,
        filename=filename,
        body=body,
        model_config_raw=None,
        slot_selections_raw=None,
        scene_settings_raw=None,
        **fields,
    )


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


# --- Direct upload (POST /upload) ---------------------------------------------------


@pytest.mark.parametrize("body", [REAL_GLB, COMPRESSED_GLB], ids=["glb", "draco-meshopt-glb"])
def test_direct_upload_stores_a_real_glb_and_charges_one_credit(db, sample_user, store, body):
    credits, _ = balances(db, sample_user)

    result = save_direct(db, sample_user, body, sku="RING-1")

    assert store.get_bytes(result["model_key"]) == body
    assert stored_models(store, sample_user.id) == [result["model_key"]]
    assert scene_count(db) == 1
    assert balances(db, sample_user) == (credits - 1, len(body))


@pytest.mark.parametrize("kind", sorted(NOT_GLB))
def test_direct_upload_refuses_other_formats_renamed_to_glb(db, sample_user, store, kind):
    before = balances(db, sample_user)
    with pytest.raises(HTTPException) as exc:
        save_direct(db, sample_user, NOT_GLB[kind], filename=f"ring.{'glb' if kind == 'gltf-json' else kind}")
    assert (exc.value.status_code, exc.value.detail) == (415, upload_service.NOT_GLB_DETAIL)
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, before)


@pytest.mark.parametrize("kind", sorted(BROKEN_GLB))
def test_direct_upload_refuses_a_broken_glb(db, sample_user, store, kind):
    before = balances(db, sample_user)
    with pytest.raises(HTTPException) as exc:
        save_direct(db, sample_user, BROKEN_GLB[kind])
    assert exc.value.status_code == 422
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, before)


def test_direct_upload_refuses_triangles_over_the_plan(db, sample_user, store):
    before = balances(db, sample_user)
    with pytest.raises(HTTPException) as exc:
        save_direct(db, sample_user, glb_with_triangles(100_001))  # Free allows 100,000
    assert exc.value.status_code == 402
    assert "Polygon limit" in exc.value.detail
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, before)


def test_direct_upload_over_the_size_cap_is_refused(db, sample_user, store, monkeypatch):
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(max_upload_bytes=len(REAL_GLB) - 1))
    with pytest.raises(HTTPException) as exc:
        save_direct(db, sample_user, REAL_GLB)
    assert exc.value.status_code == 413
    assert stored_models(store, sample_user.id) == []


def test_direct_upload_whose_save_fails_leaves_no_model_behind(db, sample_user, store, monkeypatch):
    """The early credit check passes, then the charge is refused at commit: nothing is kept."""
    billing = get_or_create_billing(db, sample_user)
    billing.model_credits_balance = 0
    db.commit()
    monkeypatch.setattr(upload_service, "assert_model_credit", lambda db, user: billing)

    with pytest.raises(HTTPException) as exc:
        save_direct(db, sample_user, REAL_GLB)

    assert exc.value.status_code == 402
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, (0, 0))


def test_direct_route_refuses_a_step_file_with_415(client, db, sample_user, store):
    res = client.post(
        "/upload",
        files={"file": ("ring.step", RENAMED_FILES["step"], "application/step")},
        data={"name": "Ring", "sku": "RING-1", "polygon_count": "10"},
    )
    assert res.status_code == 415
    assert res.json()["detail"] == upload_service.NOT_GLB_DETAIL
    assert stored_models(store, sample_user.id) == []


def test_direct_route_saves_a_real_glb_whatever_count_the_client_declares(client, db, sample_user, store):
    res = client.post(
        "/upload",
        files={"file": ("ring.glb", REAL_GLB, "model/gltf-binary")},
        data={"name": "Ring", "sku": "RING-1", "polygon_count": "999999999"},
    )
    assert res.status_code == 200, res.text
    assert store.get_bytes(res.json()["model_key"]) == REAL_GLB
    assert scene_count(db) == 1


def test_direct_route_refuses_a_negative_declared_count(client):
    res = client.post(
        "/upload",
        files={"file": ("ring.glb", REAL_GLB, "model/gltf-binary")},
        data={"polygon_count": "-1"},
    )
    assert res.status_code == 422
