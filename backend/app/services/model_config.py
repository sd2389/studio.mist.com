import json
import re
import struct
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal


SceneSettingBucket = Literal[
    "ENVIRONMENT-METAL",
    "ENVIRONMENT-GEM",
    "GROUND",
    "BACKGROUND",
    "VJSON",
    "quality_mode",
]


METAL_PRESETS = [
    ("gold-24k", "24K Yellow"),
    ("gold-22k", "22K Yellow"),
    ("gold-18k-yellow", "18K Yellow"),
    ("gold-14k-yellow", "14K Yellow"),
    ("gold-10k-yellow", "10K Yellow"),
    ("gold-9k-yellow", "9K Yellow"),
    ("gold-18k-white", "18K White"),
    ("gold-14k-white", "14K White"),
    ("gold-10k-white", "10K White"),
    ("platinum", "Platinum"),
    ("silver-sterling", "Sterling Silver"),
    ("titanium", "Titanium"),
    ("rhodium-black", "Black Rhodium"),
    ("gold-18k-rose", "18K Rose"),
    ("gold-14k-rose", "14K Rose"),
    ("gold-red", "Red Gold"),
    ("gold-red-light", "Light Red Gold"),
    ("gold-green", "Green Gold"),
    ("gold-grey", "Grey Gold"),
    ("gold-sand", "Sand Gold"),
    ("gold-warm", "Warm Gold"),
]

GEM_PRESETS = [
    ("diamond", "Diamond"),
    ("diamond-canary", "Canary Diamond"),
    ("diamond-pink", "Pink Diamond"),
    ("diamond-blue", "Blue Diamond"),
    ("diamond-champagne", "Champagne Diamond"),
    ("diamond-cognac", "Cognac Diamond"),
    ("diamond-black", "Black Diamond"),
    ("moissanite", "Moissanite"),
    ("zircon", "Zircon"),
    ("ruby", "Ruby"),
    ("sapphire", "Sapphire"),
    ("spinel", "Spinel"),
    ("tanzanite", "Tanzanite"),
    ("garnet-tsavorite", "Tsavorite"),
    ("garnet-almandine", "Garnet"),
    ("peridot", "Peridot"),
    ("topaz-blue", "Blue Topaz"),
    ("tourmaline", "Tourmaline"),
    ("aquamarine", "Aquamarine"),
    ("emerald", "Emerald"),
    ("morganite", "Morganite"),
    ("amethyst", "Amethyst"),
    ("citrine", "Citrine"),
    ("opal", "Opal"),
    ("jade", "Jade"),
    ("pearl", "Pearl"),
]


DEFAULT_SCENE_SETTINGS: dict[SceneSettingBucket, str] = {
    "ENVIRONMENT-METAL": "",
    "ENVIRONMENT-GEM": "",
    "GROUND": "",
    "BACKGROUND": "",
    "VJSON": "",
    "quality_mode": "standard",
}


@dataclass
class SlotSignal:
    slot_id: str
    token: str


def _normalize_slot_token(token: str) -> str | None:
    value = token.strip()
    if not value:
        return None

    if (
        re.match(r"^heads?$", value, re.IGNORECASE)
        or re.match(r"^head$", value, re.IGNORECASE)
        or re.match(r"^prongs?$", value, re.IGNORECASE)
    ):
        return "Heads"

    if re.match(r"^(metal|band|shank|setting|bezel)$", value, re.IGNORECASE):
        return "Metal 1"

    if re.match(r"^(gem|stone|diamond)$", value, re.IGNORECASE):
        return "Gem 1"

    metal = re.match(r"^metal\s*0*([1-9]\d*)$", value, re.IGNORECASE)
    if metal:
        return f"Metal {int(metal.group(1))}"

    gem = re.match(r"^(gem|stone)\s*0*([1-9]\d*)$", value, re.IGNORECASE)
    if gem:
        return f"Gem {int(gem.group(2))}"

    accent = re.match(r"^accent\s*0*([1-9]\d*)$", value, re.IGNORECASE)
    if accent:
        return f"Accent {int(accent.group(1))}"

    return None


def _infer_slot_from_name(name: str) -> SlotSignal | None:
    direct = _normalize_slot_token(name)
    if direct:
        return SlotSignal(slot_id=direct, token=name.strip().lower())

    for chunk in re.split(r"[|/_\-:(),\s]+", name):
        normalized = _normalize_slot_token(chunk)
        if normalized:
            return SlotSignal(slot_id=normalized, token=chunk.strip().lower())

    return None


def _extract_gltf_bytes(filename: str, payload: bytes) -> dict | None:
    lower = filename.lower()
    if lower.endswith(".gltf"):
        try:
            return json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    if not lower.endswith(".glb") or len(payload) < 20:
        return None

    magic, _version, _length = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF":
        return None

    offset = 12
    while offset + 8 <= len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        if offset + chunk_length > len(payload):
            return None
        chunk = payload[offset : offset + chunk_length]
        offset += chunk_length
        # JSON chunk type ("JSON") in little-endian int.
        if chunk_type == 0x4E4F534A:
            try:
                return json.loads(chunk.decode("utf-8").rstrip("\x00").strip())
            except (UnicodeDecodeError, json.JSONDecodeError):
                return None

    return None


def _slot_signals_from_gltf_doc(doc: dict) -> list[SlotSignal]:
    nodes = doc.get("nodes", []) if isinstance(doc.get("nodes"), list) else []
    meshes = doc.get("meshes", []) if isinstance(doc.get("meshes"), list) else []
    materials = doc.get("materials", []) if isinstance(doc.get("materials"), list) else []

    mesh_material_map: dict[int, list[str]] = defaultdict(list)
    for mesh_index, mesh in enumerate(meshes):
        if not isinstance(mesh, dict):
            continue
        for primitive in mesh.get("primitives", []):
            if not isinstance(primitive, dict):
                continue
            material_idx = primitive.get("material")
            if not isinstance(material_idx, int):
                continue
            if 0 <= material_idx < len(materials):
                material_name = materials[material_idx].get("name")
                if isinstance(material_name, str) and material_name:
                    mesh_material_map[mesh_index].append(material_name)

    signals: list[SlotSignal] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        candidates: list[str] = []
        node_name = node.get("name")
        if isinstance(node_name, str) and node_name:
            candidates.append(node_name)
        mesh_idx = node.get("mesh")
        if isinstance(mesh_idx, int) and 0 <= mesh_idx < len(meshes):
            mesh_name = meshes[mesh_idx].get("name")
            if isinstance(mesh_name, str) and mesh_name:
                candidates.append(mesh_name)
            candidates.extend(mesh_material_map.get(mesh_idx, []))

        for candidate in candidates:
            signal = _infer_slot_from_name(candidate)
            if signal:
                signals.append(signal)

    return signals


def _slot_signals_from_3dm(payload: bytes) -> list[SlotSignal]:
    try:
        import rhino3dm  # type: ignore
    except ImportError:
        return []

    try:
        # rhino3dm expects a mutable byte array for FromByteArray.
        doc = rhino3dm.File3dm.FromByteArray(bytearray(payload))
    except Exception:
        return []

    if doc is None:
        return []

    layers = doc.Layers
    layer_count = len(layers)
    signals: list[SlotSignal] = []
    for obj in doc.Objects:
        attrs = obj.Attributes
        candidates: list[str] = []
        if attrs is not None:
            if attrs.Name:
                candidates.append(str(attrs.Name))
            if attrs.LayerIndex is not None and 0 <= attrs.LayerIndex < layer_count:
                layer = layers[attrs.LayerIndex]
                if layer and layer.Name:
                    candidates.append(str(layer.Name))

        for candidate in candidates:
            signal = _infer_slot_from_name(candidate)
            if signal:
                signals.append(signal)

    return signals


def detect_slot_tokens(filename: str, payload: bytes) -> dict[str, list[str]]:
    lower = filename.lower()
    signals: list[SlotSignal] = []

    if lower.endswith(".glb") or lower.endswith(".gltf"):
        doc = _extract_gltf_bytes(filename, payload)
        if doc is not None:
            signals.extend(_slot_signals_from_gltf_doc(doc))
    elif lower.endswith(".3dm"):
        signals.extend(_slot_signals_from_3dm(payload))

    by_slot: dict[str, set[str]] = defaultdict(set)
    for signal in signals:
        if signal.token:
            by_slot[signal.slot_id].add(signal.token)

    return {slot: sorted(tokens) for slot, tokens in by_slot.items()}


def _is_generic_gem_token(token: str) -> bool:
    value = token.strip().lower()
    return bool(re.match(r"^(gem|stone|diamond)(\s*0*[1-9]\d*)?$", value))


def _collapse_generic_gem_slots(slot_tokens: dict[str, list[str]]) -> dict[str, list[str]]:
    gem_slots = sorted(slot for slot in slot_tokens if slot.startswith("Gem "))
    if len(gem_slots) <= 1:
        return slot_tokens

    # Only collapse if all gem slots are generic labels (gem 01, gem 02, diamond, ...)
    # and there is no semantic distinction like "center", "side", "halo", etc.
    for slot in gem_slots:
        tokens = slot_tokens.get(slot, [])
        if not tokens or any(not _is_generic_gem_token(token) for token in tokens):
            return slot_tokens

    primary = "Gem 1" if "Gem 1" in gem_slots else gem_slots[0]
    merged = dict(slot_tokens)
    merged_tokens: set[str] = set()
    for slot in gem_slots:
        merged_tokens.update(merged.get(slot, []))
        if slot != primary:
            merged.pop(slot, None)
    merged[primary] = sorted(merged_tokens)
    return merged


def _slot_kind(slot: str) -> Literal["metal", "gem", "accent", "default"]:
    if slot == "Heads" or slot.startswith("Metal "):
        return "metal"
    if slot.startswith("Gem "):
        return "gem"
    if slot.startswith("Accent "):
        return "accent"
    return "default"


def _default_material(slot: str) -> str:
    kind = _slot_kind(slot)
    if kind in ("gem", "accent"):
        return "diamond"
    return "gold-14k-yellow"


def _options_for_slot(slot: str) -> list[tuple[str, str]]:
    kind = _slot_kind(slot)
    if kind in ("gem", "accent"):
        return GEM_PRESETS
    return METAL_PRESETS


def build_slot_material_config(filename: str, payload: bytes) -> dict:
    slot_tokens = _collapse_generic_gem_slots(detect_slot_tokens(filename, payload))
    slots = sorted(slot_tokens.keys())

    if not slots:
        # Untagged STL / generic uploads keep legacy behavior.
        fallback_options = [{"id": ident, "label": label} for ident, label in METAL_PRESETS]
        return {
            "source": "upload-ingest",
            "slots": [
                {
                    "slotId": "default",
                    "label": "default",
                    "kind": "default",
                    "defaultMaterial": "gold-14k-yellow",
                    "materialOptions": fallback_options,
                }
            ],
            "defaultMaterials": {"default": "gold-14k-yellow"},
            "materialOptionsBySlot": {"default": fallback_options},
            "slotTokens": {},
            "sceneSettings": dict(DEFAULT_SCENE_SETTINGS),
        }

    default_materials = {slot: _default_material(slot) for slot in slots}
    material_options = {
        slot: [{"id": ident, "label": label} for ident, label in _options_for_slot(slot)]
        for slot in slots
    }
    slots_payload = [
        {
            "slotId": slot,
            "label": slot,
            "kind": _slot_kind(slot),
            "defaultMaterial": default_materials[slot],
            "materialOptions": material_options[slot],
        }
        for slot in slots
    ]
    return {
        "source": "upload-ingest",
        "slots": slots_payload,
        "defaultMaterials": default_materials,
        "materialOptionsBySlot": material_options,
        "slotTokens": slot_tokens,
        "sceneSettings": dict(DEFAULT_SCENE_SETTINGS),
    }


def build_scene_settings_config() -> dict:
    return dict(DEFAULT_SCENE_SETTINGS)


def merge_slot_material_config(inferred: dict, provided: dict | None) -> dict:
    """
    Merge client-provided slot config into ingest-derived config without losing
    backend-inferred fidelity (especially slotTokens/material options).
    """
    if not provided:
        return inferred

    merged = dict(inferred)
    provided_slots = provided.get("slots")
    if isinstance(provided_slots, list) and provided_slots:
        merged["slots"] = provided_slots

    provided_defaults = provided.get("defaultMaterials")
    if isinstance(provided_defaults, dict):
        merged_defaults = dict(inferred.get("defaultMaterials") or {})
        for slot, material in provided_defaults.items():
            if isinstance(slot, str) and isinstance(material, str):
                merged_defaults[slot] = material
        merged["defaultMaterials"] = merged_defaults

    provided_options = provided.get("materialOptionsBySlot")
    if isinstance(provided_options, dict):
        merged_options = dict(inferred.get("materialOptionsBySlot") or {})
        for slot, options in provided_options.items():
            if isinstance(slot, str) and isinstance(options, list):
                merged_options[slot] = options
        merged["materialOptionsBySlot"] = merged_options

    # Preserve ingest-derived slotTokens unless caller explicitly provides them.
    provided_tokens = provided.get("slotTokens")
    if isinstance(provided_tokens, dict):
        merged_tokens = dict(inferred.get("slotTokens") or {})
        for slot, tokens in provided_tokens.items():
            if isinstance(slot, str) and isinstance(tokens, list):
                normalized = sorted(
                    {
                        token.strip().lower()
                        for token in tokens
                        if isinstance(token, str) and token.strip()
                    }
                )
                if normalized:
                    merged_tokens[slot] = normalized
        merged["slotTokens"] = merged_tokens

    source = provided.get("source")
    if isinstance(source, str) and source.strip():
        merged["source"] = source.strip()

    return merged


_SCENE_EXTENDED_KEYS = frozenset(
    {"advanced", "modelTransform", "customBackground", "poses", "activePoseId"}
)


def merge_scene_settings(inferred: dict, provided: dict | None) -> dict:
    merged = dict(inferred)
    if not provided:
        return merged
    for key, value in provided.items():
        if key in DEFAULT_SCENE_SETTINGS and (value is None or isinstance(value, str)):
            merged[key] = value
        elif key in _SCENE_EXTENDED_KEYS and value is not None:
            merged[key] = value
    return merged
