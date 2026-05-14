from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://studio:studio@localhost:5433/studio"
    aws_bucket: str | None = None
    aws_region: str | None = None
    upload_dir: Path = Path(__file__).resolve().parent.parent / "uploads"
    cors_origins: str = (
        "http://localhost:3000,http://localhost:3001,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001"
    )
    cors_origin_regex: str | None = r"https://.*\.vercel\.app"
    ai_background_mode: str = "stub"
    public_api_base: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
