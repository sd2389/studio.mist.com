import tempfile
from pathlib import Path

from app.core.storage.local import LocalBackend


def test_local_backend_roundtrip():
    with tempfile.TemporaryDirectory() as tmp:
        backend = LocalBackend(Path(tmp))
        backend.put_bytes("customers/1/models/test.glb", b"glb-bytes", content_type="model/gltf-binary")
        assert backend.exists("customers/1/models/test.glb")
        assert backend.get_bytes("customers/1/models/test.glb") == b"glb-bytes"
        backend.delete("customers/1/models/test.glb")
        assert not backend.exists("customers/1/models/test.glb")
