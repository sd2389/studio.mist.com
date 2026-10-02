"""Upload extension allow-list: every jewelry CAD format the browser converts to GLB."""

import json
import struct

import pytest
from fastapi import HTTPException

from app.features.billing.quota_service import get_or_create_billing
from app.features.upload import service as upload_service
from app.services.model_config import _normalize_slot_token, build_slot_material_config, count_glb_triangles

CAD_FILENAMES = [
    "ring.glb",
    "ring.gltf",
    "ring.3dm",
    "ring.step",
    "ring.stp",
    "ring.iges",
    "ring.igs",
    "ring.obj",
    "ring.fbx",
    "ring.stl",
    "ring.ply",
    "ring.3mf",
]


@pytest.mark.parametrize("filename", CAD_FILENAMES + ["RING.STEP", "Halo Ring.OBJ"])
def test_every_cad_format_is_supported(filename):
    assert upload_service.is_supported_model_filename(filename)
    upload_service.require_supported_model_filename(filename)


@pytest.mark.parametrize("filename", ["ring.dwg", "ring.zip", "ring.mtl", "ring.png", "ring", "", None])
def test_non_model_files_are_rejected(filename):
    assert not upload_service.is_supported_model_filename(filename)
    with pytest.raises(HTTPException) as exc:
        upload_service.require_supported_model_filename(filename)
    assert exc.value.status_code == 400
    assert "Unsupported model format" in exc.value.detail
    assert "step" in exc.value.detail


@pytest.mark.parametrize("filename", CAD_FILENAMES)
def test_safe_filename_keeps_source_suffix_but_storage_is_always_glb(filename):
    stem, suffix = filename.rsplit(".", 1)
    assert upload_service.safe_filename(filename) == f"{stem}.{suffix}"
    assert upload_service.safe_filename(filename, force_glb=True) == f"{stem}.glb"


def test_safe_filename_normalizes_unknown_suffix_to_glb():
    assert upload_service.safe_filename("ring.exe") == "ring.glb"


def test_presign_accepts_cad_formats_and_stores_glb(monkeypatch):
    monkeypatch.setattr(upload_service.storage, "presign_put", lambda key, ctype, expires_in=900: f"https://s3/{key}")
    for filename in ("ring.glb", "ring.step"):
        result = upload_service.presign_upload_url(7, filename, "model/gltf-binary")
        assert result["key"].startswith("customers/7/models/")
        assert result["key"].endswith(".glb")


def test_presign_rejects_unsupported_model_but_not_thumbnails(monkeypatch):
    monkeypatch.setattr(upload_service.storage, "presign_put", lambda key, ctype, expires_in=900: f"https://s3/{key}")
    with pytest.raises(HTTPException) as exc:
        upload_service.presign_upload_url(7, "payload.exe", "application/octet-stream")
    assert exc.value.status_code == 400
    thumb = upload_service.presign_upload_url(7, "thumbnail.webp", "image/webp")
    assert thumb["key"].endswith(".webp")


def test_direct_save_rejects_unsupported_format_before_consuming_credit(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    before = billing.model_credits_balance
    with pytest.raises(HTTPException) as exc:
        upload_service.save_direct_multipart(
            db,
            user=sample_user,
            filename="notes.txt",
            body=b"not a model",
            model_config_raw=None,
            slot_selections_raw=None,
            scene_settings_raw=None,
            polygon_count=10,
        )
    assert exc.value.status_code == 400
    db.refresh(billing)
    assert billing.model_credits_balance == before


def _glb_with_nodes(names: list[str]) -> bytes:
    doc = {
        "asset": {"version": "2.0"},
        "nodes": [{"name": name, "mesh": i} for i, name in enumerate(names)],
        "meshes": [{"name": name, "primitives": []} for name in names],
    }
    chunk = json.dumps(doc).encode()
    chunk += b" " * (-len(chunk) % 4)
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(chunk))
    return header + struct.pack("<II", len(chunk), 0x4E4F534A) + chunk


def test_backend_redetects_slots_named_by_browser_segmentation():
    """The browser names segmented meshes Metal N / Gem N / Accent N; ingest must see them."""
    payload = _glb_with_nodes(["Metal 1", "Metal 2", "Gem 1", "Accent 1"])
    config = build_slot_material_config("ring.glb", payload)
    kinds = {slot["slotId"]: slot["kind"] for slot in config["slots"]}
    assert kinds == {"Accent 1": "accent", "Gem 1": "gem", "Metal 1": "metal", "Metal 2": "metal"}
    assert config["defaultMaterials"]["Accent 1"] == "diamond"
    assert config["defaultMaterials"]["Metal 2"] == "gold-14k-yellow"


@pytest.mark.parametrize(
    ("name", "slot"),
    [("Gems", "Gem 1"), ("Stones", "Gem 1"), ("Metal_2", "Metal 2"), ("Accent_3", "Accent 3"), ("Bands", "Metal 1")],
)
def test_slot_tokens_accept_plural_layers_and_underscored_names(name, slot):
    assert _normalize_slot_token(name) == slot


def _glb_with_triangles(index_count: int, *, placements: int = 1) -> bytes:
    """A GLB whose JSON declares one indexed triangle mesh, placed by `placements` nodes."""
    doc = {
        "asset": {"version": "2.0"},
        "accessors": [{"count": 3, "componentType": 5126, "type": "VEC3"}, {"count": index_count, "componentType": 5125, "type": "SCALAR"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "nodes": [{"mesh": 0} for _ in range(placements)],
    }
    chunk = json.dumps(doc).encode()
    chunk += b" " * (-len(chunk) % 4)
    header = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(chunk))
    return header + struct.pack("<II", len(chunk), 0x4E4F534A) + chunk


def test_triangle_count_comes_from_the_glb_itself():
    assert count_glb_triangles(_glb_with_triangles(300)) == 100
    assert count_glb_triangles(_glb_with_triangles(300, placements=3)) == 300
    assert count_glb_triangles(b"not a model") == 0


def test_direct_save_holds_the_cap_against_an_understated_polygon_count(db, sample_user):
    billing = get_or_create_billing(db, sample_user)
    before = billing.model_credits_balance
    with pytest.raises(HTTPException) as exc:
        upload_service.save_direct_multipart(
            db,
            user=sample_user,
            filename="ring.glb",
            body=_glb_with_triangles(3 * 150_000),
            model_config_raw=None,
            slot_selections_raw=None,
            scene_settings_raw=None,
            polygon_count=0,
        )
    assert exc.value.status_code == 402
    db.refresh(billing)
    assert billing.model_credits_balance == before
