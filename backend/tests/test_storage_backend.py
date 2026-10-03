import io
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError
from fastapi import HTTPException

from app.core.adapters.errors import StorageObjectTooLargeError
from app.core.s3_client import read_object_body
from app.core.storage.local import LocalBackend
from app.core.storage.r2 import R2Backend
from app.core.storage.s3 import S3Backend


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


@pytest.mark.parametrize("key", ["../outside.glb", "models/../../outside.glb", "/tmp/outside.glb", ""])
def test_local_backend_refuses_keys_outside_its_root(tmp_path, key):
    backend = LocalBackend(root=tmp_path / "uploads")

    with pytest.raises(HTTPException) as exc:
        backend.put_bytes(key, b"glTF")

    assert exc.value.status_code == 400
    assert not (tmp_path / "outside.glb").exists()


def test_local_backend_reports_an_objects_size(tmp_path):
    backend = LocalBackend(tmp_path)
    backend.put_bytes("customers/1/models/ring.glb", b"x" * 42)
    assert backend.size("customers/1/models/ring.glb") == 42
    assert backend.size("customers/1/models/missing.glb") is None


class _HeadClient:
    """Answers HEAD and DELETE for the objects it holds, by (bucket, key)."""

    def __init__(self, objects: dict[tuple[str, str], bytes]) -> None:
        self.objects = objects
        self.deleted: list[tuple[str, str]] = []

    def head_object(self, Bucket: str, Key: str) -> dict:
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return {"ContentLength": len(self.objects[(Bucket, Key)])}

    def delete_object(self, Bucket: str, Key: str) -> None:
        self.deleted.append((Bucket, Key))


def _r2(client: _HeadClient) -> R2Backend:
    backend = object.__new__(R2Backend)
    backend._client = client
    backend._private_bucket = "private"
    backend._settings = SimpleNamespace(r2_public_bucket_name="public")
    return backend


def test_cloud_backends_report_sizes_from_head_requests():
    client = _HeadClient({("bucket", "a.glb"): b"x" * 7, ("private", "a.glb"): b"x" * 9})
    s3 = object.__new__(S3Backend)
    s3._client, s3._bucket = client, "bucket"

    assert (s3.size("a.glb"), s3.size("b.glb")) == (7, None)
    assert (_r2(client).size("a.glb"), _r2(client).size("b.glb")) == (9, None)


def test_r2_checks_and_deletes_published_copies_in_the_public_bucket():
    client = _HeadClient({("public", "published/1/R-1/model.glb"): b"glb"})
    backend = _r2(client)

    assert backend.public_exists("published/1/R-1/model.glb")
    assert not backend.exists("published/1/R-1/model.glb")  # the private bucket holds no copy
    backend.delete_public("published/1/R-1/model.glb")
    assert client.deleted == [("public", "published/1/R-1/model.glb")]
