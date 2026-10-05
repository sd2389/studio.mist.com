"""A look: the catalogue items and library materials it names (for the embed and render jobs),
and the checks a look passes before a render job copies it."""

import json
from datetime import datetime
from urllib.parse import urlsplit

import pytest
from fastapi import HTTPException

from app.config import get_settings
from app.core.public_urls import public_file_url
from app.core.storage.local import LocalBackend
from app.features.scene.look import (
    MAX_LOOK_BYTES,
    background_image_key,
    catalog_material_slugs,
    custom_material_ids,
    normalize_slot_id,
    saved_look,
    scene_look,
    setting_slugs,
    validate_look,
    variant_look,
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
from app.models.user_library import UserAsset, UserMaterial


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

    look = scene_look(db, saved_look(scene), scene.user_id)

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

    look = scene_look(db, saved_look(scene), scene.user_id)

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


def test_public_scene_reads_leave_the_renders_out(db, sample_user, tmp_path, monkeypatch):
    """Export outputs are renders and private: only the owner's read lists them."""
    from fastapi.testclient import TestClient

    from app.core import storage as storage_mod
    from app.database import get_db
    from app.features.scene import service as scene_service
    from app.main import app
    from app.models.render import Render

    monkeypatch.setattr(storage_mod, "get_storage", lambda: LocalBackend(tmp_path))
    scene = _scene(db, sample_user, sku="RING-1")
    db.add(Render(scene_id=scene.id, key="customers/1/renders/7/ring.png", bytes=10, kind="still"))
    db.commit()

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        by_sku = client.get("/scenes/by-sku/RING-1")
        by_model = client.get("/scenes/by-model/customers/1/models/ring.glb")
    finally:
        app.dependency_overrides.clear()

    for res in (by_sku, by_model):
        assert res.status_code == 200
        assert res.json()["renders"] == []
    assert [render.key for render in scene_service.scene_detail(db, scene.id, sample_user.id).renders] == [
        "customers/1/renders/7/ring.png"
    ]


# ---------------------------------------------------------------------------
# validate_look: what a render job may copy
# ---------------------------------------------------------------------------


def _look(**changes) -> dict:
    """A look as the studio autosaves it."""
    look = {
        "material": "gold-18k-yellow",
        "lighting": "studio",
        "slot_selections": {"Metal 1": "gold-18k-rose", "Gem 1": "diamond"},
        "scene_settings": {
            "ENVIRONMENT-METAL": None,
            "ENVIRONMENT-GEM": None,
            "BACKGROUND": None,
            "GROUND": None,
            "VJSON": None,
            "quality_mode": "photometric",
            "finish": "satin",
            "advanced": {"exposure": 1.1, "bloom": 0.2, "ao": True, "metalEnvRotation": 30},
            "modelTransform": {"position": {"x": 0, "y": 0, "z": 0}, "rotation": {"x": 0, "y": 0.4, "z": 0}},
            "poses": [{"id": "pose-hero", "name": "Hero", "cameraPosition": [1.2, 0.6, 1.8], "target": [0, 0, 0]}],
        },
        "model_config": {
            "source": "upload-ingest",
            "slots": [{"slotId": "Metal 01", "label": "Metal 01", "kind": "metal"}, {"slotId": "Gem 1", "kind": "gem"}],
            "materialProps": {"Band": {"visible": True}},
        },
    }
    look.update(changes)
    return look


def _settings(**changes) -> dict:
    return {**_look()["scene_settings"], **changes}


def _refused(db, user, look) -> str:
    with pytest.raises(HTTPException) as exc:
        validate_look(db, look, user.id)
    assert exc.value.status_code == 400
    return exc.value.detail


def test_a_valid_look_is_kept_with_unknown_settings_dropped(db, sample_user):
    look = _look(scene_settings=_settings(BACKGROUND="", legacyThing={"url": "https://example.com"}))

    kept = validate_look(db, look, sample_user.id)

    assert kept["material"] == "gold-18k-yellow"
    assert kept["slot_selections"] == {"Metal 1": "gold-18k-rose", "Gem 1": "diamond"}
    assert kept["scene_settings"]["BACKGROUND"] is None
    assert "legacyThing" not in kept["scene_settings"]
    assert kept["scene_settings"]["advanced"] == {"exposure": 1.1, "bloom": 0.2, "ao": True, "metalEnvRotation": 30}
    assert kept["model_config"]["materialProps"] == {"Band": {"visible": True}}


def test_a_look_over_64_kb_is_refused(db, sample_user):
    padding = "x" * 255
    poses = [{"id": f"pose-{n}", "name": padding, "cameraPosition": [1, 1, 1], "target": [0, 0, 0]} for n in range(300)]
    look = _look(scene_settings=_settings(poses=poses))
    assert len(json.dumps(look)) > MAX_LOOK_BYTES

    assert _refused(db, sample_user, look) == "look: larger than 64 KB"


def test_a_url_background_is_refused(db, sample_user):
    detail = _refused(db, sample_user, _look(scene_settings=_settings(customBackground='url("https://evil.example/x.png")')))

    assert detail.startswith("look.scene_settings.customBackground:")


@pytest.mark.parametrize(
    "background",
    [
        "https://cdn.example.com/bg.png",
        "//evil.example/api/files/customers/1/assets/background/abc.png",
        "https://evil.example/api/files/customers/1/assets/background/abc.png",
        "{app}/api/files/customers/1/assets/background/abc.png?v=2",
        "{app}/api/files/customers/2/../1/assets/background/abc.png",
        "{app}/api/files/catalog/backgrounds/paper.png",
        "evil.example/backdrop.png",
        "data:image/png;base64,iVBORw0KGgo=",
        "URL(x)",
        "image-set(#fff 1x)",
        "var(--x)",
        "#fff;color:red",
    ],
)
def test_a_background_is_a_colour_a_gradient_or_a_link_of_the_app(db, sample_user, background):
    """Another host, a query, a path out of the owner's files, a data URL: refused naming the field."""
    background = background.format(app=get_settings().app_public_url.rstrip("/"))

    detail = _refused(db, sample_user, _look(scene_settings=_settings(customBackground=background)))

    assert detail == (
        "look.scene_settings.customBackground: must be a colour, a gradient of colours or one of your background images"
    )


@pytest.mark.parametrize(
    "background",
    ["#e8e4dc", "white", "rgb(255 255 255 / 50%)", "linear-gradient(180deg, #ffffff 0%, hsl(30, 20%, 90%) 100%)"],
)
def test_colours_and_gradients_are_kept(db, sample_user, background):
    kept = validate_look(db, _look(scene_settings=_settings(customBackground=background)), sample_user.id)

    assert kept["scene_settings"]["customBackground"] == background


# ---------------------------------------------------------------------------
# Background images from the owner's library
# ---------------------------------------------------------------------------


def _background_asset(db, user, key: str | None = None, *, preview_key: str | None = None, asset_type: str = "background") -> UserAsset:
    """A library image as an upload stores it: the image is its own preview."""
    key = key or f"customers/{user.id}/assets/{asset_type}/abc123def456.png"
    asset = UserAsset(
        user_id=user.id,
        asset_type=asset_type,
        label="Backdrop",
        storage_key=key,
        preview_key=preview_key or key,
        mime_type="image/png",
        byte_size=10,
        meta={},
    )
    db.add(asset)
    db.commit()
    return asset


def _with_background(value) -> dict:
    return _look(scene_settings=_settings(customBackground=value))


@pytest.mark.parametrize("form", ["link", "relative link", "kept"])
def test_your_background_image_is_kept_by_its_asset_id(db, sample_user, form):
    """The studio saves an uploaded backdrop as its /api/files/ link (the asset's preview_url)."""
    asset = _background_asset(db, sample_user)
    link = public_file_url(asset.preview_key)
    value = {"link": link, "relative link": urlsplit(link).path, "kept": {"type": "image", "asset_id": asset.id}}[form]

    kept = validate_look(db, _with_background(value), sample_user.id)

    assert kept["scene_settings"]["customBackground"] == {"type": "image", "asset_id": asset.id}
    assert background_image_key(db, sample_user.id, asset.id) == asset.preview_key


def test_a_link_to_the_image_or_its_preview_names_the_asset(db, sample_user):
    """Older library rows kept their own file names (escaped in the link) and a separate preview."""
    asset = _background_asset(
        db,
        sample_user,
        f"customers/{sample_user.id}/assets/My backdrop.png",
        preview_key=f"customers/{sample_user.id}/assets/previews/My backdrop.webp",
    )

    for key in (asset.storage_key, asset.preview_key):
        assert "%20" in public_file_url(key)
        kept = validate_look(db, _with_background(public_file_url(key)), sample_user.id)
        assert kept["scene_settings"]["customBackground"] == {"type": "image", "asset_id": asset.id}
    # The worker draws what the studio shows: the preview.
    assert background_image_key(db, sample_user.id, asset.id) == asset.preview_key


def test_someone_elses_background_image_is_refused(db, sample_user):
    theirs = _background_asset(db, _other_user(db))

    for value in (public_file_url(theirs.storage_key), {"type": "image", "asset_id": theirs.id}):
        detail = _refused(db, sample_user, _with_background(value))
        assert detail == "look.scene_settings.customBackground: not one of your background images"


def test_a_deleted_background_image_is_refused(db, sample_user):
    asset = _background_asset(db, sample_user)
    link, asset_id = public_file_url(asset.storage_key), asset.id
    db.delete(asset)
    db.commit()

    assert _refused(db, sample_user, _with_background(link)).endswith("not one of your background images")
    assert _refused(db, sample_user, _with_background({"type": "image", "asset_id": asset_id})).endswith(
        "not one of your background images"
    )
    assert background_image_key(db, sample_user.id, asset_id) is None


def test_only_background_assets_make_a_background(db, sample_user):
    environment = _background_asset(db, sample_user, asset_type="metal_env")

    assert _refused(db, sample_user, _with_background(public_file_url(environment.storage_key))).endswith(
        "not one of your background images"
    )


def test_a_library_row_pointing_at_someone_elses_file_is_refused(db, sample_user):
    """Rows registered before uploads were checked could name any preview key."""
    other = _other_user(db)
    asset = _background_asset(
        db,
        sample_user,
        preview_key=f"customers/{other.id}/assets/background/their-file.png",
    )

    assert background_image_key(db, sample_user.id, asset.id) is None
    assert _refused(db, sample_user, _with_background({"type": "image", "asset_id": asset.id})).endswith(
        "not one of your background images"
    )


@pytest.mark.parametrize(
    "value",
    [{"type": "image", "asset_id": 1, "url": "https://evil.example/x.png"}, {"type": "video", "asset_id": 1}],
)
def test_the_kept_form_takes_nothing_else(db, sample_user, value):
    _background_asset(db, sample_user)

    assert _refused(db, sample_user, _with_background(value)).startswith("look.scene_settings.customBackground")


def test_a_model_configs_settings_keep_only_the_catalogue_selections(db, sample_user):
    model_config = {
        "slots": [{"slotId": "Metal 1"}, {"slotId": "Gem 1"}],
        "sceneSettings": {"BACKGROUND": "", "quality_mode": "standard", "customBackground": "https://evil.example/x.png"},
    }

    kept = validate_look(db, _look(model_config=model_config), sample_user.id)

    assert kept["model_config"]["sceneSettings"] == {"BACKGROUND": None, "quality_mode": "standard"}


def test_a_retired_catalogue_slug_is_refused(db, sample_user):
    _seed_catalog(db)

    detail = _refused(db, sample_user, _look(scene_settings=_settings(**{"ENVIRONMENT-METAL": "retired-env"})))

    assert detail == "look.scene_settings.ENVIRONMENT-METAL: 'retired-env' is no longer in the catalogue"


def test_an_inactive_catalogue_material_is_refused(db, sample_user):
    _seed_catalog(db)
    db.add(CatalogMetal(slug="old-satin", label="Old satin", is_active=False))
    db.commit()

    detail = _refused(db, sample_user, _look(slot_selections={"Metal 1": "catalog:old-satin"}))

    assert detail == "look.slot_selections.Metal 1: catalog:old-satin is not in the catalogue"


def test_active_catalogue_items_and_older_ids_pass(db, sample_user):
    """Slugs the catalogue never had are older ids, kept as the embed keeps them."""
    _seed_catalog(db)
    settings = _settings(**{"ENVIRONMENT-METAL": "studio-small", "BACKGROUND": "legacy_bg_01", "GROUND": "soft-shadow"})

    kept = validate_look(db, _look(scene_settings=settings, slot_selections={"Gem 1": "catalog:paraiba"}), sample_user.id)

    assert kept["scene_settings"]["BACKGROUND"] == "legacy_bg_01"


def test_an_environment_given_as_an_address_is_refused(db, sample_user):
    detail = _refused(db, sample_user, _look(scene_settings=_settings(**{"ENVIRONMENT-METAL": "https://evil.example/x.hdr"})))

    assert detail.startswith("look.scene_settings.ENVIRONMENT-METAL:")


def test_someone_elses_library_material_is_refused(db, sample_user):
    theirs = UserMaterial(user_id=_other_user(db).id, kind="gem", slug="secret", label="Secret", params={})
    own = UserMaterial(user_id=sample_user.id, kind="metal", slug="house-gold", label="House gold", params={})
    db.add_all([theirs, own])
    db.commit()

    detail = _refused(db, sample_user, _look(slot_selections={"Metal 1": f"custom:{own.id}", "Gem 1": f"custom:{theirs.id}"}))

    assert detail == f"look.slot_selections.Gem 1: custom:{theirs.id} is not one of your materials"
    assert validate_look(db, _look(slot_selections={"Metal 1": f"custom:{own.id}"}), sample_user.id)


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"lighting": "neon"}, "look.lighting"),
        ({"material": "Gold 18K"}, "look.material"),
        ({"scene_settings": _settings(finish="glitter")}, "look.scene_settings.finish"),
        ({"scene_settings": _settings(quality_mode="ultra")}, "look.scene_settings.quality_mode"),
        ({"scene_settings": _settings(advanced={"exposure": 9})}, "look.scene_settings.advanced.exposure"),
        ({"scene_settings": _settings(advanced={"exposure": float("nan")})}, "look.scene_settings.advanced.exposure"),
        ({"scene_settings": _settings(advanced={"metalEnvRotation": 720})}, "look.scene_settings.advanced.metalEnvRotation"),
        (
            {"scene_settings": _settings(modelTransform={"position": {"x": 11, "y": 0, "z": 0}, "rotation": {"x": 0, "y": 0, "z": 0}})},
            "look.scene_settings.modelTransform.position.x",
        ),
        ({"slot_selections": {"Metal 1": "javascript:alert(1)"}}, "look.slot_selections.Metal 1"),
        ({"extra": True}, "look.extra"),
    ],
)
def test_a_look_out_of_bounds_is_refused_naming_the_field(db, sample_user, changes, field):
    assert _refused(db, sample_user, _look(**changes)).startswith(f"{field}:")


def test_at_most_32_poses(db, sample_user):
    pose = {"name": "Pose", "cameraPosition": [1, 1, 1], "target": [0, 0, 0]}
    poses = [{"id": f"pose-{n}", **pose} for n in range(33)]

    assert _refused(db, sample_user, _look(scene_settings=_settings(poses=poses))).startswith("look.scene_settings.poses:")


def test_a_selection_names_a_slot_of_the_model(db, sample_user):
    """Slots match as the studio matches them: 'Metal 1' is the model's 'Metal 01'."""
    detail = _refused(db, sample_user, _look(slot_selections={"Accent 1": "diamond"}))

    assert detail == "look.slot_selections.Accent 1: the model has no slot 'Accent 1'"
    assert normalize_slot_id("metal01") == "Metal 1"
    assert normalize_slot_id("Heads") == "Heads"


def test_a_model_config_without_slots_takes_them_from_the_selections(db, sample_user):
    """As the studio rebuilds a config from the selections for scenes saved before configs had slots."""
    kept = validate_look(db, _look(model_config={}, slot_selections={"Accent 2": "ruby"}), sample_user.id)

    assert kept["slot_selections"] == {"Accent 2": "ruby"}


def test_saved_and_variant_looks(db, sample_user):
    """A variant's snapshot applies over the scene's look; it keeps the scene's finish."""
    scene = _scene(
        db,
        sample_user,
        material="platinum",
        lighting="soft",
        slot_selections={"Metal 1": "platinum"},
        scene_settings={"finish": "brushed", "BACKGROUND": "paper-warm"},
        model_config={"slots": [{"slotId": "Metal 1"}], "materialProps": {"Band": {"visible": True}}},
        variants={
            "items": [
                {
                    "id": "v-rose",
                    "name": "Rose",
                    "snapshot": {
                        "material": "gold-18k-rose",
                        "lighting": "dramatic",
                        "slotSelections": {"Metal 1": "gold-18k-rose"},
                        "sceneSettings": {"BACKGROUND": "paper-white"},
                        "materialProps": {"Band": {"visible": False}},
                    },
                }
            ]
        },
    )

    saved = validate_look(db, saved_look(scene), sample_user.id)
    variant = validate_look(db, variant_look(scene, "v-rose"), sample_user.id)

    assert (saved["material"], saved["lighting"]) == ("platinum", "soft")
    assert (variant["material"], variant["lighting"]) == ("gold-18k-rose", "dramatic")
    assert variant["scene_settings"] == {"finish": "brushed", "BACKGROUND": "paper-white"}
    assert variant["model_config"] == {"slots": [{"slotId": "Metal 1"}], "materialProps": {"Band": {"visible": False}}}
    assert variant_look(scene, "no-such-variant") is None
