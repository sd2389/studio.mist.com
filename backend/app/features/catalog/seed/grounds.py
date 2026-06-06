"""Ground-plane seed entries (parametric shadow / reflection planes)."""

from typing import Any


def _ground(
    slug: str,
    label: str,
    *,
    shadow_opacity: float,
    shadow_blur: float,
    reflection: float,
    light_dir: str,
) -> dict[str, Any]:
    return {
        "slug": slug,
        "label": label,
        "params": {
            "shadowOpacity": shadow_opacity,
            "shadowBlur": shadow_blur,
            "reflectionStrength": reflection,
            "lightDir": light_dir,
        },
    }


GROUNDS: list[dict[str, Any]] = [
    {"slug": "ground-none", "label": "None", "params": {"kind": "none"}},
    _ground("ground-shadow-frontleft", "Shadow Front Left", shadow_opacity=0.5, shadow_blur=0.4, reflection=0.0, light_dir="front-left"),
    _ground("ground-shadow-frontright", "Shadow Front Right", shadow_opacity=0.5, shadow_blur=0.4, reflection=0.0, light_dir="front-right"),
    _ground("ground-shadow-backleft", "Shadow Back Left", shadow_opacity=0.5, shadow_blur=0.4, reflection=0.0, light_dir="back-left"),
    _ground("ground-shadow-backright", "Shadow Back Right", shadow_opacity=0.5, shadow_blur=0.4, reflection=0.0, light_dir="back-right"),
    _ground("ground-softshadow-frontleft", "Soft Shadow Front Left", shadow_opacity=0.3, shadow_blur=0.8, reflection=0.0, light_dir="front-left"),
    _ground("ground-softshadow-frontright", "Soft Shadow Front Right", shadow_opacity=0.3, shadow_blur=0.8, reflection=0.0, light_dir="front-right"),
    _ground("ground-softshadow-backleft", "Soft Shadow Back Left", shadow_opacity=0.3, shadow_blur=0.8, reflection=0.0, light_dir="back-left"),
    _ground("ground-softshadow-backright", "Soft Shadow Back Right", shadow_opacity=0.3, shadow_blur=0.8, reflection=0.0, light_dir="back-right"),
    _ground("ground-reflection-soft", "Soft Reflection", shadow_opacity=0.2, shadow_blur=0.6, reflection=0.35, light_dir="top"),
    _ground("ground-reflection-mirror", "Mirror Reflection", shadow_opacity=0.15, shadow_blur=0.3, reflection=0.7, light_dir="top"),
    _ground("ground-contact", "Contact Shadow", shadow_opacity=0.6, shadow_blur=0.15, reflection=0.0, light_dir="top"),
]
