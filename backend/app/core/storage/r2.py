"""Cloudflare R2 (S3-compatible) storage adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException

from app.config import Settings, get_settings
from app.core.adapters.errors import StorageAdapterError
from app.core.cache_policy import cache_control_for_key


def _r2_client(settings: Settings) -> BaseClient:
    if not settings.r2_account_id or not settings.r2_access_key_id or not settings.r2_secret_access_key:
        raise StorageAdapterError("R2 credentials are not configured")
    endpoint = settings.r2_endpoint_url or (
        f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    )
    config = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"} if settings.r2_force_path_style else {},
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.r2_region or "auto",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=config,
    )


class R2Backend:
    """Private + public bucket operations against Cloudflare R2."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client = _r2_client(self._settings)
        self._private_bucket = self._settings.r2_bucket_name or self._settings.aws_bucket
        if not self._private_bucket:
            raise StorageAdapterError("R2 private bucket is not configured (R2_BUCKET_NAME)")

    @property
    def public_bucket(self) -> str | None:
        return self._settings.r2_public_bucket_name

    def put_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        self._put(self._private_bucket, key, data, content_type)

    def get_bytes(self, key: str) -> bytes:
        try:
            obj = self._client.get_object(Bucket=self._private_bucket, Key=key)
            stream = obj.get("Body")
            if stream is None:
                raise HTTPException(status_code=404, detail="Uploaded file not found")
            data = stream.read()
            if not data:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")
            return data
        except HTTPException:
            raise
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in ("NoSuchKey", "404", "NotFound"):
                raise HTTPException(status_code=404, detail="Uploaded file not found") from exc
            raise HTTPException(status_code=502, detail=f"Failed to read object: {exc}") from exc
        except BotoCoreError as exc:
            raise HTTPException(status_code=502, detail=f"Failed to read object: {exc}") from exc

    def presign_put(self, key: str, content_type: str, expires_in: int = 900) -> str:
        try:
            return self._client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self._private_bucket,
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
                Params={"Bucket": self._private_bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"Presign failed: {exc}") from exc

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._private_bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:
            raise StorageAdapterError(f"Delete failed: {exc}", cause=exc) from exc

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._private_bucket, Key=key)
            return True
        except ClientError:
            return False

    def stream(self, key: str) -> tuple[Any, str, str | None]:
        try:
            obj = self._client.get_object(Bucket=self._private_bucket, Key=key)
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
        bucket = dest_bucket or self.public_bucket
        if not bucket:
            raise StorageAdapterError("R2 public bucket is not configured (R2_PUBLIC_BUCKET_NAME)")
        try:
            self._client.copy_object(
                Bucket=bucket,
                Key=dest_key,
                CopySource={"Bucket": self._private_bucket, "Key": source_key},
                CacheControl=cache_control_for_key(dest_key),
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageAdapterError(f"Copy to public bucket failed: {exc}", cause=exc) from exc

    def put_public_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        bucket = self.public_bucket
        if not bucket:
            raise StorageAdapterError("R2 public bucket is not configured (R2_PUBLIC_BUCKET_NAME)")
        self._put(bucket, key, data, content_type)

    def _put(self, bucket: str, key: str, data: bytes, content_type: str | None) -> None:
        params: dict[str, Any] = {
            "Bucket": bucket,
            "Key": key,
            "Body": data,
            "CacheControl": cache_control_for_key(key),
        }
        if content_type:
            params["ContentType"] = content_type
        try:
            self._client.put_object(**params)
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail=f"Upload failed: {exc}") from exc
