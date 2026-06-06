"""Filesystem storage adapter for local development."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.config import get_settings
from app.core.adapters.errors import StorageAdapterError
from app.core.cache_policy import cache_control_for_key


class LocalBackend:
    def __init__(self, root: Path | None = None) -> None:
        self._root = root or get_settings().upload_dir

    def _path(self, key: str) -> Path:
        return self._root / key

    def put_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        dest = self._path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    def get_bytes(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Uploaded file not found")
        data = path.read_bytes()
        if not data:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        return data

    def presign_put(self, key: str, content_type: str, expires_in: int = 900) -> str:
        raise HTTPException(
            status_code=503,
            detail="Presigned uploads require cloud storage (STORAGE_BACKEND=r2)",
        )

    def presign_get(self, key: str, expires_in: int = 900) -> str:
        raise HTTPException(
            status_code=503,
            detail="Presigned downloads require cloud storage (STORAGE_BACKEND=r2)",
        )

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def stream(self, key: str) -> tuple[Any, str, str | None]:
        path = self._path(key)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Not found")

        class _FileStream:
            def __init__(self, file_path: Path) -> None:
                self._file = file_path.open("rb")

            def read(self, amt: int | None = None) -> bytes:
                return self._file.read(amt) if amt is not None else self._file.read()

            def close(self) -> None:
                self._file.close()

        return _FileStream(path), "application/octet-stream", cache_control_for_key(key)

    def local_file_if_exists(self, relative_path: str) -> Path | None:
        candidate = self._path(relative_path)
        return candidate if candidate.is_file() else None

    def copy_object(self, source_key: str, dest_key: str, *, dest_bucket: str | None = None) -> None:
        src = self._path(source_key)
        if not src.is_file():
            raise StorageAdapterError(f"Source object not found: {source_key}")
        dest = self._path(dest_key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(src.read_bytes())
