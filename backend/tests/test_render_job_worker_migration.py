"""The worker protocol migration drops the columns the old protocol read and moves the output
names to where the harness reads them; its downgrade puts both back. Steps on SQLite."""

import json
from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, columns, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import text

from app.models import Render, Scene, User

REVISION = "12a67b9ab68f"
OLD_COLUMNS = {"model_ref", "lighting", "preset", "width", "height", "result_key"}
CAMERA = {"angle": "front", "margin_pct": 8.0}
LOOK = {"material": "platinum", "lighting": "soft", "slot_selections": {}, "scene_settings": {}, "model_config": {}}


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def _spec(names_key: str, **fields) -> str:
    spec = {"camera": CAMERA, "width": 640, "height": 360, "format": "png", "frames": 1, names_key: ["RING-1.png"]}
    return json.dumps({**spec, **fields})


def _jobs(engine) -> dict[int, dict]:
    with engine.connect() as connection:
        rows = connection.execute(text("SELECT * FROM render_jobs ORDER BY id")).mappings().all()
    return {row["id"]: {**row, "spec": json.loads(row["spec"])} for row in rows}


def _seed_a1_rows(engine) -> None:
    """Rows as A1 wrote them: two of its jobs, and two smoke-test rows from before it."""
    now = datetime(2026, 10, 1)
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(id=1, email="a@example.com", password_hash="h", role="user"))
        connection.execute(
            Scene.__table__.insert().values(id=1, user_id=1, model_key="customers/1/models/ring.glb", created_at=now, updated_at=now)
        )
        insert = text(
            "INSERT INTO render_jobs (id, user_id, scene_id, kind, spec, look, watermark, priority, max_running, "
            "status, attempts, max_attempts, worker_token, progress, credits, credit_state, "
            "model_ref, lighting, preset, width, height, created_at, updated_at) VALUES "
            "(:id, 1, :scene_id, 'still', :spec, :look, 1, 100, 1, :status, 1, 3, 't', 0, 0, 'none', "
            "'old', 'studio', 'gold', 1, 1, :now, :now)"
        )
        for job in (
            {"id": 1, "scene_id": 1, "spec": _spec("outputs"), "look": json.dumps(LOOK), "status": "completed"},
            {"id": 2, "scene_id": 1, "spec": _spec("outputs"), "look": json.dumps(LOOK), "status": "queued"},
            {"id": 3, "scene_id": None, "spec": json.dumps({"width": 512, "height": 256, "preset": "rose", "lighting": "dark"}), "look": None, "status": "queued"},
            {"id": 4, "scene_id": None, "spec": json.dumps({"width": 512, "height": 512}), "look": None, "status": "completed"},
        ):
            connection.execute(insert, {**job, "now": now})
        connection.execute(
            Render.__table__.insert().values(
                id=1, scene_id=1, job_id=1, key="customers/1/renders/1/RING-1.png", bytes=10, kind="still", created_at=now
            )
        )


def test_render_job_worker_protocol_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)
    command.downgrade(config, previous_revision(REVISION))
    assert OLD_COLUMNS <= columns(engine, "render_jobs")
    _seed_a1_rows(engine)

    command.upgrade(config, "head")

    assert OLD_COLUMNS.isdisjoint(columns(engine, "render_jobs"))
    assert model_diffs(engine) == []
    jobs = _jobs(engine)
    assert jobs[1]["spec"]["output_names"] == ["RING-1.png"] and "outputs" not in jobs[1]["spec"]
    assert [jobs[id_]["status"] for id_ in (1, 2, 3, 4)] == ["completed", "queued", "failed", "completed"]
    assert (jobs[3]["error_code"], jobs[3]["finished_at"] is not None) == ("invalid_spec", True)

    command.downgrade(config, previous_revision(REVISION))

    jobs = _jobs(engine)
    assert jobs[1]["spec"]["outputs"] == ["RING-1.png"] and "output_names" not in jobs[1]["spec"]
    assert {key: jobs[1][key] for key in OLD_COLUMNS} == {
        "model_ref": "customers/1/models/ring.glb", "lighting": "soft", "preset": "platinum",
        "width": 640, "height": 360, "result_key": "customers/1/renders/1/RING-1.png",
    }
    assert {key: jobs[3][key] for key in OLD_COLUMNS} == {
        "model_ref": "", "lighting": "dark", "preset": "rose", "width": 512, "height": 256, "result_key": None,
    }
    engine.dispose()
