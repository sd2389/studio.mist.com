"""Model files for ingest tests: real GLBs, other formats renamed to .glb, and a GLB builder."""

import json
import struct
from pathlib import Path

from app.features.demo_embed.service import fixture_glb_path

REAL_GLB = fixture_glb_path().read_bytes()  # the demo ring: 2 meshes, 680 triangles, BIN chunk
REAL_GLB_TRIANGLES = 680
# The same ring after the browser's compression step (gltf-transform: meshopt, then Draco).
COMPRESSED_GLB = (Path(__file__).parent / "fixtures" / "demo-ring-draco-meshopt.glb").read_bytes()
TRUNCATED_GLB = REAL_GLB[: len(REAL_GLB) // 2]  # an upload cut short

# The first bytes of the formats the browser converts, saved under a .glb name.
RENAMED_FILES = {
    "step": b"ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ring'),'2;1');\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n",
    "3dm": b"3D Geometry File Format        8" + bytes(96),
    "obj": b"# ring\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
    "iges": b"ring" + b" " * 68 + b"S      1\n",
    "stl": b"solid ring\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nendloop\nendfacet\nendsolid ring\n",
    "fbx": b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", 7400) + bytes(64),
    "gltf-json": json.dumps({"asset": {"version": "2.0"}, "meshes": []}).encode(),
    "empty": b"",
    "magic-only": b"glTF",
}


def glb(doc: dict, *, bin_chunk: bytes = b"", version: int = 2) -> bytes:
    """A GLB with this JSON (and an optional BIN chunk), padded and sized as the spec says."""
    json_chunk = json.dumps(doc).encode()
    json_chunk += b" " * (-len(json_chunk) % 4)
    body = struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
    if bin_chunk:
        bin_chunk += b"\x00" * (-len(bin_chunk) % 4)
        body += struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk
    return struct.pack("<4sII", b"glTF", version, 12 + len(body)) + body


def mesh_doc(index_count: int, *, mode: int = 4, placements: int = 1, **node_fields) -> dict:
    """One indexed mesh (`index_count` indices, draw `mode`) placed by `placements` nodes."""
    return {
        "asset": {"version": "2.0"},
        "accessors": [
            {"count": 3, "componentType": 5126, "type": "VEC3"},
            {"count": index_count, "componentType": 5125, "type": "SCALAR"},
        ],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1, "mode": mode}]}],
        "nodes": [{"mesh": 0, **node_fields} for _ in range(placements)],
    }


def glb_with_triangles(triangles: int) -> bytes:
    """A GLB whose JSON draws this many triangles (one indexed triangle list)."""
    return glb(mesh_doc(3 * triangles))
