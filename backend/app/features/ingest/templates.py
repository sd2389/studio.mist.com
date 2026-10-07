"""Look templates by slot role (docs/adr/0006-bulk-pipeline.md, "Look templates by slot role"):
what one is, how one is made of a finished scene's look, the checks it passes, and how a converted
design's scene takes it.

A template names materials by role (metal, gem, accent), so it fits any design whatever its slots
are called. A slot of the scene it was made of whose material isn't its role's (a two-tone ring's
white-gold head on a yellow band) keeps its own in `slot_materials`, by role and name, and a
design with a slot of that name and role gets it too. A design's slot whose role the template has
no material for keeps the converter's selection, and its design says so in a warning.

The checks are validate_look's: the lighting and finish the studio has, scene settings in range
and in the catalogue, and every material a preset, an active catalogue metal or gem, or one of
the owner's library materials. Poses, the model's transform and embed settings are one scene's,
not a template's.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.core.validation import validation_detail
from app.features.scene.look import (
    PRESET_ID,
    AdvancedSettings,
    Finish,
    Lighting,
    SceneBuckets,
    SlotRole,
    background_image_id,
    check_custom_background,
    check_material_refs,
    check_setting_slugs,
    normalize_slot_id,
)
from app.features.scene.slot_roles import slot_roles

MAX_SLOTS_A_ROLE = 64
# The scene settings a template carries, all of TemplateSettings.
TEMPLATE_SETTINGS = (
    "ENVIRONMENT-METAL", "ENVIRONMENT-GEM", "GROUND", "BACKGROUND", "VJSON", "quality_mode",
    "advanced", "sceneSetup", "customBackground",
)
# A warning names this many slots, then counts the rest.
_SLOTS_NAMED = 5

Material = Annotated[str, Field(min_length=1, max_length=128)]
SlotId = Annotated[str, Field(min_length=1, max_length=128)]


class TemplateSettings(SceneBuckets):
    """The look's catalogue settings and quality mode, its studio scene, its advanced settings
    and its backdrop: one of the owner's background images by its link, as the studio saves it."""

    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    advanced: AdvancedSettings | None = None
    sceneSetup: str | None = Field(default=None, pattern=PRESET_ID)
    customBackground: Annotated[str, Field(max_length=2048)] | None = None

    @field_validator("customBackground")
    @classmethod
    def _colour_gradient_or_image(cls, value: str | None) -> str | None:
        return check_custom_background(value)


class LookTemplateSpec(BaseModel):
    """A look template, as a batch keeps it (ingest_batches.look_template)."""

    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)

    lighting: Lighting = "studio"
    finish: Finish = "polished"
    # The material for every slot of a role.
    materials: dict[SlotRole, Material] = Field(default_factory=dict)
    # A slot's own material, by role and then by its name as the studio matches it.
    slot_materials: dict[SlotRole, dict[SlotId, Material]] = Field(default_factory=dict)
    scene_settings: TemplateSettings = Field(default_factory=TemplateSettings)

    @field_validator("slot_materials")
    @classmethod
    def _named_slots(cls, value: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
        if any(len(slots) > MAX_SLOTS_A_ROLE for slots in value.values()):
            raise ValueError(f"at most {MAX_SLOTS_A_ROLE} slots a role")
        return {
            role: {normalize_slot_id(slot): material for slot, material in slots.items()}
            for role, slots in value.items()
            if slots
        }


def _material_fields(template: LookTemplateSpec) -> dict[str, str]:
    """Each material of the template, keyed by the field that names it."""
    fields = {f"look_template.materials.{role}": ref for role, ref in template.materials.items()}
    for role, slots in template.slot_materials.items():
        fields |= {f"look_template.slot_materials.{role}.{slot}": ref for slot, ref in slots.items()}
    return fields


def validate_look_template(db: Session, raw: Any, owner_id: int) -> dict[str, Any]:
    """The template as a batch keeps it, or 400 naming the field (`look_template.…`): its parts
    what a look's may be, every material one validate_look takes, its catalogue settings not
    retired, and an image backdrop one of the owner's background images."""
    try:
        template = LookTemplateSpec.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=validation_detail(exc, "look_template")) from exc
    check_material_refs(db, _material_fields(template), owner_id)
    normalised = template.model_dump(mode="json", by_alias=True, exclude_none=True)
    settings = normalised["scene_settings"]
    check_setting_slugs(db, settings, "look_template.scene_settings")
    background_image_id(db, settings.get("customBackground"), owner_id, "look_template.scene_settings.customBackground")
    return normalised


def template_materials(template: Mapping[str, Any]) -> list[str]:
    """Every material a template names, each once: the roles' first, then the slots'."""
    refs = list((template.get("materials") or {}).values())
    for slots in (template.get("slot_materials") or {}).values():
        refs.extend(slots.values())
    return list(dict.fromkeys(refs))


def template_of_look(look: Mapping[str, Any]) -> dict[str, Any]:
    """A template of a scene's look (saved_look), to be validated: each role the material most of
    its slots have, a tie going to the role's first slot with Heads last, so that a two-tone ring's
    band gives the metal; each slot with another material keeps it in slot_materials."""
    settings = look.get("scene_settings") or {}
    selections = {
        normalize_slot_id(slot): ref for slot, ref in (look.get("slot_selections") or {}).items() if isinstance(ref, str)
    }
    roles = {normalize_slot_id(slot): role for slot, role in slot_roles(look.get("model_config"), selections).items()}
    used: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for slot in sorted(roles, key=lambda slot: slot == "Heads"):  # stable: otherwise the config's order
        if slot in selections:
            used[roles[slot]].append((slot, selections[slot]))
    materials: dict[str, str] = {}
    slot_materials: dict[str, dict[str, str]] = {}
    for role, slots in used.items():
        materials[role] = Counter(ref for _, ref in slots).most_common(1)[0][0]  # ties: first counted
        if own := {slot: ref for slot, ref in slots if ref != materials[role]}:
            slot_materials[role] = own
    return {
        "lighting": look.get("lighting"),
        "finish": settings.get("finish") or "polished",
        "materials": materials,
        "slot_materials": slot_materials,
        "scene_settings": {key: settings[key] for key in TEMPLATE_SETTINGS if key in settings},
    }


@dataclass(frozen=True)
class TemplatedLook:
    """A converted design's scene look from its batch's template, and what its design is told."""

    lighting: str
    slot_selections: dict[str, str]
    scene_settings: dict[str, Any]
    warnings: list[str]


def _kept_defaults(role: str, slots: list[str]) -> str:
    named = ", ".join(f'"{slot}"' for slot in slots[:_SLOTS_NAMED])
    if len(slots) > _SLOTS_NAMED:
        named += f" and {len(slots) - _SLOTS_NAMED} more"
    if len(slots) == 1:
        return f"The look template has no {role} material, so slot {named} keeps its default."
    return f"The look template has no {role} material, so slots {named} keep their defaults."


def apply_look_template(
    template: Mapping[str, Any], model_config: Mapping[str, Any], defaults: Mapping[str, str]
) -> TemplatedLook:
    """The look of a converted design's scene from a validated template: each slot the material the
    template has for its name and role, else for its role; a slot whose role it has none for keeps
    its default (the converter's selection), with a warning. The template's lighting, finish and
    scene settings replace the defaults."""
    own = {normalize_slot_id(slot): ref for slot, ref in defaults.items()}
    named = template.get("slot_materials") or {}
    by_role = template.get("materials") or {}
    selections: dict[str, str] = {}
    unmatched: dict[str, list[str]] = defaultdict(list)
    for slot, role in slot_roles(model_config, defaults).items():
        material = (named.get(role) or {}).get(normalize_slot_id(slot)) or by_role.get(role)
        if material is None:
            unmatched[role].append(slot)
            material = own.get(normalize_slot_id(slot))
        if material is not None:
            selections[slot] = material
    return TemplatedLook(
        lighting=template["lighting"],
        slot_selections=selections,
        scene_settings={**(template.get("scene_settings") or {}), "finish": template["finish"]},
        warnings=[_kept_defaults(role, slots) for role, slots in unmatched.items()],
    )
