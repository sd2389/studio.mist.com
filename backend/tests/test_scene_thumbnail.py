"""PUT /scenes/{id}/thumbnail: a thumbnail set from a capture of the studio's live view (ADR 0005,
"Download PNG and Capture still"). Owner only, judged by its bytes, kept as WebP under the
owner's thumbnails, counted toward storage as an upload's thumbnail is, and published."""

import base64
import io
import os
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
from app.features.billing.plans import get_quotas
from app.features.billing.quota_service import get_or_create_billing
from app.features.render import service as render_service
from app.features.scene.service import delete_scene_by_id
from app.features.upload import service as upload_service
from app.main import app
from app.models import Render
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


@pytest.fixture()
def signed_in(db, sample_user):
    """Requests as `sample_user`; set `signed_in.user` to send them as someone else."""

    class Session:
        user: User | None = sample_user

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: Session.user
    yield Session
    app.dependency_overrides.clear()


@pytest.fixture()
def client(signed_in) -> TestClient:
    return TestClient(app)


def stored(backend: LocalBackend) -> list[str]:
    root = backend._root
    return sorted(path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file())


def storage_used(db, user) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.storage_bytes_used


def upload(db, user, *, sku: str | None = None, thumbnail: bytes | None = None) -> Scene:
    """A scene as the upload page saves one, with the thumbnail it renders when given."""
    uid = user.id
    model_key = f"customers/{uid}/models/{os.urandom(16).hex()}-ring.glb"
    storage.get_storage().put_bytes(model_key, REAL_GLB)
    thumbnail_key = None
    if thumbnail is not None:
        thumbnail_key = f"customers/{uid}/thumbnails/{os.urandom(16).hex()}-thumbnail.webp"
        storage.get_storage().put_bytes(thumbnail_key, thumbnail)
    result = upload_service.register_after_presign(
        db,
        user=user,
        key=model_key,
        sku=sku,
        thumbnail_key=thumbnail_key,
        material="original",
        model_config_data=None,
        slot_selections=None,
        scene_settings=None,
    )
    return db.get(Scene, result["scene_id"])


def put_thumbnail(client: TestClient, scene: Scene, data: bytes, content_type: str = "image/png"):
    return client.put(f"/scenes/{scene.id}/thumbnail", content=data, headers={"Content-Type": content_type})


def decoded(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def noise(kind: str, size: tuple[int, int]) -> bytes:
    """An image that compresses badly, so its file is large."""
    buf = io.BytesIO()
    Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3)).save(buf, format=kind)
    return buf.getvalue()


def test_the_owner_sets_a_thumbnail_kept_as_webp_under_their_thumbnails(db, sample_user, files, client):
    scene = upload(db, sample_user)
    saved_at = scene.updated_at

    res = put_thumbnail(client, scene, raster("PNG", (800, 450)))

    assert res.status_code == 200
    key = res.json()["thumbnail_key"]
    assert key.startswith(f"customers/{sample_user.id}/thumbnails/") and key.endswith(".webp")
    kept = files.get_bytes(key)
    assert kept[:4] == b"RIFF" and kept[8:12] == b"WEBP"
    assert decoded(kept).size == (800, 450)
    db.refresh(scene)
    assert scene.thumbnail_key == key
    assert scene.updated_at > saved_at
    assert res.json()["thumbnail_url"].endswith(key)
    # It counts toward storage as the thumbnail an upload brings does.
    assert storage_used(db, sample_user) == len(REAL_GLB) + len(kept)


@pytest.mark.parametrize("kind", ["PNG", "JPEG", "WEBP"])
def test_png_jpeg_and_webp_captures_are_taken(db, sample_user, files, client, kind):
    scene = upload(db, sample_user)

    res = put_thumbnail(client, scene, raster(kind, (1024, 576)), "application/octet-stream")

    assert res.status_code == 200
    assert decoded(files.get_bytes(res.json()["thumbnail_key"])).format == "WEBP"


def test_a_transparent_capture_keeps_its_alpha(db, sample_user, files, client):
    scene = upload(db, sample_user)
    buf = io.BytesIO()
    Image.new("RGBA", (64, 64), (200, 160, 40, 0)).save(buf, format="PNG")

    res = put_thumbnail(client, scene, buf.getvalue())

    image = decoded(files.get_bytes(res.json()["thumbnail_key"]))
    assert image.mode == "RGBA"
    assert image.getpixel((10, 10))[3] == 0


def test_the_uploaded_thumbnail_it_replaces_is_freed(db, sample_user, files, client):
    scene = upload(db, sample_user, thumbnail=raster("WEBP", (512, 512)))
    uploaded = scene.thumbnail_key

    res = put_thumbnail(client, scene, raster("PNG", (640, 640)))

    new = res.json()["thumbnail_key"]
    assert uploaded not in stored(files)
    assert storage_used(db, sample_user) == len(REAL_GLB) + len(files.get_bytes(new))
    delete_scene_by_id(db, scene.id, sample_user.id)
    assert (storage_used(db, sample_user), stored(files)) == (0, [])


def test_a_render_it_replaces_stays_a_render(db, sample_user, files, client):
    scene = upload(db, sample_user)
    capture = "data:image/png;base64," + base64.b64encode(raster("PNG", (8, 8))).decode()
    saved = render_service.save_render_from_data_url(
        db, RenderSaveRequest(image=capture, scene_id=scene.id, kind="still"), sample_user
    )
    assert db.get(Scene, scene.id).thumbnail_key == saved["key"]

    res = put_thumbnail(client, scene, raster("PNG", (640, 360)))

    assert res.status_code == 200
    assert saved["key"] in stored(files)
    assert db.get(Render, saved["render_id"]) is not None
    assert storage_used(db, sample_user) == len(REAL_GLB) + len(files.get_bytes(res.json()["thumbnail_key"]))


def test_another_users_scene_is_not_found_and_nothing_is_kept(db, sample_user, files, client, signed_in):
    scene = upload(db, sample_user, thumbnail=raster("WEBP", (512, 512)))
    before = stored(files)
    other = User(email="other@example.com", password_hash="hash", role="user", created_at=NOW, updated_at=NOW)
    db.add(other)
    db.commit()
    signed_in.user = other

    res = put_thumbnail(client, scene, raster("PNG", (640, 360)))

    assert res.status_code == 404
    assert stored(files) == before
    db.refresh(scene)
    assert scene.thumbnail_key in before


def test_it_needs_a_signed_in_user(db, sample_user, files):
    scene = upload(db, sample_user)
    app.dependency_overrides[get_db] = lambda: db
    try:
        res = put_thumbnail(TestClient(app), scene, raster("PNG", (64, 64)))
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 401


def _truncated_png() -> bytes:
    data = raster("PNG", (256, 256))
    return data[: len(data) // 2]


@pytest.mark.parametrize(
    ("data", "status"),
    [
        (b"", 400),
        (b"just some text", 415),
        (raster("GIF", (64, 64)), 415),
        (raster("BMP", (64, 64)), 415),
        (_truncated_png(), 422),
        (raster("PNG", (1025, 64)), 422),
        (raster("JPEG", (64, 1025)), 422),
    ],
    ids=["empty", "text", "gif", "bmp", "truncated", "too-wide", "too-tall"],
)
def test_only_an_image_it_can_use_is_taken(db, sample_user, files, client, data, status):
    scene = upload(db, sample_user)
    before = stored(files)

    res = put_thumbnail(client, scene, data)

    assert res.status_code == status
    assert stored(files) == before
    db.refresh(scene)
    assert scene.thumbnail_key is None


def test_a_body_over_two_megabytes_is_refused(db, sample_user, files, client):
    scene = upload(db, sample_user)

    res = put_thumbnail(client, scene, b"\x89PNG\r\n\x1a\n" + bytes(2 * 1024 * 1024))

    assert res.status_code == 413
    db.refresh(scene)
    assert scene.thumbnail_key is None


def test_a_published_scene_publishes_its_new_thumbnail(db, sample_user, files, client):
    scene = upload(db, sample_user, sku="R-7")
    published = f"published/{sample_user.id}/R-7/thumbnail.webp"
    assert published not in stored(files)

    res = put_thumbnail(client, scene, raster("PNG", (640, 360)))

    assert files.get_bytes(published) == files.get_bytes(res.json()["thumbnail_key"])
    db.refresh(scene)
    assert scene.published_at is not None


def test_a_scene_without_a_sku_publishes_nothing(db, sample_user, files, client):
    scene = upload(db, sample_user)

    put_thumbnail(client, scene, raster("PNG", (640, 360)))

    assert not any(key.startswith("published/") for key in stored(files))


def test_full_storage_keeps_the_scene_as_it_was(db, sample_user, files, client):
    scene = upload(db, sample_user)
    billing = get_or_create_billing(db, sample_user)
    billing.storage_bytes_used = get_quotas("free").storage_bytes
    db.commit()
    before = stored(files)

    res = put_thumbnail(client, scene, raster("PNG", (640, 360)))

    assert res.status_code == 402
    assert stored(files) == before
    db.refresh(scene)
    assert scene.thumbnail_key is None


def test_replacing_a_thumbnail_needs_only_the_room_it_adds(db, sample_user, files, client):
    """The old thumbnail's bytes come back before the new one's count, so a full plan can still
    swap a large thumbnail for a smaller one."""
    scene = upload(db, sample_user, thumbnail=noise("WEBP", (512, 512)))
    billing = get_or_create_billing(db, sample_user)
    billing.storage_bytes_used = get_quotas("free").storage_bytes
    db.commit()

    res = put_thumbnail(client, scene, raster("PNG", (64, 64)))

    assert res.status_code == 200
    assert storage_used(db, sample_user) < get_quotas("free").storage_bytes
