from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.core import storage

router = APIRouter()


def _check_storage() -> dict[str, str]:
    settings = get_settings()
    backend = (settings.storage_backend or "auto").lower()
    try:
        backend_impl = storage.get_storage()
        if backend == "local" or backend_impl.__class__.__name__ == "LocalBackend":
            root = settings.upload_dir
            return {"status": "ok", "backend": "local", "path": str(root)}
        probe_key = "__health__/probe.txt"
        backend_impl.put_bytes(probe_key, b"ok", content_type="text/plain")
        backend_impl.delete(probe_key)
        return {"status": "ok", "backend": backend_impl.__class__.__name__}
    except Exception as exc:
        return {"status": "error", "backend": backend, "detail": str(exc)}


def _check_stripe() -> dict[str, str]:
    settings = get_settings()
    if not settings.stripe_secret_key:
        return {"status": "skipped", "detail": "not configured"}
    return {"status": "ok"}


def _check_ai() -> dict[str, str]:
    settings = get_settings()
    mode = (settings.ai_background_mode or "stub").lower()
    provider = (settings.ai_on_model_provider or "stub").lower()
    return {"status": "ok", "background_mode": mode, "on_model_provider": provider}


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/deps")
def health_dependencies(
    x_health_token: Annotated[str | None, Header()] = None,
) -> dict[str, object]:
    settings = get_settings()
    if settings.app_env.lower() == "production":
        expected = settings.health_deps_token
        if not expected or x_health_token != expected:
            raise HTTPException(status_code=404, detail="Not found")

    return {
        "status": "ok",
        "storage": _check_storage(),
        "stripe": _check_stripe(),
        "ai": _check_ai(),
    }
