"""Serve uploaded files from disk or cloud storage with tenant isolation."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse

from app.core import storage
from app.core import storage_keys as keys
from app.core.cache_policy import cache_control_for_key
from app.models.user import User


def reject_path_traversal(path: str) -> None:
    if ".." in path or path.startswith("/") or not path.strip():
        raise HTTPException(status_code=400, detail="Invalid path")


def _assert_private_access(full_path: str, user: User | None) -> None:
    if keys.is_public_published_key(full_path):
        return
    if keys.is_customer_private_key(full_path):
        if user is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        if not keys.key_belongs_to_user(full_path, user.id):
            raise HTTPException(status_code=404, detail="Not found")
        return
    if keys.is_legacy_upload_key(full_path):
        return
    if full_path.startswith("catalog/"):
        return


def open_uploaded_file(
    full_path: str,
    *,
    user: User | None = None,
) -> FileResponse | StreamingResponse | RedirectResponse:
    reject_path_traversal(full_path)
    _assert_private_access(full_path, user)
    cache_control = cache_control_for_key(full_path)

    if keys.is_public_published_key(full_path):
        from app.config import get_settings

        settings = get_settings()
        if settings.r2_public_base_url:
            from app.core.public_urls import public_file_url

            url = public_file_url(full_path)
            if url:
                return RedirectResponse(url=url, status_code=302)

    local = storage.local_file_if_exists(full_path)
    if local is not None:
        return FileResponse(local, headers={"Cache-Control": cache_control})

    if keys.is_customer_private_key(full_path) and user is not None:
        url = storage.presign_get(full_path, expires_in=300)
        return RedirectResponse(url=url, status_code=302)

    body, content_type, s3_cache = storage.get_s3_object_stream(full_path)
    return StreamingResponse(
        body,
        media_type=content_type,
        headers={"Cache-Control": s3_cache or cache_control},
    )
