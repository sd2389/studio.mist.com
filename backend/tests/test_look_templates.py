"""Look templates by slot role (docs/adr/0006-bulk-pipeline.md, F1): each slot's role, from
conversion.json where a design was converted and else from its kind; a template made of one of
its owner's scenes and checked as a render job's look is; and the template applied when a batch's
design becomes its scene: a 3DM's "Pave" layer gets the gem material, and a template of a two-tone
ring keeps both its metals."""

from datetime import datetime

import pytest
from fastapi import HTTPException
from ingest_samples import (  # noqa: F401 - fixtures
    batch_body,
    batch_row,
    claim,
    client,
    cloud,
    complete,
    conversion_report,
    converted_files,
    create,
    design,
    item_row,
    other,
    owner,
    set_flag,
    submitted_batch,
)

from app.core.public_urls import public_file_url
from app.features.ingest.templates import apply_look_template, template_of_look, validate_look_template
from app.features.scene.slot_roles import role_of_slot, slot_roles, with_slot_roles
from app.models import IngestBatch, LookTemplate, Scene, User
from app.models.catalog import CatalogGround, CatalogMetal
from app.models.user_library import UserAsset, UserMaterial

# A finished two-tone solitaire: a yellow band, a white-gold head, a diamond.
TWO_TONE = {
    "lighting": "catalog",
    "model_config": {
        "source": "upload-ingest",
        "slots": [
            {"slotId": "Gem 1", "kind": "gem"},
            {"slotId": "Heads", "kind": "metal"},
            {"slotId": "Metal 1", "kind": "metal"},
        ],
    },
    "slot_selections": {"Gem 1": "diamond", "Heads": "gold-18k-white", "Metal 1": "gold-18k-yellow"},
    "scene_settings": {
        "ENVIRONMENT-METAL": "studio-softbox",
        "BACKGROUND": "paper-white",
        "GROUND": "",
        "quality_mode": "photometric",
        "finish": "satin",
        "advanced": {"exposure": 1.2, "starGlints": True},
        # One scene's own, not the look's.
        "poses": [{"id": "p1", "name": "Front", "cameraPosition": [0, 0, 3], "target": [0, 0, 0]}],
        "modelTransform": {"position": {"x": 0, "y": 0.1, "z": 0}, "rotation": {"x": 0, "y": 0, "z": 0}},
        "embed": {"showTitle": True},
    },
}
TWO_TONE_TEMPLATE = {
    "lighting": "catalog",
    "finish": "satin",
    "materials": {"gem": "diamond", "metal": "gold-18k-yellow"},
    "slot_materials": {"metal": {"Heads": "gold-18k-white"}},
    "scene_settings": {
        "ENVIRONMENT-METAL": "studio-softbox",
        "BACKGROUND": "paper-white",
        "quality_mode": "photometric",
        "advanced": {"exposure": 1.2, "starGlints": True},
    },
}


def _scene(db, user: User, look: dict | None = None, **fields) -> Scene:
    now = datetime.utcnow()
    look = look or TWO_TONE
    scene = Scene(
        user_id=user.id,
        model_key=f"customers/{user.id}/models/ring.glb",
        lighting=look["lighting"],
        model_config=look["model_config"],
        slot_selections=look["slot_selections"],
        scene_settings=look["scene_settings"],
        created_at=now,
        updated_at=now,
        **fields,
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def _from_scene(client, headers, scene_id: int):
    return client.post(f"/ingest/look-templates/from-scene/{scene_id}", headers=headers)


def _template_id(client, db, owner, look: dict | None = None) -> int:
    res = _from_scene(client, owner[1], _scene(db, owner[0], look, name="Two-tone solitaire").id)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _error(call) -> HTTPException:
    with pytest.raises(HTTPException) as exc:
        call()
    return exc.value


def _converted_scenes(client, db, cloud, headers, body: dict, reports: list[dict]) -> list[Scene]:
    """Make, upload and submit the batch, then complete each design's conversion with its report."""
    submitted_batch(client, headers, cloud, body)
    for report in reports:
        job = claim(db)
        complete(db, job, converted_files(cloud, job, report=report))
    db.expire_all()
    return db.query(Scene).filter(Scene.sku.is_not(None)).order_by(Scene.id).all()


# ---------------------------------------------------------------------------
# Roles: conversion.json's, else the kind's
# ---------------------------------------------------------------------------


def test_a_slots_role_is_its_conversions_then_its_kinds_then_its_ids():
    assert role_of_slot({"slotId": "Pave", "kind": "default", "role": "gem"}) == "gem"
    assert role_of_slot({"slotId": "Gem 1", "kind": "gem", "role": "accent"}) == "accent"
    assert [role_of_slot({"slotId": slot, "kind": kind}) for slot, kind in [
        ("Metal 1", "metal"), ("Gem 1", "gem"), ("Accent 1", "accent"), ("Pave", "default"),
    ]] == ["metal", "gem", "accent", "metal"]
    # Saved without a kind: the kind its id gives, as the studio tells.
    assert [role_of_slot({"slotId": slot}) for slot in ["Heads", "Metal 02", "gem2", "Accent 01", "Pave"]] == [
        "metal", "metal", "gem", "accent", "metal",
    ]
    assert role_of_slot({"slotId": "Gem 1", "kind": "gem", "role": "stone"}) == "gem"  # not a role


def test_a_config_without_slots_takes_them_from_the_selections():
    assert slot_roles({"slots": [{"slotId": "Heads", "kind": "metal"}, {"slotId": "Pave", "role": "gem"}]}) == {
        "Heads": "metal", "Pave": "gem",
    }
    assert slot_roles({}, ["Metal 1", "Gem 1"]) == {"Metal 1": "metal", "Gem 1": "gem"}


def test_a_converted_config_stamps_every_slot_conversion_json_first():
    config = {"slots": [{"slotId": "Metal 01", "kind": "metal"}, {"slotId": "Pave", "kind": "default"}, {"slotId": "Notes"}]}

    stamped = with_slot_roles(config, {"Metal 1": "metal", "Pave": "gem"})

    assert [(slot["slotId"], slot["role"]) for slot in stamped["slots"]] == [
        ("Metal 01", "metal"), ("Pave", "gem"), ("Notes", "metal"),
    ]


def test_a_converted_designs_scene_keeps_each_slots_role(client, db, owner, cloud):
    report = conversion_report(
        model_config={"source": "upload-ingest", "slots": [
            {"slotId": "Metal 1", "kind": "metal"}, {"slotId": "Pave", "kind": "default"}, {"slotId": "Accent 1", "kind": "accent"},
        ]},
        slot_selections={"Metal 1": "gold-14k-yellow", "Pave": "gold-14k-yellow", "Accent 1": "diamond"},
        roles={"Pave": "gem"},  # the converter named only the slot whose meshes said what it is
    )

    [scene] = _converted_scenes(client, db, cloud, owner[1], batch_body(), [report])

    assert [(slot["slotId"], slot["role"]) for slot in scene.model_config["slots"]] == [
        ("Metal 1", "metal"), ("Pave", "gem"), ("Accent 1", "accent"),
    ]
    # Without a template the converter's selections stand.
    assert scene.slot_selections == {"Metal 1": "gold-14k-yellow", "Pave": "gold-14k-yellow", "Accent 1": "diamond"}
    assert scene.lighting == "studio"


# ---------------------------------------------------------------------------
# A template of a scene's look
# ---------------------------------------------------------------------------


def test_a_template_of_a_two_tone_scene_keeps_both_metals_by_role(db, owner):
    template = validate_look_template(db, template_of_look(TWO_TONE), owner[0].id)

    assert template == TWO_TONE_TEMPLATE


def test_a_role_takes_the_material_most_of_its_slots_have():
    look = {
        "lighting": "studio",
        "model_config": {"slots": [{"slotId": slot} for slot in ["Heads", "Metal 1", "Metal 2", "Metal 3", "Gem 1", "Gem 2"]]},
        "slot_selections": {
            "Heads": "platinum", "Metal 1": "gold-18k-rose", "Metal 2": "platinum", "Metal 3": "platinum",
            "Gem 1": "diamond", "Gem 2": "ruby",
        },
        "scene_settings": {},
    }

    template = template_of_look(look)

    assert template["materials"] == {"metal": "platinum", "gem": "diamond"}
    assert template["slot_materials"] == {"metal": {"Metal 1": "gold-18k-rose"}, "gem": {"Gem 2": "ruby"}}
    assert (template["lighting"], template["finish"], template["scene_settings"]) == ("studio", "polished", {})


def test_from_scene_makes_the_owners_template_and_brings_it_up_to_date(client, db, owner):
    user, headers = owner
    scene = _scene(db, user, name="Two-tone solitaire")

    made = _from_scene(client, headers, scene.id)

    assert made.status_code == 201, made.text
    body = made.json()
    assert (body["name"], body["source_scene_id"], body["template"]) == ("Look of Two-tone solitaire", scene.id, TWO_TONE_TEMPLATE)
    assert body["labels"] == {"gold-18k-yellow": "18K Yellow", "diamond": "Diamond", "gold-18k-white": "18K White"}

    scene.slot_selections = {**scene.slot_selections, "Heads": "platinum"}
    db.commit()
    again = _from_scene(client, headers, scene.id)

    assert again.status_code == 200, again.text
    assert again.json()["id"] == body["id"]
    assert again.json()["template"]["slot_materials"] == {"metal": {"Heads": "platinum"}}
    assert db.query(LookTemplate).count() == 1


def test_from_scene_refuses_another_users_scene(client, db, owner, other):
    scene = _scene(db, other[0])

    res = _from_scene(client, owner[1], scene.id)

    assert res.status_code == 404
    assert _from_scene(client, owner[1], 9999).status_code == 404
    assert db.query(LookTemplate).count() == 0


def test_from_scene_refuses_a_look_naming_a_material_the_catalogue_retired(client, db, owner):
    db.add(CatalogMetal(slug="old-gold", label="Old gold", params={"color": "#d4af37"}, is_active=False))
    db.commit()
    look = {**TWO_TONE, "slot_selections": {**TWO_TONE["slot_selections"], "Metal 1": "catalog:old-gold", "Heads": "catalog:old-gold"}}

    res = _from_scene(client, owner[1], _scene(db, owner[0], look).id)

    assert res.status_code == 400
    assert res.json()["detail"] == (
        "This scene's look can't be a template: look_template.materials.metal: catalog:old-gold is not in the catalogue"
    )


def test_the_template_list_names_and_draws_each_material(client, db, owner, other):
    user, headers = owner
    db.add(CatalogMetal(slug="rose-satin", label="Rose satin", params={"color": "#e8b4a0"}))
    db.add(UserMaterial(user_id=user.id, kind="gem", slug="house-blue", label="House blue", params={"ior": 1.7}))
    db.commit()
    own = db.query(UserMaterial).one()
    look = {**TWO_TONE, "slot_selections": {"Gem 1": f"custom:{own.id}", "Heads": "catalog:rose-satin", "Metal 1": "diamond-fancy-pink"}}
    _template_id(client, db, owner, look)
    _template_id(client, db, other)  # someone else's

    res = client.get("/ingest/look-templates", headers=headers)

    assert res.status_code == 200, res.text
    [template] = res.json()["items"]
    assert template["labels"] == {
        f"custom:{own.id}": "House blue", "diamond-fancy-pink": "Diamond fancy pink", "catalog:rose-satin": "Rose satin",
    }
    assert [metal["slug"] for metal in template["look"]["metals"]] == ["rose-satin"]
    assert [material["id"] for material in template["look"]["user_materials"]] == [own.id]


def test_from_scene_is_hidden_while_bulk_pipeline_is_off(client, db, owner):
    set_flag(db, "bulk_pipeline", False)

    assert _from_scene(client, owner[1], _scene(db, owner[0]).id).status_code == 404


# ---------------------------------------------------------------------------
# Template checks: validate_look's catalogues
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("template", "detail"),
    [
        ({"materials": {"metal": "catalog:unobtainium"}}, "look_template.materials.metal: catalog:unobtainium is not in the catalogue"),
        ({"materials": {"gem": "Diamond!"}}, "look_template.materials.gem: 'Diamond!' is not a material"),
        ({"slot_materials": {"metal": {"Heads": "custom:999"}}}, "look_template.slot_materials.metal.Heads: custom:999 is not one of your materials"),
        ({"materials": {"stone": "diamond"}}, "look_template.materials.stone.[key]: Input should be 'metal', 'gem' or 'accent'"),
        ({"lighting": "neon"}, "look_template.lighting: Input should be 'studio', 'soft', 'dark', 'catalog' or 'dramatic'"),
        ({"finish": "matte"}, "look_template.finish: Input should be 'polished', 'brushed', 'satin', 'hammered' or 'sandblasted'"),
        ({"scene_settings": {"poses": []}}, "look_template.scene_settings.poses: Extra inputs are not permitted"),
        ({"scene_settings": {"GROUND": "old-shadow"}}, "look_template.scene_settings.GROUND: 'old-shadow' is no longer in the catalogue"),
        ({"scene_settings": {"customBackground": "url(https://evil.example/x.png)"}}, "look_template.scene_settings.customBackground: must be a colour, a gradient of colours or one of your background images"),
        ({"scene_settings": {"advanced": {"exposure": 9}}}, "look_template.scene_settings.advanced.exposure: Input should be less than or equal to 4"),
        ({"palette": "warm"}, "look_template.palette: Extra inputs are not permitted"),
    ],
    ids=[
        "unknown-catalogue-material", "not-a-material", "another-users-material", "unknown-role", "unknown-lighting",
        "unknown-finish", "a-scenes-poses", "retired-ground", "outside-backdrop", "exposure-out-of-range", "unknown-part",
    ],
)
def test_a_template_is_refused_naming_its_field(db, owner, template, detail):
    db.add(CatalogGround(slug="old-shadow", label="Old shadow", params={}, is_active=False))
    db.commit()

    error = _error(lambda: validate_look_template(db, template, owner[0].id))

    assert (error.status_code, error.detail) == (400, detail)


def test_another_users_library_material_is_refused(db, owner, other):
    theirs = UserMaterial(user_id=other[0].id, kind="metal", slug="their-gold", label="Their gold", params={})
    db.add(theirs)
    db.commit()

    error = _error(lambda: validate_look_template(db, {"materials": {"metal": f"custom:{theirs.id}"}}, owner[0].id))

    assert error.detail == f"look_template.materials.metal: custom:{theirs.id} is not one of your materials"
    assert validate_look_template(db, {"materials": {"metal": f"custom:{theirs.id}"}}, other[0].id)["materials"] == {
        "metal": f"custom:{theirs.id}",
    }


def test_a_templates_backdrop_image_is_one_of_its_owners_kept_by_its_link(db, owner, other):
    """Scenes keep a backdrop image as its /api/files/ link, so a template does too."""

    def backdrop(user: User) -> UserAsset:
        key = f"customers/{user.id}/assets/background/abc123def456.png"
        asset = UserAsset(user_id=user.id, asset_type="background", label="Backdrop", storage_key=key, preview_key=key,
                          mime_type="image/png", byte_size=10, meta={})
        db.add(asset)
        db.commit()
        return asset

    link = public_file_url(backdrop(owner[0]).preview_key)
    theirs = public_file_url(backdrop(other[0]).preview_key)

    kept = validate_look_template(db, {"scene_settings": {"customBackground": link}}, owner[0].id)
    error = _error(lambda: validate_look_template(db, {"scene_settings": {"customBackground": theirs}}, owner[0].id))

    assert kept["scene_settings"] == {"customBackground": link}
    assert error.detail == "look_template.scene_settings.customBackground: not one of your background images"


def test_a_template_is_kept_normalised(db, owner):
    db.add(CatalogMetal(slug="rose-satin", label="Rose satin", params={}))
    db.commit()

    template = validate_look_template(
        db,
        {
            "materials": {"metal": "catalog:rose-satin"},
            "slot_materials": {"metal": {"Metal 02": "platinum"}, "gem": {}},
            "scene_settings": {"BACKGROUND": "", "ENVIRONMENT-GEM": None, "advanced": {"exposure": 1, "ao": None}},
        },
        owner[0].id,
    )

    assert template == {
        "lighting": "studio",
        "finish": "polished",
        "materials": {"metal": "catalog:rose-satin"},
        "slot_materials": {"metal": {"Metal 2": "platinum"}},
        "scene_settings": {"advanced": {"exposure": 1}},
    }


# ---------------------------------------------------------------------------
# A batch picks a template
# ---------------------------------------------------------------------------


def test_a_batch_keeps_a_checked_copy_of_its_template(client, db, owner):
    template_id = _template_id(client, db, owner)

    res = create(client, owner[1], batch_body(look_template_id=template_id))

    assert res.status_code == 201, res.text
    assert res.json()["look_template"] == TWO_TONE_TEMPLATE
    assert batch_row(db, res.json()["id"]).look_template == TWO_TONE_TEMPLATE
    plain = create(client, owner[1], batch_body(design("rings/R-2.stl"), name="Plain"))
    assert (plain.status_code, plain.json()["look_template"]) == (201, None)


def test_a_batch_cant_pick_another_users_template(client, db, owner, other):
    theirs = _template_id(client, db, other)

    res = create(client, owner[1], batch_body(look_template_id=theirs))

    assert (res.status_code, res.json()["detail"]) == (404, "Look template not found")
    assert db.query(IngestBatch).count() == 0


def test_a_batch_refuses_a_template_whose_material_was_retired_since(client, db, owner):
    db.add(CatalogMetal(slug="rose-satin", label="Rose satin", params={}))
    db.commit()
    look = {**TWO_TONE, "slot_selections": {**TWO_TONE["slot_selections"], "Heads": "catalog:rose-satin"}}
    template_id = _template_id(client, db, owner, look)
    db.query(CatalogMetal).update({"is_active": False})
    db.commit()

    res = create(client, owner[1], batch_body(look_template_id=template_id))

    assert res.status_code == 400
    assert res.json()["detail"] == "look_template.slot_materials.metal.Heads: catalog:rose-satin is not in the catalogue"
    assert db.query(IngestBatch).count() == 0


# ---------------------------------------------------------------------------
# A design's scene takes its batch's template
# ---------------------------------------------------------------------------


def test_a_3dm_pave_layer_gets_the_gem_material(client, db, owner, cloud):
    """The converter calls the Pave layer's meshes stones, though its slot's kind is default and
    its own selection is gold; the template's gem material goes by the role."""
    solitaire = {
        **TWO_TONE,
        "slot_selections": {"Gem 1": "diamond-canary", "Heads": "platinum", "Metal 1": "platinum"},
    }
    template_id = _template_id(client, db, owner, solitaire)
    pave = conversion_report(
        model_config={"source": "upload-ingest", "slots": [{"slotId": "Metal 1", "kind": "metal"}, {"slotId": "Pave", "kind": "default"}]},
        slot_selections={"Metal 1": "gold-14k-yellow", "Pave": "gold-14k-yellow"},
        roles={"Metal 1": "metal", "Pave": "gem"},
    )

    [scene] = _converted_scenes(client, db, cloud, owner[1], batch_body(design("rings/R-1.3dm"), look_template_id=template_id), [pave])

    assert scene.slot_selections == {"Metal 1": "platinum", "Pave": "diamond-canary"}
    assert [(slot["slotId"], slot["role"]) for slot in scene.model_config["slots"]] == [("Metal 1", "metal"), ("Pave", "gem")]


def test_a_two_tone_template_gives_designs_both_metals_and_its_look(client, db, owner, cloud):
    template_id = _template_id(client, db, owner)
    two_tone = conversion_report(
        model_config={"source": "upload-ingest", "slots": [
            {"slotId": "Metal 1", "kind": "metal"}, {"slotId": "Heads", "kind": "metal"}, {"slotId": "Gem 1", "kind": "gem"},
        ]},
        slot_selections={"Metal 1": "gold-14k-yellow", "Heads": "gold-14k-yellow", "Gem 1": "diamond"},
        roles={"Metal 1": "metal", "Heads": "metal", "Gem 1": "gem"},
    )
    # A band whose CAD layer is named for its alloy: no Heads, its slot of no known part.
    band = conversion_report(
        model_config={"source": "upload-ingest", "slots": [{"slotId": "Yellow Gold", "kind": "default"}]},
        slot_selections={"Yellow Gold": "gold-14k-yellow"},
        roles={"Yellow Gold": "metal"},
    )
    body = batch_body(design("rings/R-1.3dm"), design("rings/R-2.3dm"), look_template_id=template_id)

    ring, plain = _converted_scenes(client, db, cloud, owner[1], body, [two_tone, band])

    assert ring.slot_selections == {"Metal 1": "gold-18k-yellow", "Heads": "gold-18k-white", "Gem 1": "diamond"}
    assert plain.slot_selections == {"Yellow Gold": "gold-18k-yellow"}
    assert ring.lighting == plain.lighting == "catalog"
    settings = ring.scene_settings
    assert (settings["finish"], settings["BACKGROUND"], settings["ENVIRONMENT-METAL"], settings["quality_mode"]) == (
        "satin", "paper-white", "studio-softbox", "photometric",
    )
    assert settings["advanced"] == {"exposure": 1.2, "starGlints": True}
    # The template's scene's poses, transform and embed aren't a look's.
    assert {"poses", "modelTransform", "embed"}.isdisjoint(settings)


def test_a_slot_whose_role_the_template_has_no_material_for_keeps_its_default(client, db, owner, cloud):
    template_id = _template_id(client, db, owner)  # a solitaire: no accent stones
    halo = conversion_report(
        model_config={"source": "upload-ingest", "slots": [
            {"slotId": "Metal 1", "kind": "metal"}, {"slotId": "Gem 1", "kind": "gem"}, {"slotId": "Accent 1", "kind": "accent"},
        ]},
        slot_selections={"Metal 1": "gold-14k-yellow", "Gem 1": "diamond", "Accent 1": "moissanite"},
        roles={"Metal 1": "metal", "Gem 1": "gem", "Accent 1": "accent"},
    )
    batch = submitted_batch(client, owner[1], cloud, batch_body(look_template_id=template_id))
    job = claim(db)

    complete(db, job, converted_files(cloud, job, report=halo))

    item = item_row(db, batch["items"][0]["id"])
    scene = db.get(Scene, item.scene_id)
    assert scene.slot_selections == {"Metal 1": "gold-18k-yellow", "Gem 1": "diamond", "Accent 1": "moissanite"}
    assert item.warnings == [
        "Layer 'Notes' was skipped.",
        'The look template has no accent material, so slot "Accent 1" keeps its default.',
    ]


def test_slots_a_template_has_no_material_for_are_named_in_one_warning():
    template = {"lighting": "soft", "finish": "brushed", "materials": {"metal": "platinum"}, "scene_settings": {}}
    config = {"slots": [{"slotId": f"Gem {number}"} for number in range(1, 8)] + [{"slotId": "Metal 1"}]}

    look = apply_look_template(template, config, {"Gem 1": "ruby", "Metal 1": "gold-14k-yellow"})

    assert look.slot_selections == {"Gem 1": "ruby", "Metal 1": "platinum"}
    assert (look.lighting, look.scene_settings) == ("soft", {"finish": "brushed"})
    assert look.warnings == [
        'The look template has no gem material, so slots "Gem 1", "Gem 2", "Gem 3", "Gem 4", "Gem 5" and 2 more '
        "keep their defaults."
    ]
