"""Shared boto3 S3 client (AWS S3 or S3-compatible stores such as Cloudflare R2)."""

from __future__ import annotations

from typing import Any

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from fastapi import HTTPException

from app.config import get_settings
from app.core.adapters.errors import StorageObjectTooLargeError


def create_s3_client() -> BaseClient:
    settings = get_settings()
    kwargs: dict[str, object] = {"region_name": settings.aws_region or "us-east-1"}
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    if settings.s3_force_path_style:
        kwargs["config"] = Config(s3={"addressing_style": "path"})
    return boto3.client("s3", **kwargs)


def read_object_body(response: dict[str, Any], key: str, max_bytes: int | None = None) -> bytes:
    """The bytes of a GetObject response. One over `max_bytes` is refused before it is read,
    so an oversized upload never lands in memory."""
    stream = response.get("Body")
    if stream is None:
        raise HTTPException(status_code=404, detail="Uploaded file not found")
    if max_bytes is not None and int(response.get("ContentLength") or 0) > max_bytes:
        stream.close()
        raise StorageObjectTooLargeError(f"{key} is larger than {max_bytes} bytes")
    data = stream.read() if max_bytes is None else stream.read(max_bytes + 1)
    if max_bytes is not None and len(data) > max_bytes:
        stream.close()
        raise StorageObjectTooLargeError(f"{key} is larger than {max_bytes} bytes")
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return data
