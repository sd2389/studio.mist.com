"""Environment (HDRI) seed entries from CC0 Poly Haven assets.

Each row references a Poly Haven asset ID; master/preview keys are populated by
`scripts/fetch_cc0_hdris.py` after download. No proprietary Gemora HDR/EXR files.
"""

import json
from pathlib import Path
from typing import Any

_POLYHAVEN_JSON = Path(__file__).with_name("polyhaven_hdris.json")

# Legacy synthetic rigs superseded by real HDRIs.
LEGACY_SYNTHETIC_SLUGS = {
    "env-metal-studio",
    "env-metal-soft",
    "env-metal-dark",
    "env-gem-studio",
    "env-gem-soft",
}

# Canonical Poly Haven replacements for legacy synthetic rigs (used by scene presets).
CANONICAL_METAL_ENV_STUDIO = "env-metal-photo-studio-broadway-hall"
CANONICAL_METAL_ENV_SOFT = "env-metal-brown-photostudio-02"
CANONICAL_METAL_ENV_DARK = "env-metal-abandoned-hall-01"
CANONICAL_GEM_ENV_STUDIO = "env-gem-rosendal-park-sunset-puresky"
CANONICAL_GEM_ENV_SOFT = "env-gem-bell-park-pier"


def _env_from_polyhaven(
    asset_id: str,
    label: str,
    env_type: str,
    *,
    sort_weight: int,
    rotation: float = 0.0,
    intensity: float = 1.0,
) -> dict[str, Any]:
    prefix = "metal" if env_type == "metal_env" else "gem"
    slug = f"env-{prefix}-{asset_id.replace('_', '-')}"
    default_intensity = 1.0 if env_type == "metal_env" else 1.2
    return {
        "slug": slug,
        "label": label,
        "env_type": env_type,
        "default_rotation": rotation,
        "default_intensity": intensity if intensity != 1.0 else default_intensity,
        "params": {
            "source": "polyhaven",
            "assetId": asset_id,
            "license": "CC0",
        },
        "sort_weight": sort_weight,
    }


def _build_environments() -> list[dict[str, Any]]:
    raw = json.loads(_POLYHAVEN_JSON.read_text())
    rows: list[dict[str, Any]] = []
    for index, (asset_id, label) in enumerate(raw.get("metal", [])):
        rows.append(
            _env_from_polyhaven(asset_id, label, "metal_env", sort_weight=index * 10)
        )
    for index, (asset_id, label) in enumerate(raw.get("gem", [])):
        rows.append(
            _env_from_polyhaven(
                asset_id,
                label,
                "gem_env",
                sort_weight=1000 + index * 10,
            )
        )
    return rows


ENVIRONMENTS: list[dict[str, Any]] = _build_environments()
