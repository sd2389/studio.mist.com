"""Generic S3-compatible storage (AWS S3 or legacy env vars)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException

from app.config import Settings, get_settings
from app.core.adapters.errors import StorageAdapterError
from app.core.cache_policy import cache_control_for_key
from app.core.s3_client import create_s3_client


class S3Backend:
    """Backward-compatible adapter using AWS_BUCKET / AWS_S3_ENDPOINT settings."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._bucket = self._settings.aws_bucket
        if not self._bucket:
            raise StorageAdapterError("AWS_BUCKET is not configured")
        self._client = create_s3_client()

    def put_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        params: dict[str, Any] = {
            "Bucket": self._bucket,
            "Key": key,
            "Body": data,
            "CacheControl": cache_control_for_key(key),
        }
        if content_type:
            params["ContentType"] = content_type
        try:
            self._client.put_object(**params)
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"S3 upload failed: {exc}") from exc

    def get_bytes(self, key: str) -> bytes:
        try:
            obj = self._client.get_object(Bucket=self._bucket, Key=key)
            stream = obj.get("Body")
            if stream is None:
                raise HTTPException(status_code=404, detail="Uploaded file not found")
            data = stream.read()
            if not data:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")
            return data
        except HTTPException:
            raise
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"Failed to read object: {exc}") from exc

    def presign_put(self, key: str, content_type: str, expires_in: int = 900) -> str:
        try:
            return self._client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": key,
                    "ContentType": content_type,
                    "CacheControl": cache_control_for_key(key),
                },
                ExpiresIn=expires_in,
            )
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"Presign failed: {exc}") from exc

    def presign_get(self, key: str, expires_in: int = 900) -> str:
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"Presign failed: {exc}") from exc

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:
            raise StorageAdapterError(f"Delete failed: {exc}", cause=exc) from exc

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False

    def stream(self, key: str) -> tuple[Any, str, str | None]:
        try:
            obj = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404", "NotFound"):
                raise HTTPException(status_code=404, detail="Not found") from exc
            raise HTTPException(status_code=502, detail=f"S3 read failed: {exc}") from exc
        except BotoCoreError as exc:
            raise HTTPException(status_code=502, detail=f"S3 error: {exc}") from exc
        body = obj["Body"]
        content_type = obj.get("ContentType") or "application/octet-stream"
        cache = obj.get("CacheControl") or cache_control_for_key(key)
        return body, content_type, cache

    def local_file_if_exists(self, relative_path: str) -> Path | None:
        return None

    def copy_object(self, source_key: str, dest_key: str, *, dest_bucket: str | None = None) -> None:
        bucket = dest_bucket or self._bucket
        try:
            self._client.copy_object(
                Bucket=bucket,
                Key=dest_key,
                CopySource={"Bucket": self._bucket, "Key": source_key},
                CacheControl=cache_control_for_key(dest_key),
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageAdapterError(f"Copy failed: {exc}", cause=exc) from exc
