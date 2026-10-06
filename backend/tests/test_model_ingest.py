"""Model ingest: only real binary glTF 2.0 is stored, its own triangle count meets the plan,
and an accepted model costs exactly one credit while a refused one costs nothing."""

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from image_samples import raster
from model_samples import COMPRESSED_GLB, REAL_GLB, RENAMED_FILES, TRUNCATED_GLB, glb, glb_with_triangles, mesh_doc
from sqlalchemy import func, select

from app.core import storage as storage_mod
from app.core.deps import get_current_user
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
    yield TestClient(app)
    app.dependency_overrides.clear()


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
        upload_service.save_new_scene(db, scene, upload_service.pay_with_model_credit(db, billing, 1_000))

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


# --- Presigned upload, then register (POST /upload/register) -------------------------


def upload_key(user_id: int, name: str = "ring.glb") -> str:
    """Where a presigned PUT put the file: the user's models prefix, a 32-hex id, the name."""
    return f"customers/{user_id}/models/{'a' * 32}-{name}"


def register(db, user, key: str, **fields) -> dict:
    return upload_service.register_after_presign(
        db,
        user=user,
        key=key,
        material="original",
        model_config_data=None,
        slot_selections=None,
        scene_settings=None,
        **fields,
    )


def thumbnail_key(user_id: int) -> str:
    """Where a presigned PUT put the thumbnail."""
    return f"customers/{user_id}/thumbnails/{'b' * 32}-thumbnail.webp"


def stored_thumbnails(backend: LocalBackend, user_id: int) -> list[str]:
    root = backend._root
    return sorted(path.relative_to(root).as_posix() for path in root.glob(f"customers/{user_id}/thumbnails/*"))


def test_register_keeps_the_checked_glb_and_thumbnail_under_fresh_keys_and_charges_once(
    db, sample_user, store, monkeypatch
):
    key, thumb = upload_key(sample_user.id), thumbnail_key(sample_user.id)
    thumbnail = raster("WEBP", (512, 512))
    store.put_bytes(key, REAL_GLB)
    store.put_bytes(thumb, thumbnail)
    credits, _ = balances(db, sample_user)
    content_types: dict[str, str | None] = {}

    def write_bytes(key, data, content_type=None):
        content_types[key] = content_type
        store.put_bytes(key, data, content_type)

    monkeypatch.setattr(storage_mod, "write_bytes", write_bytes)

    result = register(db, sample_user, key, sku="RING-1", thumbnail_key=thumb)

    saved = result["model_key"]
    assert saved != key and saved.startswith(f"customers/{sample_user.id}/models/") and saved.endswith("-ring.glb")
    assert stored_models(store, sample_user.id) == [saved]  # the presigned objects are gone
    scene = db.get(Scene, result["scene_id"])
    assert (scene.model_key, scene.name) == (saved, "Ring")
    assert stored_thumbnails(store, sample_user.id) == [scene.thumbnail_key] != [thumb]
    assert (store.get_bytes(saved), store.get_bytes(scene.thumbnail_key)) == (REAL_GLB, thumbnail)
    assert content_types == {saved: "model/gltf-binary", scene.thumbnail_key: "image/webp"}
    assert balances(db, sample_user) == (credits - 1, len(REAL_GLB) + len(thumbnail))


@pytest.mark.parametrize(
    "thumbnail",
    [
        REAL_GLB,  # not an image
        b"RIFF\x10\x00\x00\x00WEBPVP8 ",  # WebP magic, no image
        raster("PNG", (64, 64))[:100],  # cut short
        raster("PNG", (4096, 8)),  # wider than 2048 px
        raster("PNG") + bytes(2 * 1024 * 1024),  # over 2 MB
        None,  # never uploaded
    ],
    ids=["glb", "webp-magic-only", "truncated-png", "too-wide", "too-large", "missing"],
)
def test_a_bad_thumbnail_is_dropped_and_the_model_saved_without_it(db, sample_user, store, thumbnail):
    key, thumb = upload_key(sample_user.id), thumbnail_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)
    if thumbnail is not None:
        store.put_bytes(thumb, thumbnail)
    credits, _ = balances(db, sample_user)

    result = register(db, sample_user, key, thumbnail_key=thumb)

    assert db.get(Scene, result["scene_id"]).thumbnail_key is None
    assert stored_thumbnails(store, sample_user.id) == []  # the bad upload is deleted too
    assert balances(db, sample_user) == (credits - 1, len(REAL_GLB))


def test_a_png_thumbnail_is_kept_as_png(db, sample_user, store):
    """Browsers that can't encode WebP hand the canvas back as PNG."""
    key, thumb = upload_key(sample_user.id), thumbnail_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)
    store.put_bytes(thumb, raster("PNG", (512, 512)))

    result = register(db, sample_user, key, thumbnail_key=thumb)

    assert store.get_bytes(db.get(Scene, result["scene_id"]).thumbnail_key) == raster("PNG", (512, 512))


def test_a_thumbnail_key_outside_the_users_thumbnails_is_refused_untouched(db, sample_user, store):
    """Register deletes the thumbnail upload, so it may not name a model, render or asset."""
    key = upload_key(sample_user.id)
    render = f"customers/{sample_user.id}/renders/{'c' * 32}.png"
    store.put_bytes(key, REAL_GLB)
    store.put_bytes(render, raster("PNG"))

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key, thumbnail_key=render)

    assert exc.value.status_code == 400
    assert store.get_bytes(render) == raster("PNG")
    assert scene_count(db) == 0


def test_a_thumbnail_a_saved_scene_shows_is_left_alone(db, sample_user, store):
    """Scenes saved before thumbnails were copied point at their presigned thumbnail."""
    key, thumb = upload_key(sample_user.id), thumbnail_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)
    store.put_bytes(thumb, raster("WEBP"))
    now = datetime.utcnow()
    db.add(Scene(model_key="customers/1/models/old.glb", thumbnail_key=thumb, user_id=sample_user.id, created_at=now, updated_at=now))
    db.commit()

    result = register(db, sample_user, key, thumbnail_key=thumb)

    assert db.get(Scene, result["scene_id"]).thumbnail_key is None
    assert stored_thumbnails(store, sample_user.id) == [thumb]


@pytest.mark.parametrize("kind", sorted(NOT_GLB))
def test_register_refuses_other_formats_and_deletes_the_upload(db, sample_user, store, kind):
    key = upload_key(sample_user.id)
    store.put_bytes(key, NOT_GLB[kind])
    before = balances(db, sample_user)

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key)

    assert (exc.value.status_code, exc.value.detail) == (415, upload_service.NOT_GLB_DETAIL)
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, before)


@pytest.mark.parametrize("kind", sorted(BROKEN_GLB))
def test_register_refuses_a_broken_glb_and_deletes_the_upload(db, sample_user, store, kind):
    key = upload_key(sample_user.id)
    store.put_bytes(key, BROKEN_GLB[kind])
    before = balances(db, sample_user)

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key)

    assert exc.value.status_code == 422
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, before)


def test_register_refuses_triangles_over_the_plan_and_deletes_the_upload(db, sample_user, store):
    key = upload_key(sample_user.id)
    store.put_bytes(key, glb_with_triangles(100_001))  # Free allows 100,000
    before = balances(db, sample_user)

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key)

    assert exc.value.status_code == 402
    assert "Polygon limit" in exc.value.detail
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, before)


def test_register_refuses_an_upload_over_the_size_cap_and_deletes_it(db, sample_user, store, monkeypatch):
    key = upload_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)
    monkeypatch.setattr(upload_service, "get_settings", lambda: SimpleNamespace(max_upload_bytes=len(REAL_GLB) - 1))

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key)

    assert exc.value.status_code == 413
    assert stored_models(store, sample_user.id) == []


def test_register_with_no_credits_left_deletes_the_upload(db, sample_user, store):
    key = upload_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)
    billing = get_or_create_billing(db, sample_user)
    billing.model_credits_balance = 0
    db.commit()

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key)

    assert exc.value.status_code == 402
    assert stored_models(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, (0, 0))


def test_register_whose_save_fails_keeps_neither_the_uploads_nor_their_copies(db, sample_user, store, monkeypatch):
    """The early credit check passes, then the charge is refused at commit."""
    key, thumb = upload_key(sample_user.id), thumbnail_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)
    store.put_bytes(thumb, raster("WEBP"))
    billing = get_or_create_billing(db, sample_user)
    billing.model_credits_balance = 0
    db.commit()
    monkeypatch.setattr(upload_service, "assert_model_credit", lambda db, user: billing)

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key, thumbnail_key=thumb)

    assert exc.value.status_code == 402
    assert stored_models(store, sample_user.id) == stored_thumbnails(store, sample_user.id) == []
    assert (scene_count(db), balances(db, sample_user)) == (0, (0, 0))


def test_register_never_touches_another_users_object(db, sample_user, store):
    key = upload_key(sample_user.id + 1)
    store.put_bytes(key, RENAMED_FILES["step"])

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key)

    assert exc.value.status_code == 400
    assert stored_models(store, sample_user.id + 1) == [key]


def test_register_refuses_a_key_a_scene_already_uses_and_keeps_it(db, sample_user, store):
    """Scenes saved before uploads moved to fresh keys point at their presigned key."""
    key = upload_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)
    now = datetime.utcnow()
    db.add(Scene(model_key=key, user_id=sample_user.id, created_at=now, updated_at=now))
    db.commit()
    before = balances(db, sample_user)

    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, key)

    assert exc.value.status_code == 409
    assert stored_models(store, sample_user.id) == [key]
    assert (scene_count(db), balances(db, sample_user)) == (1, before)


def test_register_of_a_missing_upload_is_404(db, sample_user, store):
    with pytest.raises(HTTPException) as exc:
        register(db, sample_user, upload_key(sample_user.id))
    assert exc.value.status_code == 404


def test_register_route_refuses_a_stored_step_file_with_415(client, db, sample_user, store):
    key = upload_key(sample_user.id)
    store.put_bytes(key, RENAMED_FILES["step"])

    res = client.post("/upload/register", json={"key": key, "polygon_count": 10, "sku": "RING-1"})

    assert res.status_code == 415
    assert res.json()["detail"] == upload_service.NOT_GLB_DETAIL
    assert stored_models(store, sample_user.id) == []
    assert scene_count(db) == 0


def test_register_route_answers_with_the_key_the_scene_uses(client, db, sample_user, store):
    key = upload_key(sample_user.id)
    store.put_bytes(key, REAL_GLB)

    res = client.post("/upload/register", json={"key": key, "polygon_count": 0, "sku": "RING-1"})

    assert res.status_code == 200, res.text
    body = res.json()
    assert db.get(Scene, body["scene_id"]).model_key == body["model_key"] != key
    assert store.get_bytes(body["model_key"]) == REAL_GLB
