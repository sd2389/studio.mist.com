"""Saved renders: a declared size must fit the plan's max_image_resolution, and the image
itself is scaled to fit it."""

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


def _png_data_url(size: tuple[int, int] = (8, 8)) -> str:
    buf = io.BytesIO()
    Image.new("RGB", size, (240, 240, 240)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture()
def written(monkeypatch) -> dict[str, bytes]:
    """What the save wrote to storage, by key (nothing touches disk)."""
    files: dict[str, bytes] = {}

    def write_bytes(key, data, content_type=None):
        files[key] = data

    monkeypatch.setattr(render_service.storage, "write_bytes", write_bytes)
    return files


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


def _save(db, user, size: tuple[int, int] = (8, 8), **fields) -> dict:
    body = RenderSaveRequest(image=_png_data_url(size), **fields)
    return render_service.save_render_from_data_url(db, body, user)


def test_save_refuses_a_declared_size_over_the_free_cap(db, sample_user, written):
    with pytest.raises(HTTPException) as exc:
        _save(db, sample_user, kind="hires", width=7680, height=4320)

    assert exc.value.status_code == 402
    assert "Resolution limit exceeded for Free (max 4096 px per side)" in exc.value.detail
    assert written == {}


def test_save_keeps_an_image_within_the_cap_as_sent(db, sample_user, written):
    scene = _make_scene(db, sample_user.id)
    image = _png_data_url((4096, 2304))

    body = RenderSaveRequest(image=image, scene_id=scene.id, kind="hires", width=4096, height=2304)
    result = render_service.save_render_from_data_url(db, body, sample_user)

    render = db.get(Render, result["render_id"])
    assert (render.width, render.height) == (4096, 2304)
    assert written == {render.key: base64.b64decode(image.split(",", 1)[1])}


@pytest.mark.parametrize("declared", [{}, {"width": 100, "height": 100}])
def test_save_scales_an_image_over_the_cap_down_to_fit(db, sample_user, written, declared):
    """The real pixels count, not the declared size: a capture over the cap is stored at the cap."""
    scene = _make_scene(db, sample_user.id)

    result = _save(db, sample_user, size=(5000, 40), scene_id=scene.id, **declared)

    render = db.get(Render, result["render_id"])
    stored = Image.open(io.BytesIO(written[render.key]))
    assert stored.width == 4096
    assert (render.width, render.height) == stored.size


def test_save_refuses_bytes_that_are_not_an_image(db, sample_user, written):
    body = RenderSaveRequest(image="data:image/png;base64," + base64.b64encode(b"not a png").decode())

    with pytest.raises(HTTPException) as exc:
        render_service.save_render_from_data_url(db, body, sample_user)

    assert exc.value.status_code == 400
    assert written == {}


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
