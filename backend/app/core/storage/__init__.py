"""Storage factory and thin delegating wrappers (preserves caller imports)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import Settings, get_settings
from app.core.observability import get_logger, log_event
from app.core.storage.base import StorageBackend
from app.core.storage.local import LocalBackend
from app.core.storage.r2 import R2Backend
from app.core.storage.s3 import S3Backend


_logger = get_logger("studio.storage")


def _build_backend(settings: Settings) -> StorageBackend:
    backend = (settings.storage_backend or "auto").lower()
    if backend == "local":
        return LocalBackend(settings.upload_dir)
    if backend == "r2":
        return R2Backend(settings)
    if backend == "s3":
        return S3Backend(settings)
    if settings.r2_bucket_name and settings.r2_access_key_id and settings.r2_secret_access_key:
        return R2Backend(settings)
    if settings.aws_bucket:
        return S3Backend(settings)
    return LocalBackend(settings.upload_dir)


@lru_cache
def get_storage() -> StorageBackend:
    return _build_backend(get_settings())


def get_public_storage() -> R2Backend | None:
    """Return R2 backend when public bucket publishing is available."""
    settings = get_settings()
    backend = (settings.storage_backend or "auto").lower()
    if backend in ("local", "s3"):
        return None
    if backend == "r2" or (
        backend == "auto"
        and settings.r2_bucket_name
        and settings.r2_access_key_id
        and settings.r2_secret_access_key
    ):
        try:
            r2_backend = R2Backend(settings)
            if r2_backend.public_bucket:
                return r2_backend
        except Exception:
            return None
    return None


def read_bytes(key: str, max_bytes: int | None = None) -> bytes:
    """The object's bytes; one over `max_bytes` raises StorageObjectTooLargeError unread."""
    return get_storage().get_bytes(key, max_bytes=max_bytes)


def write_bytes(key: str, data: bytes, content_type: str | None = None) -> None:
    get_storage().put_bytes(key, data, content_type=content_type)


def delete(key: str) -> None:
    get_storage().delete(key)


def object_size(key: str) -> int | None:
    """Bytes the object takes; None when there is no such object."""
    return get_storage().size(key)


def delete_quietly(key: str) -> None:
    """Remove an object nobody will keep, such as a refused or unsaved upload. A failure is
    logged, never raised over the error that led here."""
    try:
        delete(key)
    except Exception as exc:  # noqa: BLE001 - cleanup must not mask the original error
        log_event(_logger, "storage.cleanup_failed", key=key, error=str(exc))


def presign_put(key: str, content_type: str, expires_in: int = 900) -> str:
    return get_storage().presign_put(key, content_type, expires_in=expires_in)


def presign_get(key: str, expires_in: int = 900) -> str:
    return get_storage().presign_get(key, expires_in=expires_in)


def local_file_if_exists(relative_path: str) -> Path | None:
    return get_storage().local_file_if_exists(relative_path)


def get_s3_object_stream(key: str) -> tuple[Any, str, str | None]:
    return get_storage().stream(key)


def copy_to_public(source_key: str, dest_key: str) -> None:
    backend = get_public_storage()
    if backend is None:
        raise RuntimeError("Public bucket publishing is not configured")
    backend.copy_object(source_key, dest_key)


__all__ = [
    "StorageBackend",
    "copy_to_public",
    "delete",
    "delete_quietly",
    "get_public_storage",
    "get_s3_object_stream",
    "get_storage",
    "local_file_if_exists",
    "object_size",
    "presign_get",
    "presign_put",
    "read_bytes",
    "write_bytes",
]
