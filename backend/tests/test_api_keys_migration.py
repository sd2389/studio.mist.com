"""The API keys migration adds the table of keys, one prefix each, deleted with their owner, and
its downgrade takes it away again. Steps on SQLite."""

from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.models import User

REVISION = "d9858f4349a2"
NOW = datetime(2026, 10, 7)


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def _insert_key(connection, key_id: int, prefix: str) -> None:
    connection.execute(
        text(
            "INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scopes, created_at) "
            "VALUES (:id, 1, 'ERP', :prefix, :hash, '[\"batches:read\"]', :now)"
        ),
        {"id": key_id, "prefix": prefix, "hash": "0" * 64, "now": NOW},
    )


def test_the_api_keys_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)

    command.downgrade(config, previous_revision(REVISION))
    assert "api_keys" not in inspect(engine).get_table_names()

    command.upgrade(config, "head")
    assert model_diffs(engine, ("api_keys",)) == []
    (key,) = inspect(engine).get_foreign_keys("api_keys")
    assert (key["referred_table"], key["constrained_columns"], key["options"].get("ondelete")) == (
        "users", ["user_id"], "CASCADE",
    )
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(id=1, email="a@example.com", password_hash="h", role="user"))
        _insert_key(connection, 1, "abcd1234")
        _insert_key(connection, 2, "abcd1235")
    with pytest.raises(IntegrityError), engine.begin() as connection:
        _insert_key(connection, 3, "abcd1234")  # one key a prefix

    command.downgrade(config, previous_revision(REVISION))
    assert "api_keys" not in inspect(engine).get_table_names()
    engine.dispose()
