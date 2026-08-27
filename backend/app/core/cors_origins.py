"""Resolve CORS allowlist for local and single-host demo."""


def resolve_cors_origins(cors_origins: str, app_public_url: str | None = None) -> list[str]:
    origins = [origin.strip().rstrip("/") for origin in cors_origins.split(",") if origin.strip()]
    public = (app_public_url or "").strip().rstrip("/")
    if public and public not in origins:
        origins.append(public)
    return origins
