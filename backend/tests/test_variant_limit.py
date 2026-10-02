"""Variant plan limit (scene patch gate)."""

from datetime import datetime

import pytest
from fastapi import HTTPException

from app.features.billing.quota_service import assert_variant_limit, get_or_create_billing
from app.features.scene.service import count_variants, patch_scene_by_id, patch_scene_for_model
from app.models.scene import Scene
from app.schemas.scene import ScenePatch


def _variants(count: int, active: str | None = None) -> dict:
    items = [{"id": f"v{i}", "name": f"Variant {i}", "snapshot": {}} for i in range(1, count + 1)]
    return {"activeVariantId": active, "items": items}


def _make_scene(db, user_id: int, variants: dict | None = None) -> Scene:
    scene = Scene(
        user_id=user_id,
        model_key="models/ring.glb",
        material="original",
        lighting="studio",
        model_config={},
        slot_selections={},
        scene_settings={},
        variants=variants or {},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def _set_tier(db, user, tier: str) -> None:
    billing = get_or_create_billing(db, user)
    billing.plan_tier = tier
    db.commit()


def test_assert_variant_limit_allows_at_free_cap(db, sample_user):
    assert assert_variant_limit(db, sample_user, 3) is not None


def test_assert_variant_limit_402_over_free_cap(db, sample_user):
    with pytest.raises(HTTPException) as exc:
        assert_variant_limit(db, sample_user, 4)
    assert exc.value.status_code == 402
    assert exc.value.detail == "Variant limit reached for Free (max 3 per model)."


@pytest.mark.parametrize(("tier", "cap"), [("grow", 15), ("studio", 50)])
def test_assert_variant_limit_paid_caps(db, sample_user, tier, cap):
    _set_tier(db, sample_user, tier)
    assert_variant_limit(db, sample_user, cap)
    with pytest.raises(HTTPException) as exc:
        assert_variant_limit(db, sample_user, cap + 1)
    assert exc.value.status_code == 402


def test_count_variants_reads_the_items_list():
    assert count_variants(_variants(2)) == 2
    assert count_variants({}) == 0
    assert count_variants(None) == 0
    assert count_variants({"items": "not-a-list"}) == 0


# --- Scene patch wiring ---------------------------------------------------


def test_patch_saves_variants_up_to_the_cap(db, sample_user):
    scene = _make_scene(db, sample_user.id)
    item = patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(variants=_variants(3)))
    assert count_variants(item.variants) == 3


def test_patch_refuses_variants_past_the_cap_and_applies_nothing(db, sample_user):
    scene = _make_scene(db, sample_user.id, _variants(3))
    with pytest.raises(HTTPException) as exc:
        patch_scene_by_id(
            db, scene.id, sample_user.id, ScenePatch(name="Renamed", variants=_variants(4))
        )
    assert exc.value.status_code == 402
    db.refresh(scene)
    assert count_variants(scene.variants) == 3
    assert scene.name is None


def test_patch_by_model_refuses_variants_past_the_cap(db, sample_user):
    _make_scene(db, sample_user.id)
    with pytest.raises(HTTPException) as exc:
        patch_scene_for_model(db, "ring.glb", sample_user.id, ScenePatch(variants=_variants(4)))
    assert exc.value.status_code == 402


def test_grow_plan_saves_past_the_free_cap(db, sample_user):
    _set_tier(db, sample_user, "grow")
    scene = _make_scene(db, sample_user.id)
    item = patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(variants=_variants(15)))
    assert count_variants(item.variants) == 15


def test_scene_over_its_cap_keeps_variants_and_can_trim_but_not_grow(db, sample_user):
    """A downgrade can leave a Free scene with 10 variants; editing them must not lock up."""
    scene = _make_scene(db, sample_user.id, _variants(10))
    patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(variants=_variants(10, active="v2")))
    patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(variants=_variants(9)))
    with pytest.raises(HTTPException) as exc:
        patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(variants=_variants(10)))
    assert exc.value.status_code == 402


def test_patch_without_variants_skips_the_check(db, sample_user):
    scene = _make_scene(db, sample_user.id, _variants(10))
    item = patch_scene_by_id(db, scene.id, sample_user.id, ScenePatch(name="Ring"))
    assert item.name == "Ring"
