"""Metal + surface seed entries.

Metal PBR values mirror the renderer's physically-motivated specs. Each base
metal is expanded into one catalog row per finish (polished / brushed / satin /
hammered / sandblasted) so the UI swatch grid matches Gemora-style tiles.
Surfaces are generic clean-room PBR palettes — no proprietary asset files.
"""

from typing import Any

FINISHES = ["polished", "brushed", "satin", "hammered", "sandblasted"]

# Roughness multiplier and clearcoat scale per finish (matches finish-textures.ts logic).
_FINISH_SPEC: dict[str, dict[str, float]] = {
    "polished": {"roughnessFactor": 1.0, "clearcoatScale": 1.0},
    "brushed": {"roughnessFactor": 1.45, "clearcoatScale": 0.35},
    "satin": {"roughnessFactor": 1.2, "clearcoatScale": 1.0},
    "hammered": {"roughnessFactor": 1.65, "clearcoatScale": 0.35},
    "sandblasted": {"roughnessFactor": 1.85, "clearcoatScale": 0.35},
}


def _metal_base(
    slug: str,
    label: str,
    family: str,
    color: str,
    roughness: float,
    env: float,
    clearcoat: float,
    clearcoat_roughness: float,
) -> dict[str, Any]:
    return {
        "slug": slug,
        "label": label,
        "family": family,
        "color": color,
        "roughness": roughness,
        "envMapIntensity": env,
        "clearcoat": clearcoat,
        "clearcoatRoughness": clearcoat_roughness,
    }


# Base metal recipes (21 jewelry metals).
_METAL_BASES: list[dict[str, Any]] = [
    _metal_base("gold-24k", "24K Gold", "yellow-gold", "#FFC940", 0.10, 1.50, 0.50, 0.05),
    _metal_base("gold-22k", "22K Gold", "yellow-gold", "#FFC658", 0.11, 1.45, 0.45, 0.05),
    _metal_base("gold-18k-yellow", "18K Yellow Gold", "yellow-gold", "#F5D785", 0.13, 1.40, 0.40, 0.05),
    _metal_base("gold-14k-yellow", "14K Yellow Gold", "yellow-gold", "#EDD09A", 0.15, 1.35, 0.40, 0.05),
    _metal_base("gold-10k-yellow", "10K Yellow Gold", "yellow-gold", "#E0C895", 0.17, 1.30, 0.40, 0.06),
    _metal_base("gold-9k-yellow", "9K Yellow Gold", "yellow-gold", "#DCBA80", 0.18, 1.28, 0.35, 0.06),
    _metal_base("gold-warm", "Warm Gold", "yellow-gold", "#E6B860", 0.13, 1.40, 0.45, 0.04),
    _metal_base("gold-18k-white", "18K White Gold", "white-gold", "#E8E4DC", 0.12, 1.55, 0.85, 0.03),
    _metal_base("gold-14k-white", "14K White Gold", "white-gold", "#E4E2DC", 0.13, 1.50, 0.85, 0.03),
    _metal_base("gold-10k-white", "10K White Gold", "white-gold", "#DDDCD8", 0.14, 1.45, 0.85, 0.04),
    _metal_base("gold-18k-rose", "18K Rose Gold", "rose-gold", "#E8B3A5", 0.14, 1.40, 0.50, 0.04),
    _metal_base("gold-14k-rose", "14K Rose Gold", "rose-gold", "#DDB4A6", 0.15, 1.35, 0.45, 0.04),
    _metal_base("gold-red", "Red Gold", "rose-gold", "#C97746", 0.14, 1.35, 0.45, 0.04),
    _metal_base("gold-red-light", "Light Red Gold", "rose-gold", "#D89478", 0.14, 1.38, 0.45, 0.04),
    _metal_base("gold-green", "Green Gold", "specialty-gold", "#D8D27D", 0.14, 1.35, 0.40, 0.05),
    _metal_base("gold-grey", "Grey Gold", "specialty-gold", "#BFB6A6", 0.17, 1.25, 0.45, 0.05),
    _metal_base("gold-sand", "Sand Gold", "specialty-gold", "#E9D9B8", 0.13, 1.38, 0.45, 0.04),
    _metal_base("platinum", "Platinum", "platinum", "#D4D4D6", 0.18, 1.50, 0.60, 0.04),
    _metal_base("silver-sterling", "Sterling Silver", "silver", "#F1EFE7", 0.11, 1.55, 0.55, 0.03),
    _metal_base("titanium", "Titanium", "titanium", "#8B847C", 0.32, 1.20, 0.20, 0.08),
    _metal_base("rhodium-black", "Black Rhodium", "rhodium", "#1F2024", 0.22, 1.10, 0.70, 0.05),
]


def _build_metal_finishes() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for base in _METAL_BASES:
        for finish in FINISHES:
            spec = _FINISH_SPEC[finish]
            rows.append(
                {
                    "slug": f"{base['slug']}-{finish}",
                    "label": f"{base['label']} ({finish.capitalize()})",
                    "category": "metal",
                    "family": base["family"],
                    "params": {
                        "baseSlug": base["slug"],
                        "finish": finish,
                        "color": base["color"],
                        "metalness": 1.0,
                        "roughness": min(0.95, base["roughness"] * spec["roughnessFactor"]),
                        "envMapIntensity": base["envMapIntensity"],
                        "clearcoat": base["clearcoat"] * spec["clearcoatScale"],
                        "clearcoatRoughness": base["clearcoatRoughness"],
                    },
                }
            )
    return rows


_SURFACE_FAMILIES: dict[str, dict[str, Any]] = {
    "ceramic": {"roughness": 0.35, "clearcoat": 0.6, "clearcoatRoughness": 0.1},
    "enamel": {"roughness": 0.18, "clearcoat": 0.8, "clearcoatRoughness": 0.05},
    "plastic": {"roughness": 0.45, "clearcoat": 0.3, "clearcoatRoughness": 0.2},
    "leather": {"roughness": 0.75, "clearcoat": 0.05, "clearcoatRoughness": 0.5},
    "wood": {"roughness": 0.6, "clearcoat": 0.15, "clearcoatRoughness": 0.3},
    "marble": {"roughness": 0.28, "clearcoat": 0.4, "clearcoatRoughness": 0.12},
    "pearl-shell": {"roughness": 0.22, "clearcoat": 0.7, "clearcoatRoughness": 0.08},
    "coral": {"roughness": 0.55, "clearcoat": 0.2, "clearcoatRoughness": 0.25},
    "fabric": {"roughness": 0.82, "clearcoat": 0.02, "clearcoatRoughness": 0.6},
    "horn": {"roughness": 0.48, "clearcoat": 0.25, "clearcoatRoughness": 0.2},
    "agate": {"roughness": 0.38, "clearcoat": 0.35, "clearcoatRoughness": 0.15},
    "snake-leather": {"roughness": 0.68, "clearcoat": 0.08, "clearcoatRoughness": 0.45},
    "matte-paint": {"roughness": 0.72, "clearcoat": 0.05, "clearcoatRoughness": 0.5},
}

_PALETTE: dict[str, list[tuple[str, str]]] = {
    "ceramic": [
        ("White", "#F5F4F1"), ("Black", "#1B1B1D"), ("Blue", "#3A6EA5"),
        ("Bluemarine", "#2E5B6B"), ("Cyan", "#3FB6C4"), ("Green", "#5AA469"),
        ("Grey", "#9AA0A6"), ("Orange", "#E08A3C"), ("Pink", "#E59AB8"),
        ("Red", "#C0392B"), ("Sand", "#D8C3A0"), ("Yellow", "#E9C84A"),
        ("Violet", "#7B5EA8"), ("Mint", "#8FD4B0"), ("Coral", "#E87A6A"),
        ("Ivory", "#F0EBE0"), ("Charcoal", "#3A3A3E"),
    ],
    "enamel": [
        ("White", "#F2F1EC"), ("Blue", "#2F5BD0"), ("Dark Blue", "#1B2E6B"),
        ("Green", "#1F8A52"), ("Pink", "#E06AA0"), ("Red", "#CB2E3E"),
        ("Yellow", "#E9C84A"), ("Orange", "#E07A2C"), ("Purple", "#6B3FA8"),
        ("Turquoise", "#2FB6A6"), ("Black", "#1A1A1E"),
    ],
    "plastic": [
        ("Black", "#202024"), ("Blue", "#2C6BD0"), ("Indigo", "#3B3FA8"),
        ("Green", "#3AA655"), ("Lime", "#9ACB3A"), ("Grey", "#9499A0"),
        ("Orange", "#E07A2C"), ("Pink", "#E06AB0"), ("Purple", "#8B3FB0"),
        ("Red", "#CB3030"), ("Turquoise", "#2FB6A6"), ("Yellow", "#E9C83A"),
        ("White", "#F2F2F4"), ("Rose", "#E8A0B0"), ("Violet Dark", "#5A2E8A"),
        ("Violet Light", "#9A6FD0"), ("Peach", "#F0B090"),
    ],
    "leather": [
        ("Beige", "#C9B59A"), ("Black", "#23211F"), ("Blue Marine", "#2C4763"),
        ("Brown", "#6B4A2E"), ("Green", "#4A5C3A"), ("Grey", "#7A7873"),
        ("Orange", "#B5642C"), ("Peach", "#D9A98C"), ("Pink", "#CE8FA0"),
        ("Red", "#8E2E2E"), ("Turquoise", "#3A8C86"), ("Yellow", "#C9A23A"),
        ("Cognac", "#9A5E34"), ("Navy", "#1E2E4A"), ("Burgundy", "#6B1F2E"),
    ],
    "wood": [
        ("Brown", "#6E4A2C"), ("Light Brown", "#9A6E44"), ("Dark Brown", "#4A3220"),
        ("Ebony", "#211B16"), ("Gold Brown", "#8A5E2E"), ("Grey", "#857F76"),
        ("Red", "#7A3A28"), ("Cork", "#C2A06A"), ("Walnut", "#5C3A22"),
        ("Oak", "#B8925A"), ("Teak", "#8A6A3A"),
    ],
    "marble": [
        ("White", "#F4F2EE"), ("Black", "#2A2A2C"), ("Grey", "#B8B8BA"),
        ("Carrara", "#E8E6E2"), ("Emperador", "#6B4A32"), ("Calacatta", "#F0EDE8"),
        ("Green", "#8AAE8A"), ("Blue", "#9AB0C8"), ("Rose", "#E8C8C0"),
        ("Gold Vein", "#D8C8A0"), ("Red", "#C8A0A0"), ("Brown", "#A8907A"),
    ],
    "pearl-shell": [
        ("White", "#F8F4EC"), ("Cream", "#F0E8D8"), ("Gold", "#E8D0A0"),
        ("Rose", "#F0C8C0"), ("Grey", "#C8C0B8"), ("Grey Light", "#D8D0C8"),
        ("Peach", "#F0C8B0"), ("Pink Light", "#F8D0D8"), ("Tahitian", "#3A4A4A"),
        ("Black", "#2A2E2E"), ("Champagne", "#E0C8A8"),
    ],
    "coral": [
        ("Angelskin", "#F8C8C0"), ("Red", "#E06050"), ("Pink", "#F09090"),
        ("Salmon", "#F0A088"), ("Orange", "#E87850"),
    ],
    "fabric": [
        ("Beige", "#D8C8A8"), ("Black", "#1E1E20"), ("Blue 1", "#3A5A8A"),
        ("Blue 2", "#5A7AB0"), ("Brown", "#8A6A4A"), ("Classic Black", "#242428"),
        ("Classic Blue 1", "#2A4A7A"), ("Classic Blue 2", "#4A6A9A"),
        ("Classic Green", "#4A6A4A"), ("Classic Red", "#8A2A2A"),
        ("Cream", "#F0E8D8"), ("Gold", "#C8A860"), ("Grey", "#9A9A9E"),
        ("Ivory", "#F4F0E8"), ("Navy", "#1E2E4A"), ("Olive", "#6A6A4A"),
        ("Pink", "#E8A8B8"), ("Purple", "#6A4A7A"), ("Red", "#A03030"),
        ("Sand", "#D0B890"), ("Silver", "#C0C0C4"), ("Teal", "#3A7A7A"),
        ("White", "#F4F4F0"), ("Wine", "#5A2030"),
    ],
    "horn": [
        ("Black", "#2A2218"), ("Brown", "#6A4A28"), ("Cream", "#E8D8B8"),
        ("Dark Brown", "#4A3220"), ("Gold Brown", "#8A6A3A"), ("Grey", "#8A8078"),
        ("Light", "#D8C8A8"), ("Red Brown", "#7A4A30"),
    ],
    "agate": [
        ("Blue 1", "#4A6A9A"), ("Blue 2", "#6A8AB0"), ("Brown", "#8A6A4A"),
        ("Green 1", "#5A8A6A"), ("Green 2", "#7AAA8A"), ("Grey", "#9A9A9E"),
        ("Orange", "#D08A4A"), ("Pink", "#D8A0A8"), ("Purple", "#7A5A8A"),
        ("Red", "#A04040"), ("White", "#E8E4E0"), ("Yellow", "#D8C060"),
        ("Black", "#2A2A2E"), ("Cream", "#E8DCC8"), ("Moss", "#6A7A5A"),
        ("Fire", "#C86040"), ("Ocean", "#3A6A7A"), ("Forest", "#4A6A4A"),
        ("Sunset", "#D89060"), ("Smoke", "#7A7A7E"), ("Jasper", "#8A5A40"),
    ],
    "snake-leather": [
        ("Black", "#1E1E20"), ("Black Crocodile", "#242428"), ("Blue Marine", "#2A4A5A"),
        ("Blue Royal", "#2A4A8A"), ("Blue Snake", "#3A5A7A"), ("Brown 1", "#6A4A2E"),
        ("Brown 2", "#7A5A3A"), ("Brown Crocodile", "#5A3A22"), ("Green 1", "#4A5A3A"),
        ("Green 2", "#5A6A4A"), ("Green Crocodile", "#3A4A32"), ("Green Snake", "#4A6A4A"),
        ("Grey", "#7A7874"), ("Orange Snake", "#B06A2A"), ("Peach", "#D8A890"),
        ("Pink", "#C88A98"), ("Purple", "#6A4A6A"), ("Red 1", "#8A2A2A"),
        ("Red 2", "#A03A3A"), ("Red Crocodile", "#6A2020"), ("Red Snake", "#9A3030"),
        ("Rosa 1", "#D8A0A8"), ("Rosa 2", "#E8B0B8"), ("Turquoise", "#3A8A86"),
        ("Turquoise Crocodile", "#2A6A66"), ("Violet Crocodile", "#5A3A6A"),
        ("Violet Snake", "#6A4A7A"), ("White Snake", "#D8D8D4"), ("Yellow", "#C8A040"),
        ("Yellow Snake", "#B89030"),
    ],
    "matte-paint": [
        ("Black", "#1A1A1C"), ("Blue", "#3A5A9A"), ("Blue Dark", "#2A3A6A"),
        ("Blue Indigo", "#3A3A8A"), ("Blue Light", "#6A8AC0"), ("Green", "#4A8A5A"),
        ("Green Lime", "#8AC040"), ("Grey", "#8A8A8E"), ("Orange", "#D07030"),
        ("Pink", "#D080A0"), ("Pink Dark", "#A05070"), ("Pink Intense", "#C04080"),
        ("Pink Light", "#E8A8C0"), ("Purple", "#6A3A8A"), ("Purple Light", "#9A6AB0"),
        ("Red 1", "#B03030"), ("Red 2", "#8A2020"), ("Rose", "#D890A0"),
        ("Turquoise", "#40A8A0"), ("Violet", "#6A4A9A"), ("Violet Dark", "#4A2A6A"),
        ("Violet Light", "#9A7AC0"), ("White", "#E8E8EA"), ("Yellow", "#D8B040"),
        ("Yellow Light", "#E8D060"),
    ],
}


def _build_surfaces() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for family, swatches in _PALETTE.items():
        base = _SURFACE_FAMILIES[family]
        for color_name, hex_color in swatches:
            color_slug = color_name.lower().replace(" ", "-")
            rows.append(
                {
                    "slug": f"surface-{family}-{color_slug}",
                    "label": f"{family.replace('-', ' ').title()} {color_name}",
                    "category": "surface",
                    "family": family,
                    "params": {
                        "color": hex_color,
                        "metalness": 0.0,
                        "roughness": base["roughness"],
                        "envMapIntensity": 1.0,
                        "clearcoat": base["clearcoat"],
                        "clearcoatRoughness": base["clearcoatRoughness"],
                        "finishes": ["polished", "satin"],
                    },
                }
            )
    return rows


METAL_FINISHES: list[dict[str, Any]] = _build_metal_finishes()
SURFACES: list[dict[str, Any]] = _build_surfaces()

# Legacy base metals kept for renderer preset mapping (not seeded separately).
METALS: list[dict[str, Any]] = [
    {
        "slug": b["slug"],
        "label": b["label"],
        "category": "metal",
        "family": b["family"],
        "params": {
            "color": b["color"],
            "metalness": 1.0,
            "roughness": b["roughness"],
            "envMapIntensity": b["envMapIntensity"],
            "clearcoat": b["clearcoat"],
            "clearcoatRoughness": b["clearcoatRoughness"],
            "finishes": FINISHES,
        },
    }
    for b in _METAL_BASES
]

ALL_METALS: list[dict[str, Any]] = METAL_FINISHES + SURFACES
