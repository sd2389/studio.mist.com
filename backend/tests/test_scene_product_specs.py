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
