"""Scene preset seed entries: one-click bundles of env + background + ground."""

from typing import Any

from .environments import (
    CANONICAL_GEM_ENV_SOFT,
    CANONICAL_GEM_ENV_STUDIO,
    CANONICAL_METAL_ENV_DARK,
    CANONICAL_METAL_ENV_SOFT,
    CANONICAL_METAL_ENV_STUDIO,
)

ME = CANONICAL_METAL_ENV_STUDIO
MS = CANONICAL_METAL_ENV_SOFT
MD = CANONICAL_METAL_ENV_DARK
GE = CANONICAL_GEM_ENV_STUDIO
GS = CANONICAL_GEM_ENV_SOFT


def _preset(
    slug: str,
    label: str,
    *,
    metal_env: str,
    gem_env: str,
    background: str,
    ground: str,
    exposure: float = 1.0,
    bloom: float = 0.3,
    ao: bool = True,
) -> dict[str, Any]:
    return {
        "slug": slug,
        "label": label,
        "params": {
            "metalEnv": metal_env,
            "gemEnv": gem_env,
            "background": background,
            "ground": ground,
            "advanced": {"exposure": exposure, "bloom": bloom, "ao": ao},
        },
    }


# Hand-curated flagship presets.
_FLAGSHIP: list[dict[str, Any]] = [
    _preset("scene-studio-classic", "Studio Classic",
            metal_env=ME, gem_env=GE,
            background="bg-radial-white", ground="ground-softshadow-frontleft"),
    _preset("scene-studio-soft", "Studio Soft",
            metal_env=MS, gem_env=GS,
            background="bg-linear-graywhite", ground="ground-reflection-soft", bloom=0.25),
    _preset("scene-luxe-dark", "Luxe Dark",
            metal_env=MD, gem_env=GE,
            background="bg-radial-black", ground="ground-reflection-mirror",
            exposure=1.1, bloom=0.45),
    _preset("scene-warm-bone", "Warm Bone",
            metal_env=ME, gem_env=GS,
            background="bg-bone", ground="ground-softshadow-frontright", bloom=0.2),
    _preset("scene-aqua-fresh", "Aqua Fresh",
            metal_env=MS, gem_env=GE,
            background="bg-radial-aqua", ground="ground-softshadow-backleft"),
    _preset("scene-rose-blush", "Rose Blush",
            metal_env=ME, gem_env=GS,
            background="bg-linear-pinkwhite", ground="ground-reflection-soft", bloom=0.25),
    _preset("scene-pure-white", "Pure White (E-commerce)",
            metal_env=ME, gem_env=GE,
            background="bg-white", ground="ground-contact", bloom=0.15),
    _preset("scene-transparent", "Transparent (PNG)",
            metal_env=ME, gem_env=GE,
            background="bg-none", ground="ground-none", bloom=0.2),
    _preset("scene-coral-pop", "Coral Pop",
            metal_env=MS, gem_env=GE,
            background="bg-radial-coral", ground="ground-softshadow-frontleft"),
    _preset("scene-midnight-blue", "Midnight Blue",
            metal_env=MD, gem_env=GS,
            background="bg-radial-darkblue", ground="ground-reflection-mirror",
            exposure=1.05, bloom=0.4),
]


def _build_generated_presets() -> list[dict[str, Any]]:
    """Systematic combos to reach ≥30 presets without hand-writing each one."""
    recipes: list[tuple[str, str, str, str, str, str, float, float]] = [
        ("scene-radial-beige", "Radial Beige", ME, GS,
         "bg-radial-beige", "ground-softshadow-backright", 1.0, 0.25),
        ("scene-radial-blue", "Radial Blue", MS, GE,
         "bg-radial-blue", "ground-reflection-soft", 1.0, 0.3),
        ("scene-radial-fuchsia", "Radial Fuchsia", ME, GE,
         "bg-radial-fuchsia", "ground-softshadow-frontleft", 1.0, 0.35),
        ("scene-radial-green", "Radial Green", MS, GS,
         "bg-radial-green", "ground-softshadow-backleft", 1.0, 0.28),
        ("scene-radial-red", "Radial Red", ME, GE,
         "bg-radial-red", "ground-shadow-frontleft", 1.0, 0.32),
        ("scene-linear-beige", "Linear Beige", ME, GS,
         "bg-linear-beige", "ground-softshadow-frontright", 1.0, 0.22),
        ("scene-linear-antrasit", "Linear Anthracite", MD, GE,
         "bg-linear-antrasit", "ground-reflection-mirror", 1.08, 0.4),
        ("scene-linear-lightblue", "Linear Light Blue", MS, GS,
         "bg-linear-lightblue", "ground-softshadow-backright", 1.0, 0.24),
        ("scene-linear-turquoise", "Linear Turquoise White", ME, GE,
         "bg-linear-turquoisewhite", "ground-reflection-soft", 1.0, 0.26),
        ("scene-light-gray", "Light Gray Studio", ME, GE,
         "bg-light-gray", "ground-contact", 1.0, 0.18),
        ("scene-pastel-yellow", "Pastel Yellow", MS, GS,
         "bg-pastelyellow", "ground-softshadow-frontleft", 1.0, 0.2),
        ("scene-turquoise-solid", "Turquoise Solid", ME, GE,
         "bg-turquoise", "ground-shadow-backleft", 1.0, 0.3),
        ("scene-wine-luxe", "Wine Luxe", MD, GS,
         "bg-wine", "ground-reflection-mirror", 1.1, 0.42),
        ("scene-radial-grey", "Radial Grey", ME, GS,
         "bg-radial-grey", "ground-softshadow-backleft", 1.0, 0.22),
        ("scene-radial-antrasit", "Radial Anthracite", MD, GE,
         "bg-radial-antrasit", "ground-reflection-soft", 1.05, 0.38),
        ("scene-radial-light-blue", "Radial Light Blue", MS, GE,
         "bg-radial-light-blue", "ground-softshadow-frontright", 1.0, 0.24),
        ("scene-linear-gray", "Linear Gray", ME, GS,
         "bg-linear-gray", "ground-shadow-frontright", 1.0, 0.2),
        ("scene-linear-graywhite-2", "Linear Gray White 2", MS, GE,
         "bg-linear-graywhite-2", "ground-softshadow-backright", 1.0, 0.22),
        ("scene-black-solid", "Black Solid", MD, GS,
         "bg-black", "ground-reflection-mirror", 1.12, 0.45),
        ("scene-mirror-showcase", "Mirror Showcase", ME, GE,
         "bg-radial-white", "ground-reflection-mirror", 1.0, 0.35),
    ]
    return [
        _preset(slug, label, metal_env=me, gem_env=ge, background=bg, ground=gr,
                exposure=exp, bloom=bloom)
        for slug, label, me, ge, bg, gr, exp, bloom in recipes
    ]


SCENE_PRESETS: list[dict[str, Any]] = _FLAGSHIP + _build_generated_presets()
