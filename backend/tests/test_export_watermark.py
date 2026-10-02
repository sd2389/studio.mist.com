"""The server-drawn watermark on Free images: over the whole frame, on light, dark and clear."""

import io

import pytest
from PIL import Image, ImageChops

from app.services.export_watermark import stamp_png, stamp_watermark


def _quadrants(size: tuple[int, int]) -> list[tuple[int, int, int, int]]:
    w, h = size
    return [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]


@pytest.mark.parametrize("color", [(255, 255, 255, 255), (0, 0, 0, 255), (0, 0, 0, 0)])
def test_the_mark_reaches_every_part_of_the_frame(color):
    plain = Image.new("RGBA", (640, 360), color)

    marked = stamp_watermark(plain)

    assert marked.mode == "RGBA" and marked.size == plain.size
    diff = ImageChops.difference(marked, plain)
    for box in _quadrants(plain.size):
        assert diff.crop(box).getbbox(alpha_only=False) is not None, box


def test_the_mark_stays_faint():
    plain = Image.new("RGB", (640, 360), (255, 255, 255))

    marked = stamp_watermark(plain).convert("L")

    # Mostly untouched paper: the mark is a light tint with a thin edge, not a cover.
    assert sum(marked.histogram()[250:]) > 0.8 * 640 * 360


def test_stamp_png_keeps_the_size():
    buf = io.BytesIO()
    Image.new("RGB", (300, 200), (30, 30, 30)).save(buf, format="PNG")

    out = Image.open(io.BytesIO(stamp_png(buf.getvalue())))

    assert out.format == "PNG" and out.size == (300, 200)
