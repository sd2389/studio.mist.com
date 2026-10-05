"""Timestamps are answered in UTC with a Z, so a browser doesn't read them as its local time:
render jobs, and the scene list and detail the dashboard shows."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.features.render_jobs.service import create_job
from app.main import app
from app.models import Render, Scene
from app.schemas.render_job import RenderJobCreate
from app.schemas.utc import UTCDateTime, utc_isoformat

STAMP = datetime(2026, 10, 5, 14, 2, 11, 250000)


def test_a_naive_timestamp_is_written_as_utc_with_a_z():
    assert utc_isoformat(STAMP) == "2026-10-05T14:02:11.250000Z"
    assert utc_isoformat(datetime(2026, 10, 5, 16, 2, 11, tzinfo=timezone(timedelta(hours=2)))) == "2026-10-05T14:02:11Z"


def test_the_type_writes_json_and_leaves_python_values_alone():
    class Stamped(BaseModel):
        at: UTCDateTime
        maybe: UTCDateTime | None = None

    stamped = Stamped(at=STAMP)

    assert stamped.model_dump(mode="json") == {"at": "2026-10-05T14:02:11.250000Z", "maybe": None}
    assert stamped.model_dump()["at"] == STAMP


@pytest.fixture()
def client(db, sample_user):
    from app.database import get_db

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: sample_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def scene(db, sample_user) -> Scene:
    row = Scene(user_id=sample_user.id, model_key="customers/1/models/ring.glb", name="Ring", created_at=STAMP, updated_at=STAMP)
    db.add(row)
    db.commit()
    db.add(Render(scene_id=row.id, key="customers/1/renders/a.png", bytes=1, kind="still", created_at=STAMP))
    db.commit()
    return row


def test_the_scene_list_and_detail_answer_utc(client, scene):
    [item] = client.get("/scenes").json()["items"]
    detail = client.get(f"/scenes/{scene.id}").json()

    assert (item["created_at"], item["updated_at"]) == ("2026-10-05T14:02:11.250000Z",) * 2
    assert (detail["created_at"], detail["updated_at"]) == ("2026-10-05T14:02:11.250000Z",) * 2
    assert detail["renders"][0]["created_at"] == "2026-10-05T14:02:11.250000Z"


def test_a_render_job_answers_utc(client, db, sample_user, scene):
    body = RenderJobCreate(kind="still", scene_id=scene.id, spec={"camera": {"pose": "pose-default"}, "width": 512, "height": 512})
    job, _ = create_job(db, sample_user, body)

    answered = client.get(f"/render-jobs/{job.id}").json()

    assert answered["created_at"] == utc_isoformat(job.created_at)
    assert answered["created_at"].endswith("Z")
    assert (answered["started_at"], answered["finished_at"], answered["cancel_requested_at"]) == (None, None, None)
