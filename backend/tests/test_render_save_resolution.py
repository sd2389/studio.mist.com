"""Saved renders: a declared size must fit the plan's max_image_resolution."""

import base64
import io
from datetime import datetime

import pytest
from fastapi import HTTPException
from PIL import Image

from app.features.billing.quota_service import get_or_create_billing
from app.features.render import service as render_service
from app.models import Render, Scene
from app.schemas.render import RenderSaveRequest


def _png_data_url() -> str:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (240, 240, 240)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture()
def written(monkeypatch) -> list[str]:
    """Keys the save wrote to storage (nothing touches disk)."""
    keys: list[str] = []
    monkeypatch.setattr(
        render_service.storage, "write_bytes", lambda key, data, content_type=None: keys.append(key)
    )
    return keys


def _make_scene(db, user_id: int) -> Scene:
    scene = Scene(
        user_id=user_id,
        model_key="models/ring.glb",
        material="original",
        lighting="studio",
        model_config={},
        slot_selections={},
        scene_settings={},
        variants={},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(scene)
    db.commit()
    db.refresh(scene)
    return scene


def _save(db, user, **fields) -> dict:
    body = RenderSaveRequest(image=_png_data_url(), **fields)
    return render_service.save_render_from_data_url(db, body, user)


def test_save_refuses_a_declared_size_over_the_free_cap(db, sample_user, written):
    with pytest.raises(HTTPException) as exc:
        _save(db, sample_user, kind="hires", width=7680, height=4320)

    assert exc.value.status_code == 402
    assert "Resolution limit exceeded for Free (max 4096 px per side)" in exc.value.detail
    assert written == []


def test_save_records_a_size_within_the_cap(db, sample_user, written):
    scene = _make_scene(db, sample_user.id)

    result = _save(db, sample_user, scene_id=scene.id, kind="hires", width=4096, height=2304)

    render = db.get(Render, result["render_id"])
    assert (render.width, render.height) == (4096, 2304)
    assert written == [render.key]


def test_save_without_a_declared_size_still_works(db, sample_user, written):
    """Viewport captures and thumbnails send no size."""
    result = _save(db, sample_user)

    assert result["ok"] is True
    assert len(written) == 1


def test_save_allows_8k_on_grow(db, sample_user, written):
    billing = get_or_create_billing(db, sample_user)
    billing.plan_tier = "grow"
    db.commit()

    result = _save(db, sample_user, kind="hires", width=7680, height=4320)

    assert result["ok"] is True
