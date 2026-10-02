import io
import tempfile
from pathlib import Path

import pytest

from app.core.adapters.errors import StorageObjectTooLargeError
from app.core.s3_client import read_object_body
from app.core.storage.local import LocalBackend


def test_local_backend_roundtrip():
    with tempfile.TemporaryDirectory() as tmp:
        backend = LocalBackend(Path(tmp))
        backend.put_bytes("customers/1/models/test.glb", b"glb-bytes", content_type="model/gltf-binary")
        assert backend.exists("customers/1/models/test.glb")
        assert backend.get_bytes("customers/1/models/test.glb") == b"glb-bytes"
        backend.delete("customers/1/models/test.glb")
        assert not backend.exists("customers/1/models/test.glb")


def test_local_backend_refuses_an_object_over_the_read_cap(tmp_path):
    backend = LocalBackend(tmp_path)
    backend.put_bytes("customers/1/models/big.glb", b"x" * 10)
    assert backend.get_bytes("customers/1/models/big.glb", max_bytes=10) == b"x" * 10
    with pytest.raises(StorageObjectTooLargeError):
        backend.get_bytes("customers/1/models/big.glb", max_bytes=9)


class _Body(io.BytesIO):
    """A GetObject body that records how much was read from it."""

    def __init__(self, data: bytes) -> None:
        super().__init__(data)
        self.read_sizes: list[int | None] = []

    def read(self, size: int | None = None) -> bytes:
        self.read_sizes.append(size)
        return super().read(-1 if size is None else size)


def test_s3_read_refuses_by_content_length_without_reading():
    body = _Body(b"x" * 100)
    with pytest.raises(StorageObjectTooLargeError):
        read_object_body({"Body": body, "ContentLength": 100}, "k", max_bytes=99)
    assert body.read_sizes == []
    assert body.closed


def test_s3_read_caps_what_it_reads_when_the_length_is_missing():
    body = _Body(b"x" * 100)
    with pytest.raises(StorageObjectTooLargeError):
        read_object_body({"Body": body}, "k", max_bytes=10)
    assert body.read_sizes == [11]


def test_s3_read_returns_the_bytes_within_the_cap():
    assert read_object_body({"Body": _Body(b"glb"), "ContentLength": 3}, "k", max_bytes=3) == b"glb"
    assert read_object_body({"Body": _Body(b"glb")}, "k") == b"glb"
