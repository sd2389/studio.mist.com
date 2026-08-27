"""Idempotent published demo piece for /embed shopper Metal + Gem."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage as storage_mod
from app.core import storage_keys as keys
from app.core.security import hash_password
from app.features.publish import service as publish_service
from app.models.scene import Scene
from app.models.user import User

DEMO_SKU = "DEMO-EMBED-RING"
DEMO_NAME = "Demo solitaire"
DEMO_MODEL_KEY = "models/demo-embed-ring.glb"
DEMO_EMAIL = "demo-embed@devjewels.test"
DEMO_PASSWORD = "demo-embed-not-for-prod"
DEMO_FIXTURE_NAME = "demo-embed-ring.glb"

CLOSER_METALS = [
    {"id": "gold-14k-yellow", "label": "14K Yellow"},
    {"id": "gold-18k-white", "label": "18K White"},
    {"id": "gold-18k-rose", "label": "18K Rose"},
    {"id": "platinum", "label": "Platinum"},
]
CLOSER_GEMS = [
    {"id": "diamond", "label": "Diamond"},
    {"id": "ruby", "label": "Ruby"},
    {"id": "sapphire", "label": "Sapphire"},
    {"id": "emerald", "label": "Emerald"},
]


@dataclass(frozen=True)
class DemoEmbedSeedResult:
    embed_id: str
    sku: str
    created: bool
    model_key: str


def fixture_glb_path() -> Path:
    return Path(__file__).resolve().parents[3] / "scripts" / "fixtures" / DEMO_FIXTURE_NAME


def demo_model_config() -> dict:
    return {
        "source": "manual",
        "slots": [
            {
                "slotId": "Metal 1",
                "label": "Metal 1",
                "kind": "metal",
                "defaultMaterial": "gold-14k-yellow",
                "materialOptions": list(CLOSER_METALS),
            },
            {
                "slotId": "Gem 1",
                "label": "Gem 1",
                "kind": "gem",
                "defaultMaterial": "diamond",
                "materialOptions": list(CLOSER_GEMS),
            },
        ],
        "defaultMaterials": {"Metal 1": "gold-14k-yellow", "Gem 1": "diamond"},
        "materialOptionsBySlot": {
            "Metal 1": list(CLOSER_METALS),
            "Gem 1": list(CLOSER_GEMS),
        },
        "slotTokens": {"Metal 1": ["metal 1"], "Gem 1": ["gem 1"]},
        "sceneSettings": {
            "ENVIRONMENT-METAL": "",
            "ENVIRONMENT-GEM": "",
            "GROUND": "",
            "BACKGROUND": "",
            "VJSON": "",
            "quality_mode": "standard",
        },
    }


def seed_demo_embed(db: Session, fixture_path: Path | None = None) -> DemoEmbedSeedResult:
    glb_path = fixture_path or fixture_glb_path()
    if not glb_path.is_file() or glb_path.stat().st_size == 0:
        raise FileNotFoundError(f"Demo GLB missing: {glb_path}")

    user = _get_or_create_demo_user(db)
    storage_mod.write_bytes(DEMO_MODEL_KEY, glb_path.read_bytes(), content_type="model/gltf-binary")

    existing = db.execute(select(Scene).where(Scene.sku == DEMO_SKU)).scalars().first()
    now = datetime.utcnow()
    created = existing is None
    scene = existing or Scene(
        model_key=DEMO_MODEL_KEY,
        user_id=user.id,
        created_at=now,
    )
    scene.model_key = DEMO_MODEL_KEY
    scene.name = DEMO_NAME
    scene.sku = DEMO_SKU
    scene.category = "ring"
    scene.material = "gold-14k-yellow"
    scene.lighting = "studio"
    scene.model_config = demo_model_config()
    scene.slot_selections = {"Metal 1": "gold-14k-yellow", "Gem 1": "diamond"}
    scene.scene_settings = scene.model_config["sceneSettings"]
    scene.updated_at = now
    if created:
        db.add(scene)
    db.commit()
    db.refresh(scene)
    publish_service.publish_scene_to_public(scene)
    return DemoEmbedSeedResult(
        embed_id=DEMO_SKU,
        sku=DEMO_SKU,
        created=created,
        model_key=scene.model_key,
    )


def _get_or_create_demo_user(db: Session) -> User:
    user = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalars().first()
    if user is not None:
        return user
    now = datetime.utcnow()
    user = User(
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
        name="Embed demo",
        is_active=True,
        role="user",
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def published_model_key(user_id: int) -> str:
    return keys.public_model_key(user_id, DEMO_SKU)
