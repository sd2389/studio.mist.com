"""The allowance generation migration: three counters, 0 on every row it finds, so holds open when it
runs still refund their plan credits until the next grant; its downgrade takes them away again.
Steps on SQLite."""

from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, columns, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import text

from app.models import User

REVISION = "351e0e870d0a"
NOW = datetime(2026, 10, 6)
COLUMNS = {
    "user_billing": "allowance_generation",
    "render_jobs": "billing_allowance_generation",
    "ingest_items": "credits_allowance_generation",
}


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def _rows_before(connection) -> None:
    """An account, a job still holding its credits and a design still holding its own."""
    connection.execute(User.__table__.insert().values(id=7, email="g@example.com", password_hash="h", role="user"))
    connection.execute(
        text(
            "INSERT INTO user_billing (id, user_id, plan_tier, model_credits_balance, ai_image_credits_balance, "
            "render_credits_balance, custom_material_credits_balance, custom_asset_credits_balance, "
            "storage_bytes_used, created_at, updated_at) VALUES (1, 7, 'grow', 75, 150, 290, 25, 25, 0, :now, :now)"
        ),
        {"now": NOW},
    )
    connection.execute(
        text(
            "INSERT INTO render_jobs (id, user_id, kind, spec, watermark, priority, max_running, status, attempts, "
            "max_attempts, worker_token, progress, credits, credit_state, created_at, updated_at) "
            "VALUES (1, 7, 'still', '{}', 0, 100, 1, 'queued', 0, 3, 't', 0, 10, 'held', :now, :now)"
        ),
        {"now": NOW},
    )
    connection.execute(
        text(
            "INSERT INTO ingest_batches (id, user_id, name, status, source, options, item_count, total_bytes, "
            "render_credits_per_design, created_at, updated_at) "
            "VALUES (1, 7, 'Rings', 'processing', 'studio', '{}', 1, 10, 4, :now, :now)"
        ),
        {"now": NOW},
    )
    connection.execute(
        text(
            "INSERT INTO ingest_items (id, batch_id, user_id, position, filename, source_key, source_bytes, "
            "companions, sku, name, category, units, status, attempts, model_credit_held, render_credits_held, "
            "warnings, created_at, updated_at) VALUES (1, 1, 7, 0, 'r.stl', 'k', 10, '[]', 'R-1', 'R', 'Ring', "
            "'auto', 'converting', 0, 1, 4, '[]', :now, :now)"
        ),
        {"now": NOW},
    )


def test_the_allowance_generation_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)
    command.downgrade(config, previous_revision(REVISION))
    for table, column in COLUMNS.items():
        assert column not in columns(engine, table)
    with engine.begin() as connection:
        _rows_before(connection)

    command.upgrade(config, "head")

    assert model_diffs(engine, tuple(COLUMNS)) == []
    with engine.connect() as connection:
        for table, column in COLUMNS.items():
            assert connection.execute(text(f"SELECT {column} FROM {table}")).scalars().all() == [0], table

    command.downgrade(config, previous_revision(REVISION))
    for table, column in COLUMNS.items():
        assert column not in columns(engine, table)
    engine.dispose()
