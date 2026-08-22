from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.cors_origins import resolve_cors_origins
from app.core.observability import configure_logging, init_sentry
from app.database import init_db
from app.routers import api_router

configure_logging()
init_sentry()

_settings = get_settings()
_is_dev = _settings.app_env.lower() != "production"

app = FastAPI(
    title="DevJewels Studio API",
    version="0.1.0",
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
)
_cors_origins = resolve_cors_origins(_settings.cors_origins, _settings.app_public_url)

_cors_kw: dict = {
    "allow_origins": _cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if _settings.cors_origin_regex:
    _cors_kw["allow_origin_regex"] = _settings.cors_origin_regex

app.add_middleware(CORSMiddleware, **_cors_kw)

app.include_router(api_router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
