"""Image files for upload tests: real PNG / JPEG / WebP from Pillow, and HDR / EXR headers."""

import io
import struct

from PIL import Image


def raster(kind: str, size: tuple[int, int] = (16, 8)) -> bytes:
    """A real image, encoded by Pillow (kind: PNG, JPEG or WEBP)."""
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 160, 40)).save(buf, format=kind)
    return buf.getvalue()


def radiance(width: int = 4, height: int = 2, *, header: bytes = b"FORMAT=32-bit_rle_rgbe\n\n") -> bytes:
    """A Radiance HDR file laid out like Poly Haven's: magic, FORMAT, blank line, size line,
    then flat RGBE pixels (scanlines under 8 px wide are stored uncompressed). The checks read
    headers only, so a file claiming more than 64 pixels carries just 64."""
    pixels = b"\x80\x80\x80\x81" * min(width * height, 64)
    return b"#?RADIANCE\n" + header + f"-Y {height} +X {width}\n".encode() + pixels


def openexr(width: int = 4, height: int = 2, *, compression: int = 3, flags: int = 0) -> bytes:
    """An OpenEXR header (single part, scanline) followed by a stand-in for its offsets and data."""

    def attribute(name: str, kind: str, value: bytes) -> bytes:
        return name.encode() + b"\0" + kind.encode() + b"\0" + struct.pack("<I", len(value)) + value

    channels = b"".join(name + b"\0" + struct.pack("<iBxxxii", 1, 0, 1, 1) for name in (b"B", b"G", b"R")) + b"\0"
    window = struct.pack("<4i", 0, 0, width - 1, height - 1)
    header = b"".join(
        [
            attribute("channels", "chlist", channels),
            attribute("compression", "compression", bytes([compression])),
            attribute("dataWindow", "box2i", window),
            attribute("displayWindow", "box2i", window),
            attribute("lineOrder", "lineOrder", b"\0"),
            attribute("pixelAspectRatio", "float", struct.pack("<f", 1.0)),
            attribute("screenWindowCenter", "v2f", struct.pack("<2f", 0, 0)),
            attribute("screenWindowWidth", "float", struct.pack("<f", 1.0)),
        ]
    )
    return b"\x76\x2f\x31\x01" + bytes([2, flags, 0, 0]) + header + b"\0" + bytes(64)
