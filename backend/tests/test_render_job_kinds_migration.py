"""The render job kinds migration downgrades and upgrades on SQLite, fills in the rows it finds,
and, with the migrations after it, leaves the schema the models describe."""

import json

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from migration_steps import (
    alembic_config,
    columns,
    model_diffs,
    point_alembic_at,
    previous_revision,
    schema_at_head,
)
from sqlalchemy import inspect, text

REVISION = "97e22f9d865b"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def test_the_migrations_have_one_head():
    """Branches add migrations in parallel; whichever merges second re-points its down_revision."""
    assert len(ScriptDirectory.from_config(alembic_config()).get_heads()) == 1


def test_render_job_kinds_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)

    command.downgrade(config, previous_revision(REVISION))
    assert {"kind", "spec", "credit_state", "idempotency_key"}.isdisjoint(columns(engine, "render_jobs"))
    assert {"job_id", "filename", "meta"}.isdisjoint(columns(engine, "renders"))

    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO users (id, email, password_hash, role, is_active, created_at, updated_at) VALUES "
            "(1, 'free@example.com', 'h', 'user', 1, '2026-10-01', '2026-10-01'), "
            "(2, 'grow@example.com', 'h', 'user', 1, '2026-10-01', '2026-10-01')"
        ))
        connection.execute(text(
            "INSERT INTO user_billing (user_id, plan_tier, model_credits_balance, ai_image_credits_balance, "
            "render_credits_balance, custom_material_credits_balance, custom_asset_credits_balance, "
            "storage_bytes_used, created_at, updated_at) VALUES "
            "(1, 'free', 0, 0, 0, 0, 0, 0, '2026-10-01', '2026-10-01'), "
            "(2, ' Grow ', 0, 0, 0, 0, 0, 0, '2026-10-01', '2026-10-01')"
        ))
        connection.execute(text(
            "INSERT INTO render_jobs (id, user_id, model_ref, lighting, preset, width, height, status, attempts, "
            "worker_token, created_at, updated_at) VALUES "
            "(1, 1, 'm.glb', 'studio', 'gold-18k-yellow', 2048, 1024, 'completed', 1, 't1', '2026-10-01', '2026-10-01'), "
            "(2, 2, 'm.glb', 'dark', 'platinum', 512, 512, 'queued', 0, 't2', '2026-10-01', '2026-10-01')"
        ))

    command.upgrade(config, REVISION)

    with engine.connect() as connection:
        rows = connection.execute(text(
            "SELECT id, kind, spec, watermark, credits, credit_state, priority, max_attempts FROM render_jobs ORDER BY id"
        )).all()
    assert [(row.id, row.kind, row.watermark, row.credits, row.credit_state, row.priority, row.max_attempts) for row in rows] == [
        (1, "still", 1, 1, "charged", 100, 3),
        (2, "still", 0, 0, "none", 100, 3),
    ]
    assert json.loads(rows[0].spec) == {"width": 2048, "height": 1024, "preset": "gold-18k-yellow", "lighting": "studio"}

    command.upgrade(config, "head")
    assert model_diffs(engine) == []
    foreign_keys = inspect(engine).get_foreign_keys("renders")
    assert {"name": "fk_renders_job_id_render_jobs", "referred_table": "render_jobs"}.items() <= next(
        key for key in foreign_keys if key["constrained_columns"] == ["job_id"]
    ).items()
    engine.dispose()
