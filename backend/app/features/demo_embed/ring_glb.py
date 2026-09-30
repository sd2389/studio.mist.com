"""Write a tiny two-slot jewelry GLB (Metal 1 band + Gem 1 stone)."""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path


def write_demo_ring_glb(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(build_demo_ring_glb())
    return dest


def build_demo_ring_glb() -> bytes:
    metal_pos, metal_idx = _torus(major=0.72, minor=0.16, radial=28, tubular=12)
    gem_pos, gem_idx = _octahedron(radius=0.22, center=(0.0, 0.62, 0.0))

    bin_parts: list[bytes] = []
    accessors: list[dict] = []
    buffer_views: list[dict] = []
    offset = 0

    def add_mesh(positions: list[float], indices: list[int], name: str) -> tuple[int, int, str]:
        nonlocal offset
        pos_bytes = _pack_f32(positions)
        idx_bytes = _pack_u16(indices)
        pos_bytes = _pad4(pos_bytes)
        idx_bytes = _pad4(idx_bytes)

        buffer_views.append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(pos_bytes), "target": 34962}
        )
        pos_view = len(buffer_views) - 1
        offset += len(pos_bytes)
        buffer_views.append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(idx_bytes), "target": 34963}
        )
        idx_view = len(buffer_views) - 1
        offset += len(idx_bytes)

        xs = positions[0::3]
        ys = positions[1::3]
        zs = positions[2::3]
        accessors.append(
            {
                "bufferView": pos_view,
                "componentType": 5126,
                "count": len(positions) // 3,
                "type": "VEC3",
                "max": [max(xs), max(ys), max(zs)],
                "min": [min(xs), min(ys), min(zs)],
            }
        )
        pos_acc = len(accessors) - 1
        accessors.append(
            {
                "bufferView": idx_view,
                "componentType": 5123,
                "count": len(indices),
                "type": "SCALAR",
            }
        )
        idx_acc = len(accessors) - 1
        bin_parts.append(pos_bytes)
        bin_parts.append(idx_bytes)
        return pos_acc, idx_acc, name

    metal_pos_acc, metal_idx_acc, _ = add_mesh(metal_pos, metal_idx, "Metal 1")
    gem_pos_acc, gem_idx_acc, _ = add_mesh(gem_pos, gem_idx, "Gem 1")

    blob = b"".join(bin_parts)
    gltf = {
        "asset": {"version": "2.0", "generator": "studio-demo-embed"},
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "materials": [
            {"name": "Metal 1", "pbrMetallicRoughness": {"baseColorFactor": [0.93, 0.81, 0.60, 1], "metallicFactor": 1, "roughnessFactor": 0.2}},
            {"name": "Gem 1", "pbrMetallicRoughness": {"baseColorFactor": [0.92, 0.94, 0.98, 1], "metallicFactor": 0, "roughnessFactor": 0.05}},
        ],
        "meshes": [
            {
                "name": "Metal 1",
                "primitives": [{"attributes": {"POSITION": metal_pos_acc}, "indices": metal_idx_acc, "material": 0}],
            },
            {
                "name": "Gem 1",
                "primitives": [{"attributes": {"POSITION": gem_pos_acc}, "indices": gem_idx_acc, "material": 1}],
            },
        ],
        "nodes": [
            {"name": "Metal 1", "mesh": 0},
            {"name": "Gem 1", "mesh": 1},
        ],
        "scenes": [{"name": "DemoRing", "nodes": [0, 1]}],
        "scene": 0,
    }
    return _pack_glb(gltf, blob)


def _torus(major: float, minor: float, radial: int, tubular: int) -> tuple[list[float], list[int]]:
    positions: list[float] = []
    for i in range(radial):
        u = (i / radial) * math.tau
        for j in range(tubular):
            v = (j / tubular) * math.tau
            x = (major + minor * math.cos(v)) * math.cos(u)
            y = minor * math.sin(v)
            z = (major + minor * math.cos(v)) * math.sin(u)
            positions.extend((x, y, z))
    indices: list[int] = []
    for i in range(radial):
        for j in range(tubular):
            a = i * tubular + j
            b = ((i + 1) % radial) * tubular + j
            c = ((i + 1) % radial) * tubular + (j + 1) % tubular
            d = i * tubular + (j + 1) % tubular
            indices.extend((a, b, d, b, c, d))
    return positions, indices


def _octahedron(radius: float, center: tuple[float, float, float]) -> tuple[list[float], list[int]]:
    cx, cy, cz = center
    verts = [
        (cx, cy + radius, cz),
        (cx, cy - radius, cz),
        (cx + radius, cy, cz),
        (cx - radius, cy, cz),
        (cx, cy, cz + radius),
        (cx, cy, cz - radius),
    ]
    positions = [c for v in verts for c in v]
    faces = [
        (0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2),
        (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5),
    ]
    indices = [i for face in faces for i in face]
    return positions, indices


def _pack_f32(values: list[float]) -> bytes:
    return struct.pack(f"<{len(values)}f", *values)


def _pack_u16(values: list[int]) -> bytes:
    return struct.pack(f"<{len(values)}H", *values)


def _pad4(data: bytes, pad: bytes = b"\x00") -> bytes:
    extra = (-len(data)) % 4
    return data + pad * extra


def _pack_glb(gltf: dict, blob: bytes) -> bytes:
    json_bytes = _pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    blob = _pad4(blob)
    total = 12 + 8 + len(json_bytes) + 8 + len(blob)
    header = struct.pack("<4sII", b"glTF", 2, total)
    json_chunk = struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
    bin_chunk = struct.pack("<I4s", len(blob), b"BIN\x00") + blob
    return header + json_chunk + bin_chunk


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[3] / "scripts" / "fixtures" / "demo-embed-ring.glb"
    write_demo_ring_glb(out)
    print(f"{out} {out.stat().st_size} bytes")
