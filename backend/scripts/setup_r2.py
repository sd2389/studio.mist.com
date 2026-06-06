#!/usr/bin/env python3
"""Idempotent Cloudflare R2 bucket + CORS setup for studio private/public buckets."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402


def _client():
    settings = get_settings()
    account_id = settings.r2_account_id or os.environ.get("R2_ACCOUNT_ID")
    access_key = settings.r2_access_key_id or os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = settings.r2_secret_access_key or os.environ.get("R2_SECRET_ACCESS_KEY")
    if not all([account_id, access_key, secret_key]):
        raise SystemExit("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")

    endpoint = settings.r2_endpoint_url or f"https://{account_id}.r2.cloudflarestorage.com"
    config = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path"},
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    )
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=settings.r2_region or "auto",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=config,
    )


def ensure_bucket(client, name: str) -> None:
    try:
        client.head_bucket(Bucket=name)
        print(f"bucket exists: {name}")
    except ClientError:
        client.create_bucket(Bucket=name)
        print(f"created bucket: {name}")


def ensure_cors(client, bucket: str, origins: list[str]) -> None:
    rule = {
        "AllowedOrigins": origins,
        "AllowedMethods": ["GET", "PUT", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600,
    }
    client.put_bucket_cors(Bucket=bucket, CORSConfiguration={"CORSRules": [rule]})
    print(f"cors updated: {bucket} -> {origins}")


def main() -> None:
    settings = get_settings()
    private = settings.r2_bucket_name or os.environ.get("R2_BUCKET_NAME", "studio-dev")
    public = settings.r2_public_bucket_name or os.environ.get("R2_PUBLIC_BUCKET_NAME", "studio-dev-public")
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    if settings.app_public_url and settings.app_public_url not in origins:
        origins.append(settings.app_public_url)

    client = _client()
    for bucket in (private, public):
        ensure_bucket(client, bucket)
    ensure_cors(client, private, origins)
    print(
        json.dumps(
            {
                "private_bucket": private,
                "public_bucket": public,
                "cors_origins": origins,
                "note": "Bind a custom domain to the public bucket in Cloudflare dashboard; set R2_PUBLIC_BASE_URL.",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
