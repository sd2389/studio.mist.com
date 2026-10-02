"""A scene's look carries the catalogue items and library materials it names, for the embed."""

from datetime import datetime

from app.core.storage.local import LocalBackend
from app.features.scene.look import (
    catalog_material_slugs,
    custom_material_ids,
    scene_look,
    setting_slugs,
)
from app.models.catalog import (
    CatalogBackground,
    CatalogEnvironment,
    CatalogGem,
    CatalogGround,
    CatalogMetal,
)
from app.models.scene import Scene
from app.models.user import User
from app.models.user_library import UserMaterial


def _other_user(db) -> User:
    now = datetime.utcnow()
    user = User(email="other@example.com", password_hash="hash", role="user", created_at=now, updated_at=now)
    db.add(user)
    db.commit()
    return user


def _seed_catalog(db) -> None:
    db.add_all(
        [
            CatalogEnvironment(slug="studio-small", label="Studio small", env_type="metal_env"),
            CatalogEnvironment(slug="gem-tent", label="Gem tent", env_type="gem_env"),
            CatalogEnvironment(slug="unused-env", label="Unused", env_type="metal_env"),
            CatalogEnvironment(slug="retired-env", label="Retired", env_type="metal_env", is_active=False),
            CatalogBackground(slug="dusk-gradient", label="Dusk", params={"kind": "linear", "angle": 180}),
            CatalogGround(slug="soft-shadow", label="Soft shadow", params={"opacity": 0.3}),
            CatalogMetal(slug="rose-satin", label="Rose satin", params={"color": "#e8b4a0"}),
            CatalogGem(slug="paraiba", label="Paraiba", params={"ior": 1.62}, gem_family="tourmaline"),
        ]
    )
    db.commit()


def _scene(db, user: User, **fields) -> Scene:
    now = datetime.utcnow()
    scene = Scene(user_id=user.id, model_key="customers/1/models/ring.glb", created_at=now, updated_at=now, **fields)
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def test_references_are_read_from_settings_and_slot_selections():
    settings = {"ENVIRONMENT-METAL": " studio-small ", "ENVIRONMENT-GEM": "", "BACKGROUND": None, "GROUND": 3}
    assert setting_slugs(settings, "ENVIRONMENT-METAL", "ENVIRONMENT-GEM", "BACKGROUND", "GROUND") == {"studio-small"}

    selections = ["platinum", "catalog:rose-satin", "catalog: ", "custom:12", "custom:x", "custom:7"]
    assert catalog_material_slugs(selections) == {"rose-satin"}
    assert custom_material_ids(selections) == {12, 7}


def test_look_resolves_exactly_the_items_the_scene_names(db, sample_user):
    _seed_catalog(db)
    own = UserMaterial(
        user_id=sample_user.id, kind="metal", slug="house-gold", label="House gold", params={"color": "#d4af37"}
    )
    db.add(own)
    db.commit()
    scene = _scene(
        db,
        sample_user,
        scene_settings={
            "ENVIRONMENT-METAL": "studio-small",
            "ENVIRONMENT-GEM": "gem-tent",
            "BACKGROUND": "dusk-gradient",
            "GROUND": "soft-shadow",
        },
        slot_selections={"Metal 1": "catalog:rose-satin", "Gem 1": "catalog:paraiba", "Heads": f"custom:{own.id}"},
    )

    look = scene_look(db, scene)

    assert [item.slug for item in look.environments] == ["gem-tent", "studio-small"]
    assert [item.env_type for item in look.environments] == ["gem_env", "metal_env"]
    assert [item.slug for item in look.backgrounds] == ["dusk-gradient"]
    assert look.backgrounds[0].params == {"kind": "linear", "angle": 180}
    assert [item.slug for item in look.grounds] == ["soft-shadow"]
    assert [(item.slug, item.params) for item in look.metals] == [("rose-satin", {"color": "#e8b4a0"})]
    assert [(item.slug, item.params) for item in look.gems] == [("paraiba", {"ior": 1.62})]
    assert [(item.id, item.kind, item.params) for item in look.user_materials] == [
        (own.id, "metal", {"color": "#d4af37"})
    ]


def test_look_skips_retired_unknown_and_other_users_items(db, sample_user):
    _seed_catalog(db)
    theirs = UserMaterial(user_id=_other_user(db).id, kind="gem", slug="secret", label="Secret", params={"ior": 2.4})
    db.add(theirs)
    db.commit()
    scene = _scene(
        db,
        sample_user,
        scene_settings={"ENVIRONMENT-METAL": "retired-env", "BACKGROUND": "no-such-background"},
        slot_selections={"Metal 1": "gold-18k-yellow", "Gem 1": f"custom:{theirs.id}", "Gem 2": "catalog:missing"},
    )

    look = scene_look(db, scene)

    assert look.model_dump() == {
        "environments": [],
        "backgrounds": [],
        "grounds": [],
        "metals": [],
        "gems": [],
        "user_materials": [],
    }


def test_public_scene_reads_carry_the_look(db, sample_user, tmp_path, monkeypatch):
    from app.core import storage as storage_mod
    from app.features.scene import service as scene_service

    monkeypatch.setattr(storage_mod, "get_storage", lambda: LocalBackend(tmp_path))
    _seed_catalog(db)
    _scene(
        db,
        sample_user,
        sku="RING-1",
        scene_settings={"ENVIRONMENT-METAL": "studio-small"},
        slot_selections={"Metal 1": "catalog:rose-satin"},
    )

    by_sku = scene_service.scene_detail_for_sku(db, "RING-1")
    by_model = scene_service.scene_detail_for_model(db, "customers/1/models/ring.glb")

    for detail in (by_sku, by_model):
        assert [item.slug for item in detail.look.environments] == ["studio-small"]
        assert [item.slug for item in detail.look.metals] == ["rose-satin"]
    assert by_sku.model_dump(by_alias=True)["look"]["metals"][0]["params"] == {"color": "#e8b4a0"}
