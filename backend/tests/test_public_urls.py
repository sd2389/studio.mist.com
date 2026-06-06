from app.core.cache_policy import cache_control_for_key
from app.core.public_urls import public_file_url


def test_public_file_url_uses_r2_public_base_for_published(monkeypatch):
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://pub.cdn.example.com")
    from app.config import get_settings

    get_settings.cache_clear()
    url = public_file_url("published/1/sku-1/model.glb")
    assert url == "https://pub.cdn.example.com/published/1/sku-1/model.glb"
    get_settings.cache_clear()


def test_public_file_url_uses_cdn_when_configured(monkeypatch):
    monkeypatch.setenv("PUBLIC_CDN_ORIGIN", "https://cdn.example.com")
    monkeypatch.setenv("PUBLIC_API_BASE", "https://api.example.com")
    from app.config import get_settings

    get_settings.cache_clear()
    url = public_file_url("models/abc-ring.glb")
    assert url == "https://cdn.example.com/models/abc-ring.glb"
    get_settings.cache_clear()


def test_public_file_url_falls_back_to_api(monkeypatch):
    monkeypatch.delenv("PUBLIC_CDN_ORIGIN", raising=False)
    monkeypatch.setenv("PUBLIC_API_BASE", "https://api.example.com")
    from app.config import get_settings

    get_settings.cache_clear()
    url = public_file_url("thumbnails/preview.webp")
    assert url == "https://api.example.com/files/thumbnails/preview.webp"
    get_settings.cache_clear()


def test_cache_control_for_models_is_immutable():
    assert "immutable" in cache_control_for_key("models/uuid.glb")


def test_cache_control_for_thumbnails_is_shorter():
    policy = cache_control_for_key("thumbnails/uuid.webp")
    assert "immutable" not in policy
    assert "86400" in policy
