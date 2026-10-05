"""Published state: a scene's public copies are made when its SKU, model or thumbnail
changes, recorded in published_at, and its URLs come from that record, not from storage."""

import base64
import io
from datetime import datetime

import pytest
from model_samples import REAL_GLB
from PIL import Image

from app.core import storage
from app.core.storage.local import LocalBackend
from app.features.publish.service import check_published_scenes
from app.features.render import service as render_service
from app.features.scene.service import list_scenes, patch_scene_by_id
from app.features.upload import service as upload_service
from app.models.scene import Scene
from app.schemas.render import RenderSaveRequest
from app.schemas.scene import SceneListQuery, ScenePatch

API = "https://api.example.com"
UPDATED = datetime(2026, 5, 1, 12, 0)


class CountingStorage(LocalBackend):
    """Local storage that records every existence check and copy."""

    def __init__(self, root) -> None:
        super().__init__(root)
        self.calls: list[tuple[str, str]] = []

    def exists(self, key: str) -> bool:
        self.calls.append(("exists", key))
        return super().exists(key)

    def copy_object(self, source_key: str, dest_key: str, *, dest_bucket: str | None = None) -> None:
        self.calls.append(("copy", dest_key))
        super().copy_object(source_key, dest_key, dest_bucket=dest_bucket)


@pytest.fixture()
def files(tmp_path, monkeypatch) -> CountingStorage:
    backend = CountingStorage(tmp_path)
    monkeypatch.setattr(storage, "get_storage", lambda: backend)
    monkeypatch.setattr(storage, "get_public_storage", lambda: None)
    return backend


@pytest.fixture(autouse=True)
def public_api_base(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("PUBLIC_API_BASE", API)
    monkeypatch.setenv("APP_PUBLIC_URL", "https://studio.example.com")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _scene(db, user_id: int, files: CountingStorage | None = None, **fields) -> Scene:
    model_key = f"customers/{user_id}/models/ring.glb"
    if files is not None:
        files.put_bytes(model_key, b"glTF model")
    values = {"name": "Ring", "model_key": model_key, "created_at": UPDATED, "updated_at": UPDATED} | fields
    scene = Scene(user_id=user_id, **values)
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def _copies(files: CountingStorage) -> list[str]:
    return [key for call, key in files.calls if call == "copy"]


def _patch(db, scene: Scene, user_id: int, **fields):
    return patch_scene_by_id(db, scene.id, user_id, ScenePatch(**fields))


def test_patching_a_published_scene_copies_nothing(db, sample_user, files):
    uid = sample_user.id
    scene = _scene(db, uid, files, sku="R-1", published_at=UPDATED)

    item = _patch(db, scene, uid, name="Renamed", slot_selections={"Metal 1": "platinum"}, sku="R-1")

    assert files.calls == []
    assert item.model_url == f"{API}/files/published/{uid}/R-1/model.glb"


def test_adding_a_sku_publishes_once(db, sample_user, files):
    uid = sample_user.id
    scene = _scene(db, uid, files)

    item = _patch(db, scene, uid, sku="R-1")
    _patch(db, scene, uid, name="Renamed")
    _patch(db, scene, uid, sku="R-1", lighting="studio")

    assert _copies(files) == [f"published/{uid}/R-1/model.glb"]
    assert db.get(Scene, scene.id).published_at is not None
    assert item.model_url == f"{API}/files/published/{uid}/R-1/model.glb"


def test_a_new_sku_publishes_under_it(db, sample_user, files):
    uid = sample_user.id
    scene = _scene(db, uid, files, sku="R-1", published_at=UPDATED)

    item = _patch(db, scene, uid, sku="R-2")

    assert _copies(files) == [f"published/{uid}/R-2/model.glb"]
    assert item.model_url == f"{API}/files/published/{uid}/R-2/model.glb"


def test_removing_the_sku_unpublishes_the_scene(db, sample_user, files):
    uid = sample_user.id
    scene = _scene(db, uid, files, sku="R-1", published_at=UPDATED)

    item = _patch(db, scene, uid, sku="")

    assert files.calls == []
    assert db.get(Scene, scene.id).published_at is None
    assert item.model_url == f"https://studio.example.com/api/files/customers/{uid}/models/ring.glb"


def test_a_failed_publish_stays_private_and_the_next_save_tries_again(db, sample_user, files):
    uid = sample_user.id
    scene = _scene(db, uid)  # its model isn't in storage, so the copy fails

    item = _patch(db, scene, uid, sku="R-1")
    assert db.get(Scene, scene.id).published_at is None
    assert item.model_url == f"https://studio.example.com/api/files/customers/{uid}/models/ring.glb"

    files.put_bytes(scene.model_key, b"glTF model")
    item = _patch(db, scene, uid, name="Renamed")

    assert _copies(files) == [f"published/{uid}/R-1/model.glb"] * 2
    assert db.get(Scene, scene.id).published_at is not None
    assert item.model_url == f"{API}/files/published/{uid}/R-1/model.glb"


def _png_data_url() -> str:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (240, 240, 240)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_a_still_render_becomes_the_published_thumbnail(db, sample_user, files):
    uid = sample_user.id
    scene = _scene(db, uid, files, sku="R-1", published_at=UPDATED)

    body = RenderSaveRequest(image=_png_data_url(), scene_id=scene.id, kind="still")
    result = render_service.save_render_from_data_url(db, body, sample_user)

    thumbnail = f"published/{uid}/R-1/thumbnail.webp"
    assert _copies(files) == [f"published/{uid}/R-1/model.glb", thumbnail]
    assert files.get_bytes(thumbnail) == files.get_bytes(result["key"])
    item = list_scenes(db, uid, SceneListQuery()).items[0]
    assert item.thumbnail_url == f"{API}/files/{thumbnail}"


def test_an_upload_with_a_sku_is_published(db, sample_user, files):
    result = upload_service.save_direct_multipart(
        db,
        user=sample_user,
        filename="ring.glb",
        body=REAL_GLB,
        sku="R-9",
        model_config_raw=None,
        slot_selections_raw=None,
        scene_settings_raw=None,
    )

    scene = db.get(Scene, result["scene_id"])
    assert scene.published_at is not None
    assert files.exists(f"published/{sample_user.id}/R-9/model.glb")


def test_an_upload_without_a_sku_is_not_published(db, sample_user, files):
    result = upload_service.save_direct_multipart(
        db,
        user=sample_user,
        filename="ring.glb",
        body=REAL_GLB,
        model_config_raw=None,
        slot_selections_raw=None,
        scene_settings_raw=None,
    )

    assert db.get(Scene, result["scene_id"]).published_at is None
    assert _copies(files) == []


def test_scene_lists_take_published_urls_without_asking_storage(db, sample_user, monkeypatch):
    uid = sample_user.id
    _scene(db, uid, sku="R-1", published_at=UPDATED, thumbnail_key=f"customers/{uid}/thumbnails/t.webp")
    _scene(db, uid, sku="R-2", model_key=f"customers/{uid}/models/unpublished.glb")

    def refuse(*_args, **_kwargs):
        raise AssertionError("a scene list must not call storage")

    monkeypatch.setattr(storage, "get_storage", refuse)
    monkeypatch.setattr(storage, "get_public_storage", refuse)
    urls = {item.sku: (item.model_url, item.thumbnail_url) for item in list_scenes(db, uid, SceneListQuery()).items}

    assert urls == {
        "R-1": (f"{API}/files/published/{uid}/R-1/model.glb", f"{API}/files/published/{uid}/R-1/thumbnail.webp"),
        "R-2": (f"https://studio.example.com/api/files/customers/{uid}/models/unpublished.glb", None),
    }


def test_the_backfill_matches_published_at_to_storage_and_keeps_updated_at(db, sample_user, files):
    uid = sample_user.id
    copied = _scene(db, uid, files, sku="HAS-COPY", model_key=f"customers/{uid}/models/a.glb")
    files.put_bytes(f"published/{uid}/HAS-COPY/model.glb", b"glTF model")
    missing = _scene(db, uid, sku="NO-COPY", model_key=f"customers/{uid}/models/b.glb", published_at=UPDATED)
    files.put_bytes(missing.model_key, b"glTF model")
    broken = _scene(db, uid, sku="NO-MODEL", model_key=f"customers/{uid}/models/c.glb", published_at=UPDATED)
    _scene(db, uid, model_key=f"customers/{uid}/models/d.glb")

    counts = check_published_scenes(db)

    assert counts == {"published": 1, "republished": 1, "failed": 1}
    db.expire_all()
    assert db.get(Scene, copied.id).published_at is not None
    assert db.get(Scene, missing.id).published_at is not None
    assert files.exists(f"published/{uid}/NO-COPY/model.glb")
    assert db.get(Scene, broken.id).published_at is None
    assert {scene.updated_at for scene in db.query(Scene)} == {UPDATED}
