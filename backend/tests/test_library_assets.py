"""Library uploads are judged by their bytes: never the file name or the client's content type."""

import pytest
from fastapi.testclient import TestClient
from image_samples import openexr, radiance, raster
from model_samples import REAL_GLB

from app.core import storage as storage_mod
from app.core.deps import get_current_user
from app.core.storage.local import LocalBackend
from app.database import get_db
from app.features.billing.quota_service import get_or_create_billing
from app.main import app
from app.models.user_library import UserAsset


@pytest.fixture()
def store(tmp_path, monkeypatch) -> LocalBackend:
    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    return backend


@pytest.fixture()
def client(db, sample_user, store):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: sample_user
    yield TestClient(app)
    app.dependency_overrides.clear()


def upload(client, body: bytes, asset_type: str, *, filename: str = "photo.gif", content_type: str = "image/gif"):
    """Upload with a name and content type that say nothing true about the bytes."""
    return client.post(
        "/library/assets/upload",
        files={"file": (filename, body, content_type)},
        data={"asset_type": asset_type},
    )


def asset_credits(db, user) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.custom_asset_credits_balance


def stored_assets(store: LocalBackend, user_id: int) -> list[str]:
    root = store._root
    return sorted(p.relative_to(root).as_posix() for p in root.glob(f"customers/{user_id}/assets/*/*"))


@pytest.mark.parametrize(
    ("body", "extension", "content_type"),
    [
        (raster("PNG"), ".png", "image/png"),
        (raster("JPEG"), ".jpg", "image/jpeg"),
        (raster("WEBP"), ".webp", "image/webp"),
    ],
    ids=["png", "jpeg", "webp"],
)
def test_a_background_is_stored_as_what_its_bytes_are(client, db, sample_user, store, body, extension, content_type):
    credits = asset_credits(db, sample_user)

    res = upload(client, body, "background")

    assert res.status_code == 200, res.text
    assert res.json()["mime_type"] == content_type
    [key] = stored_assets(store, sample_user.id)
    assert key.startswith(f"customers/{sample_user.id}/assets/background/") and key.endswith(extension)
    assert store.get_bytes(key) == body
    assert db.query(UserAsset).one().mime_type == content_type
    assert asset_credits(db, sample_user) == credits - 1


@pytest.mark.parametrize(
    ("body", "asset_type"),
    [
        (radiance(), "background"),
        (REAL_GLB, "background"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "background"),
        (raster("PNG"), "metal_env"),  # no single-file PNG environment loader
        (raster("WEBP"), "gem_env"),
        (REAL_GLB, "gem_env"),
    ],
    ids=["hdr-background", "glb-background", "svg-background", "png-env", "webp-env", "glb-env"],
)
def test_a_format_the_asset_type_cannot_use_is_refused_with_415(client, db, sample_user, store, body, asset_type):
    credits = asset_credits(db, sample_user)

    res = upload(client, body, asset_type, filename="asset.png", content_type="image/png")

    assert res.status_code == 415
    assert stored_assets(store, sample_user.id) == []
    assert asset_credits(db, sample_user) == credits


@pytest.mark.parametrize(
    ("body", "extension", "content_type"),
    [
        (radiance(), ".hdr", "image/vnd.radiance"),
        (openexr(), ".exr", "image/x-exr"),
        (raster("JPEG"), ".jpg", "image/jpeg"),
    ],
    ids=["hdr", "exr", "jpeg"],
)
def test_an_environment_map_gets_the_extension_its_loader_is_picked_by(client, sample_user, store, body, extension, content_type):
    res = upload(client, body, "metal_env", filename="studio.png", content_type="image/png")

    assert res.status_code == 200, res.text
    assert res.json()["mime_type"] == content_type
    [key] = stored_assets(store, sample_user.id)
    assert key.endswith(extension)


@pytest.mark.parametrize(
    ("body", "asset_type"),
    [
        (raster("JPEG", (64, 64))[:200], "background"),  # cut short
        (radiance(100_000, 50_000), "gem_env"),  # a header claiming far too many pixels
        (openexr(compression=6), "metal_env"),  # B44, which the viewer can't decode
    ],
    ids=["truncated-jpeg", "oversized-hdr", "b44-exr"],
)
def test_a_file_in_the_right_format_that_cannot_be_used_is_refused_with_422(client, db, sample_user, store, body, asset_type):
    credits = asset_credits(db, sample_user)

    res = upload(client, body, asset_type)

    assert res.status_code == 422
    assert stored_assets(store, sample_user.id) == []
    assert asset_credits(db, sample_user) == credits


def test_an_asset_over_the_size_cap_is_refused(client, sample_user, store):
    png = raster("PNG")
    res = upload(client, png + bytes(8 * 1024 * 1024 + 1 - len(png)), "background")
    assert (res.status_code, res.json()["detail"]) == (400, "File exceeds 8 MB limit")
    assert stored_assets(store, sample_user.id) == []
