"""Binary glTF (GLB) checks for stored models: the container, and the triangles it draws.

A model is judged by its bytes, never its file name: a 12-byte header (magic "glTF",
version 2, total length), then chunks, the first of them JSON. Triangles are counted from
that JSON the way a viewer draws them.
"""

from __future__ import annotations

import json
import struct

_HEADER = struct.Struct("<4sII")  # magic, version, total length in bytes
_CHUNK_HEADER = struct.Struct("<II")  # chunk length, chunk type
_GLB_MAGIC = b"glTF"
_JSON_CHUNK = 0x4E4F534A  # "JSON", little-endian


class NotGlbError(ValueError):
    """The bytes are not binary glTF 2.0: another format, glTF JSON, or a renamed file."""


class BrokenGlbError(ValueError):
    """The bytes start like a GLB but are cut short or malformed."""


def read_glb_json(payload: bytes) -> dict:
    """The JSON document of a binary glTF 2.0 file, once its header and chunks check out."""
    if len(payload) < _HEADER.size or not payload.startswith(_GLB_MAGIC):
        raise NotGlbError("not a binary glTF file")
    _magic, version, length = _HEADER.unpack_from(payload)
    if version != 2:
        raise NotGlbError(f"binary glTF version {version}, not 2")
    if length != len(payload):
        raise BrokenGlbError(f"its header gives {length:,} bytes but the file has {len(payload):,}")
    doc = _first_chunk_json(payload)
    asset = doc.get("asset")
    asset_version = asset.get("version") if isinstance(asset, dict) else None
    if not isinstance(asset_version, str) or asset_version.split(".")[0] != "2":
        raise BrokenGlbError("its JSON does not declare glTF 2.0")
    return doc


def count_glb_triangles(payload: bytes) -> int:
    """Triangles a GLB draws: each mesh once per node that places it, times the node's GPU
    instances (meshes no node places count once). Points and lines draw none.

    Raises NotGlbError or BrokenGlbError for bytes that are not a GLB, and for any index or
    count the tally follows that is not a whole number in range: a viewer may still draw what
    a lenient count would skip. Accessor counts sit in the JSON even for Draco or meshopt
    compressed buffers; a Draco stream is trusted to decode to what its accessors declare.
    """
    doc = read_glb_json(payload)
    accessors = _array(doc, "accessors")
    meshes = _array(doc, "meshes")
    per_mesh = [_mesh_triangles(mesh, accessors) for mesh in meshes]
    nodes = [_object(node, "node") for node in _array(doc, "nodes")]
    placed = [
        per_mesh[_index(node["mesh"], meshes, "mesh")] * _instances(node, accessors)
        for node in nodes
        if "mesh" in node
    ]
    return sum(placed) if placed else sum(per_mesh)


def _first_chunk_json(payload: bytes) -> dict:
    """The first chunk, parsed as JSON. Every chunk must fit, and the last must end the file."""
    doc: dict | None = None
    offset = _HEADER.size
    while offset < len(payload):
        if offset + _CHUNK_HEADER.size > len(payload):
            raise BrokenGlbError("it ends inside a chunk header")
        chunk_length, chunk_type = _CHUNK_HEADER.unpack_from(payload, offset)
        start = offset + _CHUNK_HEADER.size
        offset = start + chunk_length
        if offset > len(payload):
            raise BrokenGlbError("a chunk runs past the end of the file")
        if doc is None:
            if chunk_type != _JSON_CHUNK:
                raise BrokenGlbError("its first chunk is not JSON")
            doc = _parse_json_chunk(payload[start:offset])
    if doc is None:
        raise BrokenGlbError("it has no JSON chunk")
    return doc


def _parse_json_chunk(chunk: bytes) -> dict:
    try:
        doc = json.loads(chunk.rstrip(b" \x00").decode("utf-8"))
    except (UnicodeDecodeError, ValueError, RecursionError) as exc:
        raise BrokenGlbError("its JSON chunk is not valid JSON") from exc
    if not isinstance(doc, dict):
        raise BrokenGlbError("its JSON chunk is not an object")
    return doc


def _mesh_triangles(mesh: object, accessors: list) -> int:
    primitives = _object(mesh, "mesh").get("primitives")
    if not isinstance(primitives, list):
        raise BrokenGlbError("a mesh has no list of primitives")
    return sum(_primitive_triangles(primitive, accessors) for primitive in primitives)


def _primitive_triangles(primitive: object, accessors: list) -> int:
    primitive = _object(primitive, "mesh primitive")
    mode = primitive.get("mode", 4)
    if not _is_whole(mode) or not 0 <= mode <= 6:
        raise BrokenGlbError(f"a primitive has draw mode {mode!r}")
    if mode < 4:  # points and lines
        return 0
    if "indices" in primitive:
        count = _accessor_count(primitive["indices"], accessors)
    else:
        attributes = _object(primitive.get("attributes"), "primitive's attributes")
        if "POSITION" not in attributes:
            raise BrokenGlbError("a primitive has no POSITION attribute")
        count = _accessor_count(attributes["POSITION"], accessors)
    return count // 3 if mode == 4 else max(count - 2, 0)  # list, or strip / fan


def _instances(node: dict, accessors: list) -> int:
    """Copies of its mesh a node draws: its EXT_mesh_gpu_instancing count, else 1."""
    extensions = node.get("extensions")
    instancing = extensions.get("EXT_mesh_gpu_instancing") if isinstance(extensions, dict) else None
    if instancing is None:
        return 1
    attributes = _object(_object(instancing, "instancing").get("attributes"), "instancing attributes")
    return max((_accessor_count(index, accessors) for index in attributes.values()), default=1)


def _accessor_count(index: object, accessors: list) -> int:
    accessor = _object(accessors[_index(index, accessors, "accessor")], "accessor")
    count = accessor.get("count")
    if not _is_whole(count) or count < 1:
        raise BrokenGlbError("an accessor has no valid count")
    return count


def _index(value: object, items: list, kind: str) -> int:
    if not _is_whole(value) or not 0 <= value < len(items):
        raise BrokenGlbError(f"a {kind} index points nowhere")
    return value


def _array(doc: dict, name: str) -> list:
    value = doc.get(name, [])
    if not isinstance(value, list):
        raise BrokenGlbError(f"its {name} are not a list")
    return value


def _object(value: object, kind: str) -> dict:
    if not isinstance(value, dict):
        raise BrokenGlbError(f"a {kind} is not an object")
    return value


def _is_whole(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)
