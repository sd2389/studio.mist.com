"""A look: what a scene is drawn with, and the catalogue items and library materials it names.

The studio browses the auth-gated catalogue and its owner's library; a view that only
displays a scene, like the embed on a shop's product page or a render job's worker, gets
exactly the items its look names, so it draws the piece the way the jeweler finished it
(ADR 0004). A render job copies a look only once `validate_look` passes it (ADR 0005).
"""

import json
import re
from collections.abc import Iterable, Mapping
from typing import Annotated, Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import storage_keys as keys
from app.core.public_urls import private_file_key
from app.core.validation import validation_detail
from app.features.catalog import serializers as catalog_serializers
from app.features.catalog.repository import active_by_slugs
from app.features.user_library import serializers as library_serializers
from app.features.user_library.repository import asset_at_key, get_asset, materials_by_ids
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
_VALID_CATALOG_REF = re.compile(r"catalog:([A-Za-z0-9._-]{1,96})")
_VALID_CUSTOM_REF = re.compile(r"custom:([0-9]{1,10})")
_NUMBERED_SLOT = re.compile(r"(metal|gem|accent)\s*0*([1-9][0-9]*)", re.IGNORECASE)

MAX_LOOK_BYTES = 64 * 1024
MAX_POSES = 32
PRESET_ID = r"^[a-z0-9-]{1,64}$"
POSE_ID = r"^[A-Za-z0-9._:-]{1,64}$"
# A catalogue slug, or an older id saved before the catalogue. Never a URL: no scheme, no colon.
SETTING_ID = r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,191}$"

Lighting = Literal["studio", "soft", "dark", "catalog", "dramatic"]
Finish = Literal["polished", "brushed", "satin", "hammered", "sandblasted"]
# What a slot is: metal, a stone or accent stones (slot_roles.py; ADR 0006).
SlotRole = Literal["metal", "gem", "accent"]

Position = Annotated[float, Field(ge=-10, le=10)]
Rotation = Annotated[float, Field(ge=-360, le=360)]
# The studio orbits up to 20 units from a target within ±10.
CameraCoordinate = Annotated[float, Field(ge=-30, le=30)]
EnvironmentIntensity = Annotated[float, Field(ge=0, le=400)]  # percent

# A backdrop is a colour or a gradient of colours, or one of the owner's background images.
# Without quotes, colons or url(), a colour can't make the worker fetch an address.
_CSS_BACKGROUND = re.compile(r"[A-Za-z0-9#.,%()\s/+-]{1,512}")
# One value at the top: a hex colour, a colour keyword, or a function (rgb(), hsl(), a gradient).
_CSS_ONE_VALUE = re.compile(r"\s*(#[0-9A-Fa-f]{3,8}|[A-Za-z]+|[A-Za-z-]+\(.*\))\s*", re.DOTALL)
_NOT_A_BACKGROUND = "must be a colour, a gradient of colours or one of your background images"
_CSS_FUNCTION = re.compile(r"([A-Za-z-]+)\s*\(")
_CSS_FUNCTIONS = frozenset(
    {
        "rgb", "rgba", "hsl", "hsla",
        "linear-gradient", "radial-gradient", "conic-gradient",
        "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient",
    }
)


def check_css_background(value: str) -> str:
    functions = {name.lower() for name in _CSS_FUNCTION.findall(value)}
    if not (_CSS_BACKGROUND.fullmatch(value) and _CSS_ONE_VALUE.fullmatch(value)) or not functions <= _CSS_FUNCTIONS:
        raise ValueError(_NOT_A_BACKGROUND)
    return value


def check_custom_background(value: Any) -> Any:
    """A link must be the app's own to a private file; whose file it is, validate_look checks."""
    if isinstance(value, str) and private_file_key(value) is None:
        check_css_background(value)
    return value


class LookPart(BaseModel):
    # Unknown keys are dropped rather than refused: settings saved by older studios still
    # render, and nothing the API hasn't checked reaches a worker.
    model_config = ConfigDict(extra="ignore", strict=True, allow_inf_nan=False)


class Point(LookPart):
    x: Position
    y: Position
    z: Position


class Angles(LookPart):
    x: Rotation
    y: Rotation
    z: Rotation


class ModelTransform(LookPart):
    position: Point
    rotation: Angles


class SavedPose(LookPart):
    id: str = Field(pattern=POSE_ID)
    name: str = Field(max_length=255)
    cameraPosition: list[CameraCoordinate] = Field(min_length=3, max_length=3)
    target: list[Position] = Field(min_length=3, max_length=3)
    isDefault: bool | None = None


class AdvancedSettings(LookPart):
    metalEnvRotation: Rotation | None = None
    metalEnvIntensity: EnvironmentIntensity | None = None
    gemEnvRotation: Rotation | None = None
    gemEnvIntensity: EnvironmentIntensity | None = None
    exposure: Annotated[float, Field(ge=0.1, le=4)] | None = None
    bloom: Annotated[float, Field(ge=0, le=2)] | None = None
    ao: bool | None = None
    starGlints: bool | None = None
    macroLens: bool | None = None


class EmbedSettings(LookPart):
    showChrome: bool | None = None
    autoRotate: bool | None = None
    showTitle: bool | None = None
    brandingText: str | None = Field(default=None, max_length=255)
    showZoomControls: bool | None = None
    showStudioLink: bool | None = None


class ImageBackground(LookPart):
    """One of the owner's background images, as a job's look keeps it: by id, never by address.

    The worker's payload turns the id into a short-lived URL (background_image_key)."""

    model_config = ConfigDict(extra="forbid", strict=True)

    type: Literal["image"]
    asset_id: int = Field(ge=1)


class SceneBuckets(LookPart):
    """The catalogue selections and the quality mode: all a model config keeps of the settings."""

    environment_metal: str | None = Field(default=None, alias="ENVIRONMENT-METAL", pattern=SETTING_ID)
    environment_gem: str | None = Field(default=None, alias="ENVIRONMENT-GEM", pattern=SETTING_ID)
    ground: str | None = Field(default=None, alias="GROUND", pattern=SETTING_ID)
    background: str | None = Field(default=None, alias="BACKGROUND", pattern=SETTING_ID)
    vjson: str | None = Field(default=None, alias="VJSON", pattern=SETTING_ID)
    quality_mode: Literal["standard", "photometric"] | None = None

    @model_validator(mode="before")
    @classmethod
    def _blank_is_none(cls, data: Any) -> Any:
        """An empty setting is saved as "" as often as null."""
        if isinstance(data, dict):
            return {key: None if value == "" else value for key, value in data.items()}
        return data


class SceneSettings(SceneBuckets):
    """SceneSettingsBuckets in src/lib/slot-materials/model-config.ts."""

    advanced: AdvancedSettings | None = None
    modelTransform: ModelTransform | None = None
    # The studio saves a background image as its /api/files/ link (public_file_url).
    customBackground: Annotated[str, Field(max_length=2048)] | ImageBackground | None = None
    poses: list[SavedPose] | None = Field(default=None, max_length=MAX_POSES)
    activePoseId: str | None = Field(default=None, pattern=POSE_ID)
    embed: EmbedSettings | None = None
    sceneSetup: str | None = Field(default=None, pattern=PRESET_ID)
    finish: Finish | None = None

    @field_validator("customBackground")
    @classmethod
    def _colour_gradient_or_image(cls, value: str | ImageBackground | None) -> str | ImageBackground | None:
        return check_custom_background(value)


class MaterialOption(LookPart):
    id: str = Field(max_length=128)
    label: str = Field(max_length=255)


class SlotConfig(LookPart):
    slotId: str = Field(min_length=1, max_length=128)
    label: str | None = Field(default=None, max_length=255)
    kind: Literal["metal", "gem", "accent", "default"] | None = None
    # What its design's conversion found it to be (ADR 0006); the studio goes by `kind`.
    role: SlotRole | None = None
    defaultMaterial: str | None = Field(default=None, max_length=128)
    materialOptions: list[MaterialOption] | None = Field(default=None, max_length=64)


class LayerProps(LookPart):
    visible: bool


class ModelConfig(LookPart):
    """PersistedModelConfig in src/lib/slot-materials/model-config.ts."""

    source: str | None = Field(default=None, max_length=32)
    slots: list[SlotConfig] | None = Field(default=None, max_length=256)
    defaultMaterials: dict[str, str] | None = None
    materialOptionsBySlot: dict[str, list[MaterialOption]] | None = None
    slotTokens: dict[str, list[str]] | None = None
    slotRenames: dict[str, str] | None = None
    materialProps: dict[str, LayerProps] | None = None  # layer visibility
    sceneSettings: SceneBuckets | None = None


class Look(LookPart):
    """What the studio autosaves (persistPayload in src/features/viewer/ui/useSavedScene.ts)."""

    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    material: str = Field(pattern=PRESET_ID)
    lighting: Lighting
    slot_selections: dict[Annotated[str, Field(min_length=1, max_length=128)], str] = Field(max_length=256)
    scene_settings: SceneSettings
    model_config_data: ModelConfig = Field(alias="model_config")


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


def normalize_slot_id(slot: str) -> str:
    """'Metal 01' and 'metal1' are 'Metal 1', as the studio matches slots (normalizeSlotId in
    src/lib/slot-materials/material-rules.ts)."""
    match = _NUMBERED_SLOT.fullmatch(slot)
    return f"{match.group(1).capitalize()} {int(match.group(2))}" if match else slot


def saved_look(scene: Scene) -> dict[str, Any]:
    """The look a scene was saved with, in the shape the studio autosaves it."""
    return {
        "material": scene.material,
        "lighting": scene.lighting,
        "slot_selections": scene.slot_selections or {},
        "scene_settings": scene.scene_settings or {},
        "model_config": scene.model_config or {},
    }


def variant_look(scene: Scene, variant_id: str) -> dict[str, Any] | None:
    """A saved variant's look: its snapshot over the scene's look, as the studio applies one
    (applyVariantSnapshot in src/lib/variants/variant-utils.ts). None when there is no such variant."""
    items = scene.variants.get("items") if isinstance(scene.variants, dict) else None
    variant = next(
        (item for item in items or [] if isinstance(item, dict) and item.get("id") == variant_id),
        None,
    )
    if variant is None:
        return None
    snapshot = variant.get("snapshot") if isinstance(variant.get("snapshot"), dict) else {}
    settings = snapshot.get("sceneSettings") if isinstance(snapshot.get("sceneSettings"), dict) else {}
    look = saved_look(scene)
    return {
        "material": snapshot.get("material"),
        "lighting": snapshot.get("lighting"),
        "slot_selections": snapshot.get("slotSelections") or {},
        # A variant keeps no finish; the studio keeps the scene's.
        "scene_settings": {"finish": look["scene_settings"].get("finish"), **settings},
        "model_config": {**look["model_config"], "materialProps": snapshot.get("materialProps") or {}},
    }


def check_material_refs(db: Session, refs: Mapping[str, str], owner_id: int) -> None:
    """Each material, keyed by the field that names it, is a preset, an active catalogue metal or
    gem, or one of the owner's library materials; 400 naming the field otherwise."""
    catalog_refs: dict[str, str] = {}
    custom_refs: dict[int, str] = {}
    for field, ref in refs.items():
        if catalog_match := _VALID_CATALOG_REF.fullmatch(ref):
            catalog_refs.setdefault(catalog_match.group(1), field)
        elif custom_match := _VALID_CUSTOM_REF.fullmatch(ref):
            custom_refs.setdefault(int(custom_match.group(1)), field)
        elif not re.fullmatch(PRESET_ID, ref):
            raise HTTPException(status_code=400, detail=f"{field}: '{ref}' is not a material")

    active = {row.slug for model in (CatalogMetal, CatalogGem) for row in active_by_slugs(db, model, catalog_refs)}
    for slug, field in catalog_refs.items():
        if slug not in active:
            raise HTTPException(status_code=400, detail=f"{field}: catalog:{slug} is not in the catalogue")
    owned = {row.id for row in materials_by_ids(db, owner_id, custom_refs)}
    for material_id, field in custom_refs.items():
        if material_id not in owned:
            raise HTTPException(status_code=400, detail=f"{field}: custom:{material_id} is not one of your materials")


def _check_slot_selections(db: Session, look: Look, owner_id: int) -> None:
    """Each selection names a slot of the model and a material (check_material_refs)."""
    slots = {normalize_slot_id(slot.slotId) for slot in look.model_config_data.slots or []}
    for slot in look.slot_selections:
        # A model config without slots takes them from the selections, as the studio does
        # (resolveModelConfig in src/features/viewer/domain/saved-look.ts).
        if slots and normalize_slot_id(slot) not in slots:
            raise HTTPException(status_code=400, detail=f"look.slot_selections.{slot}: the model has no slot '{slot}'")
    fields = {f"look.slot_selections.{slot}": ref for slot, ref in look.slot_selections.items()}
    check_material_refs(db, fields, owner_id)


_SETTING_CATALOGS = (
    ("ENVIRONMENT-METAL", CatalogEnvironment),
    ("ENVIRONMENT-GEM", CatalogEnvironment),
    ("BACKGROUND", CatalogBackground),
    ("GROUND", CatalogGround),
)


def check_setting_slugs(db: Session, settings: Mapping[str, Any], field: str = "look.scene_settings") -> None:
    """A slug the catalogue has retired is refused (400 naming the setting under `field`); one it
    never had is an older id, which passes as the embed takes it."""
    for key, model in _SETTING_CATALOGS:
        slug = settings.get(key)
        if slug and db.execute(select(model.is_active).where(model.slug == slug)).scalar_one_or_none() is False:
            raise HTTPException(status_code=400, detail=f"{field}.{key}: '{slug}' is no longer in the catalogue")


def background_image_key(db: Session, owner_id: int, asset_id: int) -> str | None:
    """The file a look's image background draws, or None when it isn't the owner's any more.

    It is the owner's background asset, as the studio shows it (its preview, else the image),
    and only when that file is under the owner's own prefix. A render job's payload signs it.
    """
    asset = get_asset(db, owner_id, asset_id)
    if asset is None or asset.asset_type != "background":
        return None
    key = asset.preview_key or asset.storage_key
    return key if keys.key_belongs_to_user(key, owner_id) else None


def background_image_id(
    db: Session, value: Any, owner_id: int, field: str = "look.scene_settings.customBackground"
) -> int | None:
    """The owner's background asset a custom background shows (by id, or by its link); None for
    none, a colour or a gradient; 400 naming `field` for an image that isn't one of theirs."""
    if isinstance(value, dict):
        asset_id = value["asset_id"]
    elif isinstance(value, str) and (key := private_file_key(value)):
        asset = asset_at_key(db, owner_id, "background", key)
        asset_id = asset.id if asset else None
    else:
        return None
    if asset_id is None or background_image_key(db, owner_id, asset_id) is None:
        raise HTTPException(status_code=400, detail=f"{field}: not one of your background images")
    return asset_id


def _keep_background_image_by_id(db: Session, settings: dict[str, Any], owner_id: int) -> None:
    """A background image becomes {"type": "image", "asset_id": id}, once it is one of the
    owner's background assets; a link to anything else is 400."""
    asset_id = background_image_id(db, settings.get("customBackground"), owner_id)
    if asset_id is not None:
        settings["customBackground"] = {"type": "image", "asset_id": asset_id}


def validate_look(db: Session, look: Mapping[str, Any], owner_id: int) -> dict[str, Any]:
    """The look a render job copies, or 400 naming the offending field.

    The look is at most 64 KB; its numbers are finite and in range; the items it names are
    active in the catalogue or the owner's own, and a background image is kept by its asset
    id. Unknown keys inside its settings and model config are dropped.
    """
    if len(json.dumps(look, separators=(",", ":"), ensure_ascii=False).encode()) > MAX_LOOK_BYTES:
        raise HTTPException(status_code=400, detail=f"look: larger than {MAX_LOOK_BYTES // 1024} KB")
    try:
        parsed = Look.model_validate(look)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=validation_detail(exc, "look")) from exc
    _check_slot_selections(db, parsed, owner_id)
    normalised = parsed.model_dump(mode="json", by_alias=True, exclude_unset=True)
    check_setting_slugs(db, normalised["scene_settings"])
    _keep_background_image_by_id(db, normalised["scene_settings"], owner_id)
    return normalised


def scene_look(db: Session, look: Mapping[str, Any], owner_id: int) -> SceneLook:
    """The catalogue items and library materials `look` names; library ones only the owner's."""
    settings = look.get("scene_settings") or {}
    selections = [ref for ref in (look.get("slot_selections") or {}).values() if isinstance(ref, str)]
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
        # Only the owner's own materials: a look naming another user's id must not expose it.
        user_materials=[
            library_serializers.material_to_item(row)
            for row in materials_by_ids(db, owner_id, custom_material_ids(selections))
        ],
    )
