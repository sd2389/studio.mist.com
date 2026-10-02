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


def test_demo_user_never_gets_the_retired_password(db, monkeypatch):
    from types import SimpleNamespace

    from app.core.security import verify_password
    from app.features.demo_embed import service

    monkeypatch.setattr(service, "get_settings", lambda: SimpleNamespace(demo_embed_password=None))
    user = service._get_or_create_demo_user(db)
    assert not verify_password(service._RETIRED_DEMO_PASSWORD, user.password_hash)


def test_demo_user_on_the_retired_password_is_moved_off_it(db, monkeypatch):
    from types import SimpleNamespace

    from app.core.security import hash_password, verify_password
    from app.features.demo_embed import service

    monkeypatch.setattr(service, "get_settings", lambda: SimpleNamespace(demo_embed_password="chosen-for-this-deploy"))
    user = service._get_or_create_demo_user(db)
    user.password_hash = hash_password(service._RETIRED_DEMO_PASSWORD)
    db.commit()

    again = service._get_or_create_demo_user(db)
    assert again.id == user.id
    assert not verify_password(service._RETIRED_DEMO_PASSWORD, again.password_hash)
    assert verify_password("chosen-for-this-deploy", again.password_hash)


def test_moving_the_demo_user_off_a_password_signs_out_its_sessions(db, monkeypatch):
    from types import SimpleNamespace

    from sqlalchemy import select as sql_select

    from app.core.security import hash_password, new_session_token, session_expires_at, verify_password
    from app.features.demo_embed import service
    from app.models.user import Session as DbSession

    settings = SimpleNamespace(demo_embed_password=None)
    monkeypatch.setattr(service, "get_settings", lambda: settings)
    user = service._get_or_create_demo_user(db)
    user.password_hash = hash_password(service._RETIRED_DEMO_PASSWORD)
    db.add(DbSession(token=new_session_token(), user_id=user.id, expires_at=session_expires_at()))
    db.commit()

    # Re-seeding moves it off the retired password and revokes the session made with it.
    service._get_or_create_demo_user(db)
    assert db.execute(sql_select(DbSession).where(DbSession.user_id == user.id)).first() is None

    # Setting DEMO_EMBED_PASSWORD later takes effect on the existing account too.
    db.add(DbSession(token=new_session_token(), user_id=user.id, expires_at=session_expires_at()))
    db.commit()
    settings.demo_embed_password = "set-by-the-operator"
    again = service._get_or_create_demo_user(db)
    assert verify_password("set-by-the-operator", again.password_hash)
    assert db.execute(sql_select(DbSession).where(DbSession.user_id == user.id)).first() is None
