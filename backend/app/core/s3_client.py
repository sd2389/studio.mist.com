"""Shared boto3 S3 client (AWS S3 or S3-compatible stores such as Cloudflare R2)."""

from __future__ import annotations

import boto3
from botocore.client import BaseClient
from botocore.config import Config

from app.config import get_settings


def create_s3_client() -> BaseClient:
    settings = get_settings()
    kwargs: dict[str, object] = {"region_name": settings.aws_region or "us-east-1"}
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    if settings.s3_force_path_style:
        kwargs["config"] = Config(s3={"addressing_style": "path"})
    return boto3.client("s3", **kwargs)
