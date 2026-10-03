"""Binary glTF checks: only real GLB 2.0 passes, and triangles are counted as a viewer draws them."""

import struct

import pytest
from model_samples import COMPRESSED_GLB, REAL_GLB, REAL_GLB_TRIANGLES, RENAMED_FILES, glb, mesh_doc

from app.services.glb import BrokenGlbError, NotGlbError, count_glb_triangles, read_glb_json


def test_a_real_glb_is_read_and_counted():
    assert read_glb_json(REAL_GLB)["asset"]["version"] == "2.0"
    assert count_glb_triangles(REAL_GLB) == REAL_GLB_TRIANGLES


def test_a_draco_and_meshopt_compressed_glb_is_read_and_counted():
    assert "KHR_draco_mesh_compression" in read_glb_json(COMPRESSED_GLB)["extensionsRequired"]
    assert count_glb_triangles(COMPRESSED_GLB) == REAL_GLB_TRIANGLES


@pytest.mark.parametrize("kind", sorted(RENAMED_FILES))
def test_other_formats_renamed_to_glb_are_not_glb(kind):
    with pytest.raises(NotGlbError):
        read_glb_json(RENAMED_FILES[kind])


def test_binary_gltf_version_1_is_not_glb_2():
    with pytest.raises(NotGlbError):
        read_glb_json(glb({"asset": {"version": "1.0"}}, version=1))


@pytest.mark.parametrize(
    "payload",
    [
        REAL_GLB[: len(REAL_GLB) // 2],  # an upload cut short
        REAL_GLB[:12],  # the header alone
        REAL_GLB + RENAMED_FILES["step"],  # another file riding behind a GLB
    ],
    ids=["truncated", "header-only", "trailing-bytes"],
)
def test_a_glb_whose_size_disagrees_with_its_header_is_broken(payload):
    with pytest.raises(BrokenGlbError, match="header gives"):
        read_glb_json(payload)


def test_a_chunk_running_past_the_end_is_broken():
    payload = bytearray(REAL_GLB)
    struct.pack_into("<I", payload, 12, len(REAL_GLB))  # JSON chunk length past the end
    with pytest.raises(BrokenGlbError, match="past the end"):
        read_glb_json(bytes(payload))


def test_a_file_ending_inside_a_chunk_header_is_broken():
    payload = REAL_GLB + b"\x00" * 4
    payload = payload[:8] + struct.pack("<I", len(payload)) + payload[12:]
    with pytest.raises(BrokenGlbError, match="inside a chunk header"):
        read_glb_json(payload)


def test_the_first_chunk_must_be_json():
    payload = bytearray(REAL_GLB)
    struct.pack_into("<I", payload, 16, 0x004E4942)  # first chunk claims to be BIN
    with pytest.raises(BrokenGlbError, match="first chunk is not JSON"):
        read_glb_json(bytes(payload))


@pytest.mark.parametrize(
    "json_chunk",
    [b"{not json}", b"[1, 2, 3]", b"[" * 100_000 + b"]" * 100_000, b"\xff\xfe{}  "],
    ids=["invalid", "not-an-object", "nested-too-deep", "not-utf8"],
)
def test_an_unreadable_json_chunk_is_broken(json_chunk):
    json_chunk += b" " * (-len(json_chunk) % 4)
    body = struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
    with pytest.raises(BrokenGlbError, match="JSON chunk"):
        read_glb_json(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


@pytest.mark.parametrize("asset", [None, {}, {"version": "1.0"}, {"version": 2}])
def test_the_json_must_declare_gltf_2(asset):
    doc = {"meshes": []} if asset is None else {"asset": asset}
    with pytest.raises(BrokenGlbError, match="glTF 2.0"):
        read_glb_json(glb(doc))


def test_triangles_follow_draw_mode_and_placements():
    assert count_glb_triangles(glb(mesh_doc(300))) == 100
    assert count_glb_triangles(glb(mesh_doc(300, placements=3))) == 300
    assert count_glb_triangles(glb(mesh_doc(300, mode=5))) == 298  # strip
    assert count_glb_triangles(glb(mesh_doc(300, mode=6))) == 298  # fan
    assert count_glb_triangles(glb(mesh_doc(300, mode=1))) == 0  # lines
    assert count_glb_triangles(glb(mesh_doc(300, mode=0))) == 0  # points


def test_a_non_indexed_primitive_counts_its_positions():
    doc = mesh_doc(3)
    del doc["meshes"][0]["primitives"][0]["indices"]
    doc["accessors"][0]["count"] = 9
    assert count_glb_triangles(glb(doc)) == 3


def test_meshes_no_node_places_do_not_count_once_one_is_placed():
    doc = mesh_doc(300)
    doc["meshes"].append({"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]})
    assert count_glb_triangles(glb(doc)) == 100
    doc["nodes"] = []
    assert count_glb_triangles(glb(doc)) == 200


def test_gpu_instancing_multiplies_the_mesh():
    doc = mesh_doc(300, extensions={"EXT_mesh_gpu_instancing": {"attributes": {"TRANSLATION": 2}}})
    doc["accessors"].append({"count": 1_000, "componentType": 5126, "type": "VEC3"})
    assert count_glb_triangles(glb(doc)) == 100_000


@pytest.mark.parametrize(
    "spoil",
    [
        lambda doc: doc["meshes"][0]["primitives"][0].update(indices=1.0),
        lambda doc: doc["meshes"][0]["primitives"][0].update(indices="1"),
        lambda doc: doc["meshes"][0]["primitives"][0].update(indices=True),
        lambda doc: doc["meshes"][0]["primitives"][0].update(indices=7),
        lambda doc: doc["meshes"][0]["primitives"][0].update(mode="4"),
        lambda doc: doc["accessors"][1].update(count=300.0),
        lambda doc: doc["accessors"][1].update(count="300"),
        lambda doc: doc["accessors"][1].update(count=-3),
        lambda doc: doc["nodes"].append({"mesh": 0.0}),
        lambda doc: doc["nodes"].append("node"),
        lambda doc: doc["meshes"][0].update(primitives={"attributes": {}}),
        lambda doc: doc.update(meshes={"0": {}}),
    ],
    ids=[
        "float-index",
        "string-index",
        "bool-index",
        "index-out-of-range",
        "string-mode",
        "float-count",
        "string-count",
        "negative-count",
        "float-node-mesh",
        "node-not-object",
        "primitives-not-list",
        "meshes-not-list",
    ],
)
def test_references_a_viewer_could_still_follow_are_refused_not_skipped(spoil):
    """A lenient count that skipped these would undercount what three.js draws."""
    doc = mesh_doc(300)
    spoil(doc)
    with pytest.raises(BrokenGlbError):
        count_glb_triangles(glb(doc))
