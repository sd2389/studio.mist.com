"""Deleting a scene deletes its files (model, thumbnail, renders, published copies) and gives
its owner back the storage its upload and its render jobs' outputs counted."""

import base64
import io
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from image_samples import raster
from model_samples import REAL_GLB
from PIL import Image

from app.core import storage
from app.core.deps import get_current_user
from app.core.storage.local import LocalBackend
from app.database import get_db
from app.features.billing.quota_service import count_storage_bytes, get_or_create_billing
from app.features.render import service as render_service
from app.features.scene.service import delete_scene_by_id
from app.features.upload import service as upload_service
from app.main import app
from app.models import Render, RenderJob
from app.models.scene import Scene
from app.models.user import User
from app.schemas.render import RenderSaveRequest

NOW = datetime(2026, 5, 1)


@pytest.fixture()
def files(tmp_path, monkeypatch) -> LocalBackend:
    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage, "get_storage", lambda: backend)
    monkeypatch.setattr(storage, "get_public_storage", lambda: None)
    return backend


def stored(backend: LocalBackend) -> list[str]:
    """Every object in storage."""
    root = backend._root
    return sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file())


def storage_used(db, user) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.storage_bytes_used


def upload(db, user, sku: str | None = None) -> Scene:
    result = upload_service.save_direct_multipart(
        db,
        user=user,
        filename="ring.glb",
        body=REAL_GLB,
        sku=sku,
        model_config_raw=None,
        slot_selections_raw=None,
        scene_settings_raw=None,
    )
    return db.get(Scene, result["scene_id"])


def test_deleting_an_upload_gives_its_storage_back_and_removes_its_files(db, sample_user, files):
    scene = upload(db, sample_user, sku="R-1")
    assert storage_used(db, sample_user) == len(REAL_GLB)
    assert f"published/{sample_user.id}/R-1/model.glb" in stored(files)

    assert delete_scene_by_id(db, scene.id, sample_user.id) == {"ok": True, "id": scene.id}

    assert storage_used(db, sample_user) == 0
    assert stored(files) == []
    assert db.get(Scene, scene.id) is None


def test_a_registered_upload_gives_back_its_model_and_thumbnail(db, sample_user, files):
    uid = sample_user.id
    model_key = f"customers/{uid}/models/{'a' * 32}-ring.glb"
    thumbnail_key = f"customers/{uid}/thumbnails/{'b' * 32}-thumbnail.webp"
    thumbnail = raster("WEBP", (512, 512))
    files.put_bytes(model_key, REAL_GLB)
    files.put_bytes(thumbnail_key, thumbnail)
    result = upload_service.register_after_presign(
        db,
        user=sample_user,
        key=model_key,
        sku="R-2",
        thumbnail_key=thumbnail_key,
        material="original",
        model_config_data=None,
        slot_selections=None,
        scene_settings=None,
    )
    assert storage_used(db, sample_user) == len(REAL_GLB) + len(thumbnail)

    delete_scene_by_id(db, result["scene_id"], uid)

    assert storage_used(db, sample_user) == 0
    assert stored(files) == []


def _png_data_url() -> str:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (240, 240, 240)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_a_render_replacing_the_uploaded_thumbnail_frees_it(db, sample_user, files):
    """The upload's thumbnail counted toward storage; once a still replaces it, its file and
    its bytes go, so deleting the scene later has nothing left to miss."""
    uid = sample_user.id
    model_key = f"customers/{uid}/models/{'c' * 32}-ring.glb"
    thumbnail_key = f"customers/{uid}/thumbnails/{'d' * 32}-thumbnail.webp"
    files.put_bytes(model_key, REAL_GLB)
    files.put_bytes(thumbnail_key, raster("WEBP", (512, 512)))
    result = upload_service.register_after_presign(
        db,
        user=sample_user,
        key=model_key,
        sku=None,
        thumbnail_key=thumbnail_key,
        material="original",
        model_config_data=None,
        slot_selections=None,
        scene_settings=None,
    )
    scene = db.get(Scene, result["scene_id"])
    uploaded = scene.thumbnail_key

    body = RenderSaveRequest(image=_png_data_url(), scene_id=scene.id, kind="still")
    render_service.save_render_from_data_url(db, body, sample_user)

    assert storage_used(db, sample_user) == len(REAL_GLB)
    assert uploaded not in stored(files)
    delete_scene_by_id(db, scene.id, uid)
    assert (storage_used(db, sample_user), stored(files)) == (0, [])


def test_renders_go_too_but_give_back_nothing_they_never_counted(db, sample_user, files):
    scene = upload(db, sample_user)
    for kind in ("still", "hires"):  # a still or hires render becomes the thumbnail
        body = RenderSaveRequest(image=_png_data_url(), scene_id=scene.id, kind=kind)
        render_service.save_render_from_data_url(db, body, sample_user)
    assert len(stored(files)) == 3
    assert storage_used(db, sample_user) == len(REAL_GLB)

    delete_scene_by_id(db, scene.id, sample_user.id)

    assert stored(files) == []
    assert storage_used(db, sample_user) == 0


def test_a_render_jobs_outputs_give_back_the_storage_they_counted(db, sample_user, files):
    """A job's outputs count toward storage when it completes, so deleting the scene gives them back."""
    scene = upload(db, sample_user)
    job = RenderJob(user_id=sample_user.id, scene_id=scene.id, status="completed", created_at=NOW, updated_at=NOW)
    db.add(job)
    db.commit()
    for name in ("RING-front.png", "RING-top.png"):
        key = f"customers/{sample_user.id}/renders/{job.id}/{name}"
        files.put_bytes(key, b"png" * 100)
        db.add(Render(scene_id=scene.id, job_id=job.id, key=key, bytes=300, kind="still", filename=name, created_at=NOW))
    count_storage_bytes(db, sample_user.id, 600)
    db.commit()
    assert storage_used(db, sample_user) == len(REAL_GLB) + 600

    delete_scene_by_id(db, scene.id, sample_user.id)

    assert (storage_used(db, sample_user), stored(files)) == (0, [])


def _legacy_scene(db, user_id: int, name: str, model_key: str, sku: str | None = None) -> Scene:
    scene = Scene(user_id=user_id, name=name, sku=sku, model_key=model_key, created_at=NOW, updated_at=NOW)
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def test_a_file_another_scene_uses_is_kept_while_its_charge_is_given_back(db, sample_user, files):
    """Before uploads were checked, one presigned upload could be registered, and charged, twice."""
    uid = sample_user.id
    shared = f"customers/{uid}/models/ring.glb"
    files.put_bytes(shared, REAL_GLB)
    first = _legacy_scene(db, uid, "first", shared)
    _legacy_scene(db, uid, "second", shared)
    billing = get_or_create_billing(db, sample_user)
    billing.storage_bytes_used = 2 * len(REAL_GLB)
    db.commit()

    delete_scene_by_id(db, first.id, uid)

    assert stored(files) == [shared]
    assert storage_used(db, sample_user) == len(REAL_GLB)


def test_a_published_path_another_sku_shares_is_kept(db, sample_user, files):
    """`A B` and `A-B` publish to the same path; deleting one leaves the other's copy."""
    uid = sample_user.id
    spaced = _legacy_scene(db, uid, "spaced", f"customers/{uid}/models/a.glb", sku="A B")
    _legacy_scene(db, uid, "dashed", f"customers/{uid}/models/b.glb", sku="A-B")
    files.put_bytes(f"published/{uid}/A-B/model.glb", REAL_GLB)

    delete_scene_by_id(db, spaced.id, uid)

    assert stored(files) == [f"published/{uid}/A-B/model.glb"]


def test_storage_never_goes_below_zero(db, sample_user, files):
    scene = upload(db, sample_user)
    billing = get_or_create_billing(db, sample_user)
    billing.storage_bytes_used = 10  # counted before uploads were counted in full
    db.commit()

    delete_scene_by_id(db, scene.id, sample_user.id)

    assert storage_used(db, sample_user) == 0


def test_the_route_deletes_only_the_owners_scene(db, sample_user, files):
    scene = upload(db, sample_user, sku="R-3")
    other = User(email="other@example.com", password_hash="hash", role="user", created_at=NOW, updated_at=NOW)
    db.add(other)
    db.commit()
    client = TestClient(app)
    app.dependency_overrides[get_db] = lambda: db
    try:
        app.dependency_overrides[get_current_user] = lambda: other
        refused = client.delete(f"/scenes/{scene.id}")
        app.dependency_overrides[get_current_user] = lambda: sample_user
        deleted = client.delete(f"/scenes/{scene.id}")
    finally:
        app.dependency_overrides.clear()

    assert refused.status_code == 404
    assert (deleted.status_code, deleted.json()) == (200, {"ok": True, "id": scene.id})
    assert stored(files) == []
