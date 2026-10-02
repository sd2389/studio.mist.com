"""AI image credits: stub placeholders are free; real generations spend one credit."""

import asyncio
import base64
import io
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from PIL import Image

from app.features.billing.quota_service import get_or_create_billing
from app.routers import ai_background as ai_router
from app.schemas.ai import AiBackgroundBody


def _png(size: tuple[int, int], color: tuple[int, ...]) -> bytes:
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, format="PNG")
    return buf.getvalue()


def _png_data_url() -> str:
    return "data:image/png;base64," + base64.b64encode(_png((8, 8), (200, 160, 40, 255))).decode()


# What the mocked real engines return.
GENERATED_PNG = _png((96, 64), (245, 245, 245, 255))


@pytest.fixture()
def saved_ai_pngs(monkeypatch) -> list[bytes]:
    """The PNGs the route stored, in order (nothing touches storage)."""
    saved: list[bytes] = []

    def save_ai_png(data, user_id):
        saved.append(data)
        return f"ai/{user_id}/result.png"

    monkeypatch.setattr(ai_router.ai_svc, "save_ai_png", save_ai_png)
    return saved


@pytest.fixture()
def engines(monkeypatch, saved_ai_pngs):
    """Pick the route's AI engines; generated PNGs stay out of storage."""
    monkeypatch.setattr(ai_router.ai_svc, "run_sdxl_inpaint", lambda im, prompt: GENERATED_PNG)
    monkeypatch.setattr(
        ai_router.on_model_svc, "run_on_model_replicate", lambda im, prompt, token, variant: GENERATED_PNG
    )

    def configure(background: str = "stub", on_model: str = "stub") -> None:
        settings = SimpleNamespace(
            ai_background_mode=background,
            ai_on_model_provider=on_model,
            replicate_api_token="not-a-real-token",
        )
        monkeypatch.setattr(ai_router, "get_settings", lambda: settings)

    return configure


def _generate(db, user, **fields) -> dict:
    body = AiBackgroundBody(jewelry_b64=_png_data_url(), **fields)
    return asyncio.run(ai_router.ai_background(body, db=db, user=user))


def _ai_balance(db, user) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.ai_image_credits_balance


def _empty_ai_balance(db, user) -> None:
    billing = get_or_create_billing(db, user)
    billing.ai_image_credits_balance = 0
    db.commit()


def test_stub_background_spends_no_credit(db, sample_user, engines):
    engines(background="stub")
    before = _ai_balance(db, sample_user)

    result = _generate(db, sample_user, sub_mode="shoot")

    assert result["mode"] == "shoot:stub"
    assert _ai_balance(db, sample_user) == before
    assert result["credits_remaining"] == before


def test_stub_on_model_spends_no_credit(db, sample_user, engines):
    engines(background="stub", on_model="stub")
    before = _ai_balance(db, sample_user)

    result = _generate(db, sample_user, sub_mode="model", model_variant="neck")

    assert result["mode"] == "model:stub"
    assert _ai_balance(db, sample_user) == before
    assert result["credits_remaining"] == before


def test_stub_works_with_no_credits_left(db, sample_user, engines):
    engines(background="stub")
    _empty_ai_balance(db, sample_user)

    result = _generate(db, sample_user, sub_mode="custom", prompt="On black velvet")

    assert result["mode"] == "custom:stub"
    assert _ai_balance(db, sample_user) == 0
    assert result["credits_remaining"] == 0


def test_sdxl_background_spends_one_credit(db, sample_user, engines):
    engines(background="sdxl")
    before = _ai_balance(db, sample_user)

    result = _generate(db, sample_user, sub_mode="shoot")

    assert result["mode"] == "shoot:sdxl"
    assert _ai_balance(db, sample_user) == before - 1
    assert result["credits_remaining"] == before - 1


def test_real_on_model_spends_one_credit_even_with_stub_backgrounds(db, sample_user, engines):
    engines(background="stub", on_model="replicate")
    before = _ai_balance(db, sample_user)

    result = _generate(db, sample_user, sub_mode="model")

    assert result["mode"] == "model:replicate"
    assert _ai_balance(db, sample_user) == before - 1
    assert result["credits_remaining"] == before - 1


def test_real_mode_needs_a_credit(db, sample_user, engines):
    engines(background="sdxl")
    _empty_ai_balance(db, sample_user)

    with pytest.raises(HTTPException) as exc:
        _generate(db, sample_user, sub_mode="shoot")

    assert exc.value.status_code == 402


def test_free_results_carry_the_watermark_and_paid_ones_do_not(db, sample_user, engines, saved_ai_pngs):
    engines(background="sdxl")
    _generate(db, sample_user, sub_mode="shoot")
    billing = get_or_create_billing(db, sample_user)
    billing.plan_tier = "grow"
    db.commit()
    _generate(db, sample_user, sub_mode="shoot")

    free_png, grow_png = saved_ai_pngs
    assert grow_png == GENERATED_PNG
    assert free_png != GENERATED_PNG
    assert Image.open(io.BytesIO(free_png)).size == (96, 64)
