from app.core.cors_origins import resolve_cors_origins


def test_resolve_cors_origins_appends_public_url():
    origins = resolve_cors_origins(
        "http://localhost:3000,http://127.0.0.1:3000",
        "https://demo.example:3000/",
    )
    assert origins == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://demo.example:3000",
    ]


def test_resolve_cors_origins_does_not_duplicate_public_url():
    origins = resolve_cors_origins(
        "http://localhost:3000",
        "http://localhost:3000/",
    )
    assert origins == ["http://localhost:3000"]
