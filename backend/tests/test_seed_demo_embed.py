from pathlib import Path

from sqlalchemy import func, select

from app.core.storage.local import LocalBackend
from app.features.demo_embed.ring_glb import write_demo_ring_glb
from app.features.demo_embed.service import (
    CLOSER_GEMS,
    CLOSER_METALS,
    DEMO_SKU,
    demo_model_config,
    fixture_glb_path,
    seed_demo_embed,
)
from app.models.scene import Scene


def test_committed_demo_glb_is_tiny_and_slotted():
    path = fixture_glb_path()
    assert path.is_file()
    assert path.stat().st_size < 500 * 1024
    payload = path.read_bytes()
    assert payload.startswith(b"glTF")
    assert b"Metal 1" in payload
    assert b"Gem 1" in payload


def test_demo_model_config_is_closer_sized():
    config = demo_model_config()
    metal = next(slot for slot in config["slots"] if slot["kind"] == "metal")
    gem = next(slot for slot in config["slots"] if slot["kind"] == "gem")
    assert len(metal["materialOptions"]) == 4
    assert len(gem["materialOptions"]) == 4
    assert metal["materialOptions"] == CLOSER_METALS
    assert gem["materialOptions"] == CLOSER_GEMS


def test_seed_demo_embed_is_idempotent(db, tmp_path, monkeypatch):
    from app.core import storage as storage_mod
    from app.features.publish import service as publish_service

    backend = LocalBackend(tmp_path)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: backend)
    monkeypatch.setattr(storage_mod, "get_public_storage", lambda: None)
    monkeypatch.setattr(storage_mod, "write_bytes", backend.put_bytes)
    monkeypatch.setattr(publish_service, "storage", storage_mod)

    first = seed_demo_embed(db)
    second = seed_demo_embed(db)
    count = db.execute(select(func.count(Scene.id)).where(Scene.sku == DEMO_SKU)).scalar_one()

    assert first.embed_id == DEMO_SKU
    assert first.created is True
    assert second.created is False
    assert count == 1
    assert backend.exists("models/demo-embed-ring.glb")
    scene = db.execute(select(Scene).where(Scene.sku == DEMO_SKU)).scalars().one()
    assert backend.exists(f"published/{scene.user_id}/{DEMO_SKU}/model.glb")


def test_write_demo_ring_glb_roundtrip(tmp_path: Path):
    dest = tmp_path / "ring.glb"
    write_demo_ring_glb(dest)
    data = dest.read_bytes()
    assert dest.stat().st_size < 500 * 1024
    assert b"Metal 1" in data
    assert b"Gem 1" in data
