"""The render job kinds migration downgrades and upgrades on SQLite, fills in the rows it finds,
and leaves the schema the models describe."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

import app.config
from app.models import Base

REVISION = "97e22f9d865b"
TABLES = ("render_jobs", "renders")
ALEMBIC_DIR = Path(__file__).resolve().parent.parent / "alembic"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    # alembic/env.py takes the database URL from the settings: point it at this file only.
    monkeypatch.setattr(app.config, "get_settings", lambda: SimpleNamespace(database_url=url))
    return url


def _alembic_config() -> Config:
    config = Config()  # no ini file, so env.py leaves the test run's logging alone
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    return config


def _columns(engine, table: str) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(table)}


def _model_diffs(engine) -> list:
    with engine.connect() as connection:
        diffs = compare_metadata(
            MigrationContext.configure(connection, opts={"compare_type": True}), Base.metadata
        )
    return [diff for diff in diffs if any(table in repr(diff) for table in TABLES)]


def test_the_migrations_have_one_head():
    """Branches add migrations in parallel; whichever merges second re-points its down_revision."""
    assert len(ScriptDirectory.from_config(_alembic_config()).get_heads()) == 1


def test_render_job_kinds_migration_round_trip(sqlite_url):
    config = _alembic_config()
    previous = ScriptDirectory.from_config(config).get_revision(REVISION).down_revision
    engine = create_engine(sqlite_url)
    # Older migrations use PostgreSQL-only SQL, so build this revision's schema from the models
    # and step down from it.
    Base.metadata.create_all(engine)
    command.stamp(config, REVISION)

    command.downgrade(config, previous)
    assert {"kind", "spec", "credit_state", "idempotency_key"}.isdisjoint(_columns(engine, "render_jobs"))
    assert {"job_id", "filename", "meta"}.isdisjoint(_columns(engine, "renders"))

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
    assert _model_diffs(engine) == []
    foreign_keys = inspect(engine).get_foreign_keys("renders")
    assert {"name": "fk_renders_job_id_render_jobs", "referred_table": "render_jobs"}.items() <= next(
        key for key in foreign_keys if key["constrained_columns"] == ["job_id"]
    ).items()
    engine.dispose()
