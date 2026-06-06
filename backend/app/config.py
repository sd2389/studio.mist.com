from functools import lru_cache
from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_DATABASE_URL = "postgresql+psycopg2://studio:studio@localhost:5433/studio"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = Field(default="development", validation_alias="APP_ENV")
    health_deps_token: str | None = Field(default=None, validation_alias="HEALTH_DEPS_TOKEN")
    database_url: str = _DEFAULT_DATABASE_URL
    storage_backend: str = Field(default="auto", validation_alias="STORAGE_BACKEND")
    aws_bucket: str | None = None
    aws_region: str | None = None
    s3_endpoint_url: str | None = Field(default=None, validation_alias="AWS_S3_ENDPOINT")
    s3_force_path_style: bool = Field(default=False, validation_alias="AWS_S3_FORCE_PATH_STYLE")
    r2_account_id: str | None = Field(default=None, validation_alias="R2_ACCOUNT_ID")
    r2_access_key_id: str | None = Field(default=None, validation_alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = Field(default=None, validation_alias="R2_SECRET_ACCESS_KEY")
    r2_bucket_name: str | None = Field(default=None, validation_alias="R2_BUCKET_NAME")
    r2_public_bucket_name: str | None = Field(default=None, validation_alias="R2_PUBLIC_BUCKET_NAME")
    r2_public_base_url: str | None = Field(default=None, validation_alias="R2_PUBLIC_BASE_URL")
    r2_endpoint_url: str | None = Field(default=None, validation_alias="R2_ENDPOINT_URL")
    r2_region: str = Field(default="auto", validation_alias="R2_REGION")
    r2_force_path_style: bool = Field(default=True, validation_alias="R2_FORCE_PATH_STYLE")
    public_cdn_origin: str | None = Field(default=None, validation_alias="PUBLIC_CDN_ORIGIN")
    upload_dir: Path = Path(__file__).resolve().parent.parent / "uploads"
    cors_origins: str = (
        "http://localhost:3000,http://localhost:3001,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001"
    )
    cors_origin_regex: str | None = Field(default=None, validation_alias="CORS_ORIGIN_REGEX")
    ai_background_mode: str = "stub"
    ai_on_model_provider: str = "stub"
    replicate_api_token: str | None = None
    fal_key: str | None = None
    public_api_base: str | None = None
    app_public_url: str = "http://localhost:3000"
    email_from: str = "studio@devjewels.com"
    contact_notify_email: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    sentry_dsn: str | None = None
    sentry_environment: str = "development"
    sentry_release: str | None = None
    sentry_traces_sample_rate: float = 0.1
    rate_limit_enabled: bool = True
    rate_limit_upload_presign_per_hour: int = 30
    rate_limit_upload_register_per_hour: int = 30
    rate_limit_upload_direct_per_hour: int = 20
    rate_limit_ai_background_per_hour: int = 60
    max_upload_bytes: int = 100 * 1024 * 1024
    stripe_secret_key: str | None = Field(default=None, validation_alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str | None = Field(default=None, validation_alias="STRIPE_WEBHOOK_SECRET")
    stripe_price_grow: str | None = Field(default=None, validation_alias="STRIPE_PRICE_GROW")
    stripe_price_studio: str | None = Field(default=None, validation_alias="STRIPE_PRICE_STUDIO")
    stripe_price_topup_model_10: str | None = Field(
        default=None, validation_alias="STRIPE_PRICE_TOPUP_MODEL_10"
    )
    stripe_price_topup_model_25: str | None = Field(
        default=None, validation_alias="STRIPE_PRICE_TOPUP_MODEL_25"
    )
    stripe_price_topup_ai_50: str | None = Field(
        default=None, validation_alias="STRIPE_PRICE_TOPUP_AI_50"
    )
    stripe_price_topup_ai_150: str | None = Field(
        default=None, validation_alias="STRIPE_PRICE_TOPUP_AI_150"
    )
    admin_emails: str = Field(default="", validation_alias="ADMIN_EMAILS")

    @model_validator(mode="after")
    def validate_production_settings(self) -> Self:
        if self.app_env.lower() == "production" and self.database_url == _DEFAULT_DATABASE_URL:
            raise ValueError("DATABASE_URL must be set when APP_ENV=production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
