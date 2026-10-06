"""The ingest migration adds the batch and design tables, the foreign keys render_jobs keeps to
them, and the partial index that reserves a design's SKU while it is in progress; its downgrade
takes them away again. Steps on SQLite."""

from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, columns, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.models import IngestBatch, IngestItem, User

REVISION = "09b522567b3b"
NOW = datetime(2026, 10, 5)
INGEST_TABLES = {"ingest_batches", "ingest_items"}


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def _tables(engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def _keys_to_ingest(engine) -> list[dict]:
    return [key for key in inspect(engine).get_foreign_keys("render_jobs") if key["referred_table"] in INGEST_TABLES]


def test_the_ingest_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)

    command.downgrade(config, previous_revision(REVISION))
    assert INGEST_TABLES.isdisjoint(_tables(engine))
    assert "ingest_item_id" not in columns(engine, "render_jobs")
    assert _keys_to_ingest(engine) == []
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(id=7, email="s@example.com", password_hash="h", role="user"))
        connection.execute(
            text(
                "INSERT INTO render_jobs (id, user_id, batch_id, kind, spec, watermark, priority, max_running, status, "
                "attempts, max_attempts, worker_token, progress, credits, credit_state, created_at, updated_at) "
                "VALUES (1, 7, 31, 'still', '{}', 1, 100, 1, 'completed', 1, 3, 't', 1, 0, 'none', :now, :now)"
            ),
            {"now": NOW},
        )

    command.upgrade(config, "head")

    assert INGEST_TABLES <= _tables(engine)
    assert model_diffs(engine) == []
    keys = {key["name"]: key for key in _keys_to_ingest(engine)}
    assert (keys["fk_render_jobs_batch_id_ingest_batches"]["constrained_columns"], keys["fk_render_jobs_batch_id_ingest_batches"]["referred_table"]) == (["batch_id"], "ingest_batches")
    assert (keys["fk_render_jobs_ingest_item_id_ingest_items"]["constrained_columns"], keys["fk_render_jobs_ingest_item_id_ingest_items"]["referred_table"]) == (["ingest_item_id"], "ingest_items")
    with engine.connect() as connection:
        # A smoke test's batch_id named no batch: it is cleared before the key holds it.
        assert connection.execute(text("SELECT batch_id FROM render_jobs WHERE id = 1")).scalar_one() is None

    command.downgrade(config, previous_revision(REVISION))
    assert INGEST_TABLES.isdisjoint(_tables(engine))
    assert "ingest_item_id" not in columns(engine, "render_jobs")
    engine.dispose()


def _insert_item(connection, item_id: int, batch_id: int, status: str) -> None:
    connection.execute(
        text(
            "INSERT INTO ingest_items (id, batch_id, user_id, position, filename, source_key, source_bytes, companions, "
            "sku, name, category, units, status, attempts, model_credit_held, render_credits_held, warnings, "
            "created_at, updated_at) VALUES (:id, :batch, 1, 0, 'r.stl', 'k', 10, '[]', 'R-1', 'R', 'Ring', 'auto', "
            ":status, 0, 0, 0, '[]', :now, :now)"
        ),
        {"id": item_id, "batch": batch_id, "status": status, "now": NOW},
    )


def test_the_migrated_index_reserves_a_sku_while_its_design_is_in_progress(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)
    command.downgrade(config, previous_revision(REVISION))
    command.upgrade(config, "head")
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(id=1, email="a@example.com", password_hash="h", role="user"))
        for batch_id in (1, 2):
            connection.execute(
                text(
                    "INSERT INTO ingest_batches (id, user_id, name, status, source, options, item_count, total_bytes, "
                    "render_credits_per_design, created_at, updated_at) "
                    "VALUES (:id, 1, 'Rings', 'processing', 'studio', '{}', 1, 10, 0, :now, :now)"
                ),
                {"id": batch_id, "now": NOW},
            )
        _insert_item(connection, 1, 1, "failed")
        _insert_item(connection, 2, 2, "converting")  # a failed design no longer reserves R-1

    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text("UPDATE ingest_items SET status = 'awaiting_upload' WHERE id = 1"))
    engine.dispose()


def test_the_models_reserve_skus_as_the_migration_does(db):
    """The schema the other tests build from the models has the same partial index."""
    user = User(email="o@example.com", password_hash="h", role="user", created_at=NOW, updated_at=NOW)
    db.add(user)
    db.commit()
    batches = [IngestBatch(user_id=user.id, name=f"B{n}", options={}) for n in range(3)]
    db.add_all(batches)
    db.commit()

    def design(batch: IngestBatch, status: str) -> IngestItem:
        return IngestItem(
            batch_id=batch.id, user_id=user.id, position=0, filename="r.stl", source_key="k", source_bytes=1,
            sku="R-1", name="R", category="Ring", status=status,
        )

    db.add_all([design(batches[0], "done"), design(batches[1], "converting")])
    db.commit()
    db.add(design(batches[2], "awaiting_upload"))
    with pytest.raises(IntegrityError):
        db.commit()
