"""Uploaded images judged by their bytes, never a file name or the client's content type.

PNG, JPEG and WebP are recognised by magic number and must decode in full with Pillow.
Radiance HDR and OpenEXR environment maps are read only as far as their headers, by the
rules the viewer's loaders (three-stdlib RGBELoader and EXRLoader) apply.
"""

from __future__ import annotations

import io
import re
import struct
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

# kind: (file extension, content type)
IMAGE_TYPES = {
    "png": (".png", "image/png"),
    "jpeg": (".jpg", "image/jpeg"),
    "webp": (".webp", "image/webp"),
    "hdr": (".hdr", "image/vnd.radiance"),
    "exr": (".exr", "image/x-exr"),
}
_PILLOW_FORMATS = {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}
_HEADER_SCAN_BYTES = 64 * 1024  # how far into an HDR or EXR file its header may run

_RADIANCE_FORMAT = re.compile(rb"\s*FORMAT=\S+\s*")
_RADIANCE_SIZE = re.compile(rb"\s*-Y\s+(?P<height>\d+)\s+\+X\s+(?P<width>\d+)\s*")
_EXR_LONG_NAMES = 0x04  # the only version flag EXRLoader accepts: no tiles, deep data or parts
# The compression methods EXRLoader decodes: none, RLE, ZIPS, ZIP, PIZ, PXR24, DWAA, DWAB.
_EXR_COMPRESSIONS = frozenset({0, 1, 2, 3, 4, 5, 8, 9})


class ImageRejectedError(ValueError):
    """Not an image of an accepted kind, or one that can't be read within the limits."""


class WrongImageKindError(ImageRejectedError):
    """No image at all, or an image in a format the caller does not take."""


@dataclass(frozen=True)
class CheckedImage:
    kind: str
    width: int
    height: int

    @property
    def extension(self) -> str:
        return IMAGE_TYPES[self.kind][0]

    @property
    def content_type(self) -> str:
        return IMAGE_TYPES[self.kind][1]


def image_kind(payload: bytes) -> str | None:
    """The image format the bytes start with, or None."""
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if payload.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return "webp"
    if payload.startswith((b"#?RADIANCE\n", b"#?RGBE\n")):
        return "hdr"
    if payload.startswith(b"\x76\x2f\x31\x01"):
        return "exr"
    return None


def check_image(payload: bytes, *, kinds: frozenset[str], max_side: int, max_pixels: int) -> CheckedImage:
    """The image the bytes hold, if it is one of `kinds` and fits the limits.

    Raises WrongImageKindError for any other format, and ImageRejectedError for a file of
    the right format that can't be read or is too large.
    """
    kind = image_kind(payload)
    if kind not in kinds:
        raise WrongImageKindError(f"not one of {', '.join(sorted(kinds))}")
    if kind == "hdr":
        width, height = _radiance_size(payload)
    elif kind == "exr":
        width, height = _openexr_size(payload)
    else:
        return _decode_raster(payload, kind, max_side=max_side, max_pixels=max_pixels)
    _require_size(width, height, max_side=max_side, max_pixels=max_pixels)
    return CheckedImage(kind, width, height)


def _decode_raster(payload: bytes, kind: str, *, max_side: int, max_pixels: int) -> CheckedImage:
    """Open with Pillow as the sniffed format only, check the size, then decode every pixel:
    a truncated or corrupt file fails here rather than in a viewer."""
    try:
        with Image.open(io.BytesIO(payload), formats=[_PILLOW_FORMATS[kind]]) as image:
            width, height = image.size
            _require_size(width, height, max_side=max_side, max_pixels=max_pixels)
            image.load()
    except ImageRejectedError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise ImageRejectedError(f"the {kind.upper()} data can't be decoded") from exc
    return CheckedImage(kind, width, height)


def _require_size(width: int, height: int, *, max_side: int, max_pixels: int) -> None:
    if not (0 < width <= max_side and 0 < height <= max_side) or width * height > max_pixels:
        raise ImageRejectedError(
            f"it is {width}x{height} px; the limit is {max_side} px a side and {max_pixels:,} px in all"
        )


def _radiance_size(payload: bytes) -> tuple[int, int]:
    """Width and height from a Radiance header: after the magic line, a FORMAT line, then the
    `-Y <height> +X <width>` line (the only orientation RGBELoader reads), then pixel data."""
    offset = payload.index(b"\n") + 1
    has_format = False
    while True:
        end = payload.find(b"\n", offset, _HEADER_SCAN_BYTES)
        if end < 0:
            break
        line, offset = payload[offset:end], end + 1
        has_format = has_format or _RADIANCE_FORMAT.fullmatch(line) is not None
        size = _RADIANCE_SIZE.fullmatch(line)
        if size:
            if not has_format:
                raise ImageRejectedError("its Radiance header has no FORMAT line")
            if offset >= len(payload):
                raise ImageRejectedError("it has no pixel data")
            return int(size["width"]), int(size["height"])
    raise ImageRejectedError("its Radiance header has no '-Y <height> +X <width>' line")


def _openexr_size(payload: bytes) -> tuple[int, int]:
    """Width and height from an OpenEXR header, which must describe a file EXRLoader reads:
    version 2, one scanline part, a compression it decodes, and a data window."""
    if len(payload) < 8 or payload[4] != 2 or payload[5] & ~_EXR_LONG_NAMES or payload[6:8] != b"\0\0":
        raise ImageRejectedError("only single-part scanline OpenEXR 2 files load")
    attributes = _openexr_attributes(payload)
    compression = attributes.get("compression", b"")
    if len(compression) != 1 or compression[0] not in _EXR_COMPRESSIONS:
        raise ImageRejectedError("its OpenEXR compression can't be decoded by the viewer")
    data_window = attributes.get("dataWindow", b"")
    if len(data_window) != 16:
        raise ImageRejectedError("its OpenEXR header has no data window")
    x_min, y_min, x_max, y_max = struct.unpack("<4i", data_window)
    return x_max - x_min + 1, y_max - y_min + 1


def _openexr_attributes(payload: bytes) -> dict[str, bytes]:
    """Header attributes (name, type, size, value) up to the null byte that ends them."""
    attributes: dict[str, bytes] = {}
    limit = min(len(payload), _HEADER_SCAN_BYTES)
    offset = 8
    while True:
        name, offset = _null_terminated(payload, offset, limit)
        if not name:
            return attributes
        _type, offset = _null_terminated(payload, offset, limit)
        if offset + 4 > limit:
            raise ImageRejectedError("its OpenEXR header is cut short")
        (size,) = struct.unpack_from("<I", payload, offset)
        start, offset = offset + 4, offset + 4 + size
        if offset > limit:
            raise ImageRejectedError("its OpenEXR header is cut short")
        attributes[name] = payload[start:offset]


def _null_terminated(payload: bytes, offset: int, limit: int) -> tuple[str, int]:
    end = payload.find(b"\0", offset, limit)
    if end < 0:
        raise ImageRejectedError("its OpenEXR header never ends")
    return payload[offset:end].decode("latin-1"), end + 1
