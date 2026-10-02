"""The mark on images from plans that watermark (Free), drawn on the server.

It matches the one the browser stamps on exports (src/lib/export-watermark.ts): a faint
"MIST Studio" tiled diagonally across the whole frame, light text with a thin dark edge so it
reads on white and on black, sized from the frame's diagonal so it looks the same at any size.
"""

import math
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

WATERMARK_TEXT = "MIST Studio"
# Rows rise 30° from left to right.
ANGLE_DEG = 30
FONT_PER_DIAGONAL = 0.025
MIN_FONT_PX = 12
# Space after each mark along a row, and between rows, in font sizes.
GAP_EM = 2
ROW_EM = 3.6
EDGE_EM = 0.08
FILL = (255, 255, 255, round(0.22 * 255))
EDGE = (0, 0, 0, round(0.16 * 255))


def stamp_watermark(image: Image.Image) -> Image.Image:
    """`image` with the mark over all of it, transparent pixels included, as RGBA."""
    width, height = image.size
    diagonal = math.hypot(width, height)
    font_px = max(MIN_FONT_PX, round(diagonal * FONT_PER_DIAGONAL))
    font = ImageFont.load_default(size=font_px)
    step_x = font.getlength(WATERMARK_TEXT) + font_px * GAP_EM
    step_y = font_px * ROW_EM

    # Rows on a square as wide as the frame's diagonal, so the frame fits inside it at any
    # rotation; every other row shifts half a step, a brick pattern.
    side = math.ceil(diagonal)
    layer = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    # Pillow strokes outside the glyph only; the browser centres its line on the outline.
    edge = max(1, round(font_px * EDGE_EM / 2))
    for row in range(math.ceil(side / step_y) + 1):
        shift = step_x / 2 if row % 2 else 0
        for col in range(-1, math.ceil(side / step_x) + 1):
            position = (col * step_x + shift, row * step_y)
            draw.text(
                position, WATERMARK_TEXT, font=font, fill=FILL, anchor="mm",
                stroke_width=edge, stroke_fill=EDGE,
            )

    # Counter-clockwise, so rows rise to the right; then the frame-sized middle.
    layer = layer.rotate(ANGLE_DEG, resample=Image.Resampling.BICUBIC)
    left, top = (side - width) // 2, (side - height) // 2
    marked = image.convert("RGBA")
    marked.alpha_composite(layer.crop((left, top, left + width, top + height)))
    return marked


def stamp_png(data: bytes) -> bytes:
    """PNG bytes with the mark stamped on."""
    out = BytesIO()
    stamp_watermark(Image.open(BytesIO(data))).save(out, format="PNG")
    return out.getvalue()
