"""What each slot of a model is: metal, a stone, or accent stones. Look templates pick a design's
materials by it (docs/adr/0006-bulk-pipeline.md, "Look templates by slot role"); the studio keeps
going by the slot's kind.

A converted design's slots carry the role its conversion found (conversion.json's `roles`, the
majority jewelryRole of each slot's meshes), so a 3DM's "Pave" layer is a stone although its
slot's kind is `default`. Any other slot's role comes from its kind, `default` being metal as it
defaults to gold, and a slot saved without a kind takes the kind its id gives.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, get_args

from app.features.scene.look import SlotRole, normalize_slot_id
from app.services.model_config import slot_kind

SLOT_ROLES: tuple[SlotRole, ...] = get_args(SlotRole)
# As the converter's slotRoles takes a slot's role from its kind (src/lib/upload/slot-roles.ts).
_ROLE_OF_KIND: dict[str, SlotRole] = {"metal": "metal", "gem": "gem", "accent": "accent", "default": "metal"}


def role_of_slot(slot: Mapping[str, Any]) -> SlotRole:
    """A model config slot's role: the one its conversion found, else its kind's."""
    role = slot.get("role")
    if role in SLOT_ROLES:
        return role
    kind = slot.get("kind")
    if kind not in _ROLE_OF_KIND:
        kind = slot_kind(normalize_slot_id(str(slot.get("slotId") or "")))
    return _ROLE_OF_KIND[kind]


def slot_roles(model_config: Mapping[str, Any] | None, slot_ids: Iterable[str] = ()) -> dict[str, SlotRole]:
    """Each slot's role, by its id as the model config names it, in the config's order. A config
    without slots takes them from `slot_ids` (a look's selections), as the studio does."""
    slots = [
        slot
        for slot in (model_config or {}).get("slots") or []
        if isinstance(slot, Mapping) and isinstance(slot.get("slotId"), str) and slot["slotId"]
    ]
    if not slots:
        slots = [{"slotId": slot_id} for slot_id in slot_ids]
    return {slot["slotId"]: role_of_slot(slot) for slot in slots}


def with_slot_roles(model_config: dict[str, Any], found: Mapping[str, SlotRole]) -> dict[str, Any]:
    """The model config with a role on every slot: the one `found` gives its slot (conversion.json's
    `roles`, by normalised id), else its kind's. Changed in place and returned."""
    found_by_slot = {normalize_slot_id(slot): role for slot, role in found.items()}
    for slot in model_config.get("slots") or []:
        slot["role"] = found_by_slot.get(normalize_slot_id(slot["slotId"])) or role_of_slot(slot)
    return model_config
