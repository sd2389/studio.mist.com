"""Render catalog swatch thumbnails as WebP bytes.

One job: turn parametric catalog JSON into a small preview image. Uses Pillow
(procedural gradients) — no WebGL, no proprietary assets. Visual style mirrors
the frontend MaterialSwatch chips (metal = circle, gem = diamond, background =
actual gradient spec).
"""

from __future__ import annotations

import io
import math
from typing import Any

from PIL import Image, ImageDraw

SIZE = 128


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    if len(value) != 6:
        return (160, 160, 160)
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def _blend(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (_lerp(c1[0], c2[0], t), _lerp(c1[1], c2[1], t), _lerp(c1[2], c2[2], t))


def _to_webp(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=85, method=4)
    return buf.getvalue()


def _draw_radial_circle(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    radius: int,
    base: tuple[int, int, int],
    *,
    highlight: tuple[int, int, int] | None = None,
    metal: bool = True,
) -> None:
    highlight = highlight or _blend(base, (255, 255, 255), 0.55 if metal else 0.35)
    shadow = _blend(base, (0, 0, 0), 0.35 if metal else 0.2)
    cx, cy = center
    for y in range(max(0, cy - radius), min(SIZE, cy + radius + 1)):
        for x in range(max(0, cx - radius), min(SIZE, cx + radius + 1)):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > radius:
                continue
            t = dist / radius
            # Specular highlight offset top-left
            hl_dist = math.sqrt((x - (cx - radius * 0.25)) ** 2 + (y - (cy - radius * 0.3)) ** 2)
            hl = max(0.0, 1.0 - hl_dist / (radius * 0.55)) * (0.7 if metal else 0.4)
            color = _blend(highlight, base, min(1.0, t * 0.85))
            color = _blend(color, shadow, max(0.0, (t - 0.55) * 1.8))
            if hl > 0:
                color = _blend(color, (255, 255, 255), hl * 0.6)
            draw.point((x, y), fill=color)


def render_metal_swatch(params: dict[str, Any]) -> bytes:
    color = _hex_to_rgb(str(params.get("color", "#C0C0C0")))
    roughness = float(params.get("roughness", 0.15))
    metalness = float(params.get("metalness", 1.0))
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    highlight_strength = max(0.15, 0.65 - roughness * 1.5)
    highlight = _blend(color, (255, 255, 255), highlight_strength)
    _draw_radial_circle(
        draw, (SIZE // 2, SIZE // 2), SIZE // 2 - 4, color,
        highlight=highlight, metal=metalness >= 0.5,
    )
    return _to_webp(img)


def render_gem_swatch(params: dict[str, Any]) -> bytes:
    base = _hex_to_rgb(str(params.get("baseColor", params.get("color", "#FFFFFF"))))
    atten = _hex_to_rgb(str(params.get("attenuationColor", params.get("baseColor", "#FFFFFF"))))
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    half = SIZE // 2 - 10
    # Diamond (square rotated 45°)
    points = [
        (cx, cy - half),
        (cx + half, cy),
        (cx, cy + half),
        (cx - half, cy),
    ]
    for y in range(SIZE):
        for x in range(SIZE):
            # Point-in-polygon for diamond
            inside = False
            j = len(points) - 1
            for i, (xi, yi) in enumerate(points):
                xj, yj = points[j]
                if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-6) + xi):
                    inside = not inside
                j = i
            if not inside:
                continue
            t = abs(x - cx) / (half + 1e-6)
            color = _blend(base, atten, min(1.0, t * 0.6))
            hl = max(0.0, 1.0 - math.sqrt((x - cx + half * 0.2) ** 2 + (y - cy - half * 0.2) ** 2) / (half * 0.8))
            if hl > 0:
                color = _blend(color, (255, 255, 255), hl * 0.5)
            draw.point((x, y), fill=(*color, 255))
    return _to_webp(img)


def render_surface_swatch(params: dict[str, Any]) -> bytes:
    return render_metal_swatch({**params, "metalness": 0.0, "roughness": float(params.get("roughness", 0.4))})


def render_background_swatch(params: dict[str, Any]) -> bytes:
    kind = str(params.get("kind", "solid"))
    img = Image.new("RGB", (SIZE, SIZE), (240, 240, 240))
    if kind == "none":
        # Checkerboard for transparent
        for y in range(SIZE):
            for x in range(SIZE):
                c = 220 if (x // 8 + y // 8) % 2 == 0 else 180
                img.putpixel((x, y), (c, c, c))
        return _to_webp(img.convert("RGBA"))

    if kind == "solid":
        rgb = _hex_to_rgb(str(params.get("color", "#FFFFFF")))
        img = Image.new("RGB", (SIZE, SIZE), rgb)
        return _to_webp(img)

    stops = params.get("stops") or []
    if kind == "radial" and len(stops) >= 2:
        inner = _hex_to_rgb(str(stops[0].get("color", "#FFFFFF")))
        outer = _hex_to_rgb(str(stops[-1].get("color", "#888888")))
        cx, cy = SIZE // 2, SIZE // 2
        max_r = SIZE * 0.72
        for y in range(SIZE):
            for x in range(SIZE):
                t = min(1.0, math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / max_r)
                img.putpixel((x, y), _blend(inner, outer, t))
        return _to_webp(img)

    if kind == "linear" and len(stops) >= 2:
        start = _hex_to_rgb(str(stops[0].get("color", "#FFFFFF")))
        end = _hex_to_rgb(str(stops[-1].get("color", "#888888")))
        angle = math.radians(float(params.get("angle", 180)))
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        for y in range(SIZE):
            for x in range(SIZE):
                nx = (x - SIZE / 2) / SIZE
                ny = (y - SIZE / 2) / SIZE
                t = (nx * cos_a + ny * sin_a + 1) / 2
                t = max(0.0, min(1.0, t))
                img.putpixel((x, y), _blend(start, end, t))
        return _to_webp(img)

    return _to_webp(img)


def render_ground_swatch(params: dict[str, Any]) -> bytes:
    if params.get("kind") == "none":
        return render_background_swatch({"kind": "none"})
    opacity = float(params.get("shadowOpacity", 0.4))
    gray = int(255 * (1 - opacity * 0.5))
    img = Image.new("RGB", (SIZE, SIZE), (gray, gray, gray))
    draw = ImageDraw.Draw(img)
    draw.ellipse([10, SIZE - 50, SIZE - 10, SIZE - 10], fill=(40, 40, 40))
    return _to_webp(img)


def render_environment_swatch(params: dict[str, Any]) -> bytes:
    rig = str(params.get("rig", "studio"))
    palette = {
        "studio": ("#E8E8EC", "#A0A4AA"),
        "soft": ("#F0EEF0", "#C8C4CC"),
        "dark": ("#4A4E55", "#1A1C20"),
    }
    inner, outer = palette.get(rig, palette["studio"])
    return render_background_swatch({"kind": "radial", "stops": [{"color": inner}, {"color": outer}]})


def render_scene_preset_swatch(params: dict[str, Any]) -> bytes:
    bg_slug = str(params.get("background", "bg-radial-white"))
    if "black" in bg_slug or "dark" in bg_slug or "antrasit" in bg_slug:
        return render_background_swatch({"kind": "radial", "stops": [{"color": "#4A4E55"}, {"color": "#1A1C20"}]})
    if "blue" in bg_slug:
        return render_background_swatch({"kind": "radial", "stops": [{"color": "#CFE0FB"}, {"color": "#5B8FD0"}]})
    if "coral" in bg_slug or "rose" in bg_slug or "pink" in bg_slug:
        return render_background_swatch({"kind": "radial", "stops": [{"color": "#FFD9CC"}, {"color": "#F0866A"}]})
    return render_background_swatch({"kind": "radial", "stops": [{"color": "#FFFFFF"}, {"color": "#DBDBDB"}]})
