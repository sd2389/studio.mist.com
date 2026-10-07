"""The render plans migration: a design's embed link and what it was refunded, and an output's public
copy; nothing on the rows it finds, and its downgrade takes the columns away again. Steps on SQLite."""

from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, columns, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import inspect, text

from app.models import Scene, User

REVISION = "343885745c98"
NOW = datetime(2026, 10, 7)
COLUMNS = {
    "ingest_items": ("model_credits_refunded", "render_credits_refunded", "embed_url"),
    "renders": ("public_key",),
}


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def _rows_before(connection) -> None:
    """A design still rendering, and a still one of its jobs made."""
    connection.execute(User.__table__.insert().values(id=7, email="g@example.com", password_hash="h", role="user"))
    connection.execute(
        text(
            "INSERT INTO ingest_batches (id, user_id, name, status, source, options, item_count, total_bytes, "
            "render_credits_per_design, created_at, updated_at) "
            "VALUES (1, 7, 'Rings', 'processing', 'studio', '{}', 1, 10, 7, :now, :now)"
        ),
        {"now": NOW},
    )
    connection.execute(
        text(
            "INSERT INTO ingest_items (id, batch_id, user_id, position, filename, source_key, source_bytes, "
            "companions, sku, name, category, units, status, attempts, model_credit_held, render_credits_held, "
            "warnings, created_at, updated_at) VALUES (1, 1, 7, 0, 'r.stl', 'k', 10, '[]', 'R-1', 'R', 'Ring', "
            "'auto', 'rendering', 0, 0, 0, '[]', :now, :now)"
        ),
        {"now": NOW},
    )
    connection.execute(
        Scene.__table__.insert().values(id=1, user_id=7, model_key="customers/7/models/r.glb", created_at=NOW, updated_at=NOW)
    )
    connection.execute(
        text("INSERT INTO renders (id, scene_id, key, bytes, kind, created_at) VALUES (1, 1, 'k.jpg', 3, 'still', :now)"),
        {"now": NOW},
    )


def test_the_render_plans_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)
    command.downgrade(config, previous_revision(REVISION))
    for table, names in COLUMNS.items():
        assert not set(names) & columns(engine, table), table
    with engine.begin() as connection:
        _rows_before(connection)

    command.upgrade(config, "head")

    assert model_diffs(engine, tuple(COLUMNS)) == []
    assert "ix_ingest_items_converted" in {index["name"] for index in inspect(engine).get_indexes("ingest_items")}
    with engine.connect() as connection:
        item = connection.execute(text("SELECT model_credits_refunded, render_credits_refunded, embed_url FROM ingest_items")).one()
        assert tuple(item) == (0, 0, None)
        assert connection.execute(text("SELECT public_key FROM renders")).scalars().all() == [None]

    command.downgrade(config, previous_revision(REVISION))
    for table, names in COLUMNS.items():
        assert not set(names) & columns(engine, table), table
    assert "ix_ingest_items_converted" not in {index["name"] for index in inspect(engine).get_indexes("ingest_items")}
    engine.dispose()
