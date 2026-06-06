"""Phase 1 catalog seed count verification — must meet or beat CATALOG-SPEC targets."""

from app.features.catalog.seed.backgrounds import BACKGROUNDS
from app.features.catalog.seed.environments import ENVIRONMENTS
from app.features.catalog.seed.gems import GEMS
from app.features.catalog.seed.grounds import GROUNDS
from app.features.catalog.seed.metals import ALL_METALS
from app.features.catalog.seed.scene_presets import SCENE_PRESETS


def test_metal_surface_count_meets_target():
    assert len(ALL_METALS) >= 300


def test_gem_count_meets_target():
    assert len(GEMS) >= 65


def test_background_count_meets_target():
    assert len(BACKGROUNDS) >= 35


def test_environment_count_meets_target():
    metal_envs = [row for row in ENVIRONMENTS if row["env_type"] == "metal_env"]
    gem_envs = [row for row in ENVIRONMENTS if row["env_type"] == "gem_env"]
    assert len(metal_envs) >= 70
    assert len(gem_envs) >= 20


def test_ground_count_meets_target():
    assert len(GROUNDS) >= 12


def test_scene_preset_count_meets_target():
    assert len(SCENE_PRESETS) >= 30


def test_scene_presets_use_active_polyhaven_env_slugs():
    from app.features.catalog.seed.environments import LEGACY_SYNTHETIC_SLUGS

    active_env_slugs = {row["slug"] for row in ENVIRONMENTS}
    for preset in SCENE_PRESETS:
        params = preset["params"]
        assert params["metalEnv"] not in LEGACY_SYNTHETIC_SLUGS
        assert params["gemEnv"] not in LEGACY_SYNTHETIC_SLUGS
        assert params["metalEnv"] in active_env_slugs
        assert params["gemEnv"] in active_env_slugs
