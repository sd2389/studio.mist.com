"""Background seed entries.

Each background is a gradient/solid spec rendered by the client (SVG/CSS), so no
image binary is stored. `kind` is one of solid | linear | radial.
"""

from typing import Any


def _solid(slug: str, label: str, color: str) -> dict[str, Any]:
    return {
        "slug": slug,
        "label": label,
        "is_transparent": False,
        "params": {"kind": "solid", "color": color},
    }


def _linear(slug: str, label: str, angle: int, start: str, end: str) -> dict[str, Any]:
    return {
        "slug": slug,
        "label": label,
        "is_transparent": False,
        "params": {
            "kind": "linear",
            "angle": angle,
            "stops": [{"offset": 0.0, "color": start}, {"offset": 1.0, "color": end}],
        },
    }


def _radial(slug: str, label: str, inner: str, outer: str) -> dict[str, Any]:
    return {
        "slug": slug,
        "label": label,
        "is_transparent": False,
        "params": {
            "kind": "radial",
            "stops": [{"offset": 0.0, "color": inner}, {"offset": 1.0, "color": outer}],
        },
    }


BACKGROUNDS: list[dict[str, Any]] = [
    {"slug": "bg-none", "label": "None", "is_transparent": True, "params": {"kind": "none"}},
    _solid("bg-white", "White", "#FFFFFF"),
    _solid("bg-bone", "Bone", "#F3EEE6"),
    _solid("bg-light-gray", "Light Gray", "#E6E6E6"),
    _solid("bg-black", "Black", "#0E0E10"),
    _solid("bg-turquoise", "Turquoise", "#1FB6A6"),
    _solid("bg-wine", "Wine", "#5A1F2D"),
    _linear("bg-linear-graywhite", "Linear Gray White", 180, "#FFFFFF", "#D9D9D9"),
    _linear("bg-linear-graywhite-2", "Linear Gray White 2", 180, "#F2F2F2", "#C8C8C8"),
    _linear("bg-linear-gray", "Linear Gray", 180, "#D9D9D9", "#9AA0A6"),
    _linear("bg-linear-antrasit", "Linear Anthracite", 180, "#4A4E55", "#23262B"),
    _linear("bg-linear-beige", "Linear Beige", 180, "#EFE6D6", "#D8C3A0"),
    _linear("bg-linear-lightblue", "Linear Light Blue", 180, "#E8F4FB", "#AFD7EE"),
    _linear("bg-linear-pinkwhite", "Linear Pink White", 180, "#FFFFFF", "#F6D2DD"),
    _linear("bg-linear-turquoisewhite", "Linear Turquoise White", 180, "#FFFFFF", "#BFEFE8"),
    _solid("bg-pastelyellow", "Pastel Yellow", "#F7EFC2"),
    _radial("bg-radial-white", "Radial White", "#FFFFFF", "#DBDBDB"),
    _radial("bg-radial-gray", "Radial Gray", "#C8C8C8", "#7A7E84"),
    _radial("bg-radial-grey", "Radial Grey", "#D0D0D0", "#8A8E94"),
    _radial("bg-radial-antrasit", "Radial Anthracite", "#4A4E55", "#1B1D21"),
    _radial("bg-radial-black", "Radial Black", "#2A2A2E", "#0A0A0C"),
    _radial("bg-radial-beige", "Radial Beige", "#EFE6D6", "#CBB792"),
    _radial("bg-radial-aqua", "Radial Aqua", "#CFF3F1", "#5FC8C0"),
    _radial("bg-radial-blue", "Radial Blue", "#CFE0FB", "#5B8FD0"),
    _radial("bg-radial-light-blue", "Radial Light Blue", "#E8F2FB", "#A9D2EE"),
    _radial("bg-radial-darkblue", "Radial Dark Blue", "#3A557A", "#16263E"),
    _radial("bg-radial-coral", "Radial Coral", "#FFD9CC", "#F0866A"),
    _radial("bg-radial-fuchsia", "Radial Fuchsia", "#F9CCE6", "#D0489E"),
    _radial("bg-radial-green", "Radial Green", "#D6F0CF", "#6AAE5B"),
    _radial("bg-radial-red", "Radial Red", "#F6CFCF", "#C0392B"),
    _solid("bg-ivory", "Ivory", "#F8F4EC"),
    _solid("bg-champagne", "Champagne", "#E8D8B8"),
    _solid("bg-silver", "Silver", "#D8D8DC"),
    _linear("bg-linear-gold", "Linear Gold", 180, "#FFF8E8", "#D8B860"),
    _radial("bg-radial-gold", "Radial Gold", "#FFF4D0", "#C8A040"),
]
