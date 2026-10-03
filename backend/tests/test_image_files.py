"""Image checks by bytes: the format by magic number, then a decode (or header) within limits."""

import pytest
from image_samples import openexr, radiance, raster
from model_samples import REAL_GLB, RENAMED_FILES

from app.services.image_files import (
    ImageRejectedError,
    WrongImageKindError,
    check_image,
    image_kind,
)

ALL = frozenset({"png", "jpeg", "webp", "hdr", "exr"})
LIMITS = {"max_side": 8192, "max_pixels": 40_000_000}


def check(payload: bytes, kinds: frozenset[str] = ALL, **limits):
    return check_image(payload, kinds=kinds, **{**LIMITS, **limits})


@pytest.mark.parametrize(
    ("payload", "kind", "extension", "content_type"),
    [
        (raster("PNG"), "png", ".png", "image/png"),
        (raster("JPEG"), "jpeg", ".jpg", "image/jpeg"),
        (raster("WEBP"), "webp", ".webp", "image/webp"),
        (radiance(), "hdr", ".hdr", "image/vnd.radiance"),
        (openexr(), "exr", ".exr", "image/x-exr"),
    ],
    ids=["png", "jpeg", "webp", "hdr", "exr"],
)
def test_real_images_are_recognised_by_their_bytes(payload, kind, extension, content_type):
    image = check(payload)
    assert (image.kind, image.extension, image.content_type) == (kind, extension, content_type)


def test_sizes_come_from_the_file():
    assert (check(raster("PNG", (16, 8))).width, check(raster("PNG", (16, 8))).height) == (16, 8)
    hdr = check(radiance(2048, 1024))
    assert (hdr.width, hdr.height) == (2048, 1024)
    exr = check(openexr(640, 320))
    assert (exr.width, exr.height) == (640, 320)


def test_a_radiance_header_with_extra_lines_is_read():
    """Like photo_studio_01_2k.hdr: the magic twice, then GAMMA and PRIMARIES lines."""
    header = b"#?RADIANCE\nGAMMA=1\nPRIMARIES=0 0 0 0 0 0 0 0\nFORMAT=32-bit_rle_rgbe\n\n"
    assert check(radiance(header=header)).kind == "hdr"


@pytest.mark.parametrize(
    "payload",
    [REAL_GLB, RENAMED_FILES["step"], b"GIF89a" + bytes(32), b"<svg xmlns='http://www.w3.org/2000/svg'/>", b""],
    ids=["glb", "step", "gif", "svg", "empty"],
)
def test_anything_else_is_the_wrong_kind(payload):
    assert image_kind(payload) is None
    with pytest.raises(WrongImageKindError):
        check(payload)


def test_a_format_the_caller_does_not_take_is_the_wrong_kind():
    with pytest.raises(WrongImageKindError):
        check(raster("PNG"), frozenset({"hdr", "exr", "jpeg"}))


@pytest.mark.parametrize("kind", ["PNG", "JPEG", "WEBP"])
def test_a_truncated_image_fails_to_decode(kind):
    payload = raster(kind, (64, 64))
    with pytest.raises(ImageRejectedError, match="can't be decoded") as exc:
        check(payload[: len(payload) // 2])
    assert not isinstance(exc.value, WrongImageKindError)


def test_magic_bytes_alone_are_not_an_image():
    with pytest.raises(ImageRejectedError, match="can't be decoded"):
        check(b"\x89PNG\r\n\x1a\n" + bytes(64))


def test_an_image_over_the_pixel_limits_is_refused_before_decoding():
    with pytest.raises(ImageRejectedError, match="20x10 px"):
        check(raster("PNG", (20, 10)), max_side=16)
    with pytest.raises(ImageRejectedError, match="limit"):
        check(raster("PNG", (20, 10)), max_pixels=199)
    with pytest.raises(ImageRejectedError, match="limit"):
        check(radiance(100_000, 50_000))  # a header can claim any size
    with pytest.raises(ImageRejectedError, match="limit"):
        check(openexr(100_000, 50_000))


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        (b"#?RADIANCE\n\n-Y 2 +X 4\n" + bytes(32), "no FORMAT line"),
        (b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n+X 4 -Y 2\n" + bytes(32), "has no '-Y"),
        (b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n", "no pixel data"),
        (b"#?RGBE\nFORMAT=32-bit_rle_rgbe\n" + b"x" * 70_000, "has no '-Y"),
    ],
    ids=["no-format", "flipped-orientation", "no-pixels", "header-never-ends"],
)
def test_a_radiance_file_the_loader_would_reject_is_refused(payload, reason):
    with pytest.raises(ImageRejectedError, match=reason):
        check(payload)


@pytest.mark.parametrize(
    ("payload", "reason"),
    [
        (openexr(flags=0x02), "single-part scanline"),  # tiled
        (openexr(flags=0x10), "single-part scanline"),  # multi-part
        (openexr(compression=6), "compression"),  # B44
        (openexr()[:40], "cut short|never ends"),
    ],
    ids=["tiled", "multi-part", "b44", "cut-short"],
)
def test_an_openexr_file_the_loader_would_reject_is_refused(payload, reason):
    with pytest.raises(ImageRejectedError, match=reason):
        check(payload)


def test_long_attribute_names_are_the_one_exr_flag_allowed():
    assert check(openexr(flags=0x04)).kind == "exr"
