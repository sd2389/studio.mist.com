"""Product specs schema validation and scene patch round-trip."""

import pytest
from pydantic import ValidationError

from app.schemas.product_specs import ProductSpecs


def test_product_specs_rejects_negative_carat():
    with pytest.raises(ValidationError):
        ProductSpecs(
            metal_type="",
            metal_purity="",
            hallmark="",
            finish=None,
            stone_count=None,
            total_carat=-1.0,
            stones=[],
            setting_type=None,
            setting_type_other="",
            head_style=None,
            head_style_other="",
            shank_profile=None,
            shank_profile_other="",
            ring_size="",
            length_mm=None,
            width_mm=None,
            height_mm=None,
            metal_weight_g=None,
        )


def test_product_specs_accepts_valid_payload():
    specs = ProductSpecs(
        metal_type="18K Yellow Gold",
        metal_purity="75%",
        hallmark="750",
        finish="polished",
        stone_count=1,
        total_carat=1.25,
        stones=[
            {
                "id": "s1",
                "gem_type": "diamond",
                "carat": 1.25,
                "clarity": "VS1",
                "color": "G",
                "fancy_color": "",
                "cut": "round",
                "quantity": 1,
            }
        ],
        setting_type="prong",
        setting_type_other="",
        head_style="solitaire",
        head_style_other="",
        shank_profile="comfort-fit",
        shank_profile_other="",
        ring_size="6.5 US",
        length_mm=None,
        width_mm=None,
        height_mm=None,
        metal_weight_g=4.2,
    )
    assert specs.metal_type == "18K Yellow Gold"
    assert specs.finish == "polished"


def test_apply_patch_persists_product_specs(db):
    from app.models.user import User
    from app.features.scene.service import apply_patch
    from app.models.scene import Scene
    from app.schemas.product_specs import ProductSpecs
    from app.schemas.scene import ScenePatch
    from datetime import datetime

    user = User(
        email="specs@example.com",
        password_hash="hash",
        role="user",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    scene = Scene(
        user_id=user.id,
        model_key="models/ring.glb",
        material="original",
        lighting="studio",
        model_config={},
        slot_selections={},
        scene_settings={},
        variants={},
        product_specs={},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)

    payload = ProductSpecs(
        metal_type="Platinum 950",
        metal_purity="950‰",
        hallmark="PT950",
        finish="brushed",
        stone_count=1,
        total_carat=2.0,
        stones=[],
        setting_type="bezel",
        setting_type_other="",
        head_style="solitaire",
        head_style_other="",
        shank_profile="flat",
        shank_profile_other="",
        ring_size="7 US",
        length_mm=None,
        width_mm=None,
        height_mm=None,
        metal_weight_g=6.1,
    )
    apply_patch(scene, ScenePatch(product_specs=payload))
    db.commit()
    db.refresh(scene)

    assert scene.product_specs["metal_type"] == "Platinum 950"
    assert scene.product_specs["finish"] == "brushed"
    assert scene.product_specs["ring_size"] == "7 US"
