"""Storage port — swappable backend interface."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class StorageBackend(Protocol):
    """Object storage contract used by upload, render, and file-access services."""

    def put_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None: ...

    def get_bytes(self, key: str, max_bytes: int | None = None) -> bytes:
        """The object's bytes. One over `max_bytes` raises StorageObjectTooLargeError unread."""
        ...

    def presign_put(
        self,
        key: str,
        content_type: str,
        expires_in: int = 900,
        *,
        content_length: int | None = None,
        content_disposition: str | None = None,
    ) -> str:
        """A signed PUT. Each header given is signed in, so the upload must send it as given."""
        ...

    def presign_get(self, key: str, expires_in: int = 900) -> str: ...

    def delete(self, key: str) -> None: ...

    def exists(self, key: str) -> bool: ...

    def size(self, key: str) -> int | None:
        """Bytes the object takes; None when there is no such object."""
        ...

    def stream(self, key: str) -> tuple[Any, str, str | None]: ...

    def local_file_if_exists(self, relative_path: str) -> Path | None: ...

    def copy_object(self, source_key: str, dest_key: str, *, dest_bucket: str | None = None) -> None: ...
