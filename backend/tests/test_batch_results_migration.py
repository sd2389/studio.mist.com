"""The batch results migration: a batch's archive job and expiry, and when its raw CAD files went;
nothing on the batches it finds, and its downgrade takes the columns away again. Steps on SQLite."""

from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, columns, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import text

from app.models import User

REVISION = "5b7e2c9d1f30"
COLUMNS = ("archive_job_id", "archive_expires_at", "sources_deleted_at")
NOW = datetime(2026, 10, 7)


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def test_the_batch_results_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)
    command.downgrade(config, previous_revision(REVISION))
    assert not set(COLUMNS) & columns(engine, "ingest_batches")
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(id=7, email="g@example.com", password_hash="h", role="user"))
        connection.execute(
            text(
                "INSERT INTO ingest_batches (id, user_id, name, status, source, options, item_count, total_bytes, "
                "render_credits_per_design, archive_keys, created_at, updated_at, finished_at, expires_at) "
                "VALUES (1, 7, 'Rings', 'completed', 'studio', '{}', 1, 10, 7, NULL, :now, :now, :now, :now)"
            ),
            {"now": NOW},
        )

    command.upgrade(config, "head")

    assert model_diffs(engine, ("ingest_batches",)) == []
    with engine.connect() as connection:
        row = connection.execute(text(f"SELECT {', '.join(COLUMNS)}, expires_at FROM ingest_batches")).one()
    assert tuple(row)[:3] == (None, None, None) and row.expires_at is not None

    command.downgrade(config, previous_revision(REVISION))
    assert not set(COLUMNS) & columns(engine, "ingest_batches")
    engine.dispose()
