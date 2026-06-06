"""Money-path unit tests — quota math (Phase 16)."""

from app.features.billing.plans import PLAN_QUOTAS, get_quotas


def test_free_plan_allotments():
    quotas = get_quotas("free")
    assert quotas.model_credits == 50
    assert quotas.ai_image_credits == 150
    assert quotas.max_variants_per_model == 3
    assert quotas.watermark_exports is True


def test_grow_plan_matches_gemora_parity_targets():
    quotas = get_quotas("grow")
    assert quotas.model_credits == 75
    assert quotas.ai_image_credits == 150
    assert quotas.custom_asset_credits == 25
    assert quotas.max_variants_per_model == 15
    assert quotas.max_image_resolution == 8192


def test_all_tiers_defined():
    assert set(PLAN_QUOTAS.keys()) == {"free", "grow", "studio"}
