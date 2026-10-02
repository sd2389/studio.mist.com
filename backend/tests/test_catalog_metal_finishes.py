"""Metal finish rows carry the roughness the renderer draws, and re-seeding updates stored rows."""

import pytest
from sqlalchemy import select

from app.features.catalog.seed.metals import METAL_FINISHES
from app.features.catalog.seed.runner import seed_all
from app.models.catalog import CatalogMetal

# Each finish's `roughnessFactor` in src/lib/finish-textures.ts.
RENDERER_ROUGHNESS_FACTOR = {
    "polished": 1.0,
    "brushed": 1.6,
    "satin": 1.3,
    "hammered": 1.45,
    "sandblasted": 2.4,
}


def test_finish_rows_scale_roughness_like_the_renderer():
    base_roughness = {
        row["params"]["baseSlug"]: row["params"]["roughness"]
        for row in METAL_FINISHES
        if row["params"]["finish"] == "polished"
    }
    for row in METAL_FINISHES:
        params = row["params"]
        factor = RENDERER_ROUGHNESS_FACTOR[params["finish"]]
        expected = min(0.95, base_roughness[params["baseSlug"]] * factor)
        assert params["roughness"] == pytest.approx(expected), row["slug"]


def test_reseeding_moves_a_stored_row_to_the_new_roughness(db):
    # 14K yellow gold has base roughness 0.15; before this fix the seed stored brushed at x1.45.
    db.add(
        CatalogMetal(
            slug="gold-14k-yellow-brushed",
            label="14K Yellow Gold (Brushed)",
            params={"baseSlug": "gold-14k-yellow", "finish": "brushed", "roughness": 0.15 * 1.45},
        )
    )
    db.commit()

    seed_all(db)

    row = db.execute(select(CatalogMetal).where(CatalogMetal.slug == "gold-14k-yellow-brushed")).scalar_one()
    assert row.params["roughness"] == pytest.approx(0.15 * 1.6)
