"""What a scene's saved look draws from, resolved for anyone who can open the scene.

The studio browses the auth-gated catalogue and its owner's library; a view that only
displays a scene, like the embed on a shop's product page, gets exactly the items the look
names, so it draws the piece the way the jeweler finished it.
"""

import re
from collections.abc import Iterable, Mapping
from typing import Any

from sqlalchemy.orm import Session

from app.features.catalog import serializers as catalog_serializers
from app.features.catalog.repository import active_by_slugs
from app.features.user_library import serializers as library_serializers
from app.features.user_library.repository import materials_by_ids
from app.models.catalog import (
    CatalogBackground,
    CatalogEnvironment,
    CatalogGem,
    CatalogGround,
    CatalogMetal,
)
from app.models.scene import Scene
from app.schemas.scene import SceneLook

# Slot selections name a catalogue material `catalog:<slug>` and a library one `custom:<id>`
# (src/lib/catalog/catalog-material-ref.ts, src/lib/library/custom-material-ref.ts).
_CATALOG_REF = re.compile(r"catalog:(.+)")
_CUSTOM_REF = re.compile(r"custom:(\d+)")


def setting_slugs(settings: Mapping[str, Any], *keys: str) -> set[str]:
    """The catalogue slugs saved under `keys` of a scene's settings."""
    values = (settings.get(key) for key in keys)
    return {value.strip() for value in values if isinstance(value, str) and value.strip()}


def catalog_material_slugs(selections: Iterable[str]) -> set[str]:
    matches = (_CATALOG_REF.fullmatch(ref) for ref in selections)
    return {match.group(1).strip() for match in matches if match and match.group(1).strip()}


def custom_material_ids(selections: Iterable[str]) -> set[int]:
    matches = (_CUSTOM_REF.fullmatch(ref) for ref in selections)
    return {int(match.group(1)) for match in matches if match}


def scene_look(db: Session, scene: Scene) -> SceneLook:
    settings = scene.scene_settings or {}
    selections = [ref for ref in (scene.slot_selections or {}).values() if isinstance(ref, str)]
    environment_slugs = setting_slugs(settings, "ENVIRONMENT-METAL", "ENVIRONMENT-GEM")
    material_slugs = catalog_material_slugs(selections)
    return SceneLook(
        environments=[
            catalog_serializers.environment_to_item(row)
            for row in active_by_slugs(db, CatalogEnvironment, environment_slugs)
        ],
        backgrounds=[
            catalog_serializers.background_to_item(row)
            for row in active_by_slugs(db, CatalogBackground, setting_slugs(settings, "BACKGROUND"))
        ],
        grounds=[
            catalog_serializers.ground_to_item(row)
            for row in active_by_slugs(db, CatalogGround, setting_slugs(settings, "GROUND"))
        ],
        metals=[
            catalog_serializers.metal_to_item(row)
            for row in active_by_slugs(db, CatalogMetal, material_slugs)
        ],
        gems=[
            catalog_serializers.gem_to_item(row)
            for row in active_by_slugs(db, CatalogGem, material_slugs)
        ],
        # Only the owner's own materials: a scene naming another user's id must not expose it.
        user_materials=[
            library_serializers.material_to_item(row)
            for row in materials_by_ids(db, scene.user_id, custom_material_ids(selections))
        ],
    )
