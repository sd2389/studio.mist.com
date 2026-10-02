"""The credit_purchases migration upgrades and downgrades on SQLite and matches the model."""

from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect

import app.config
from app.models import Base

REVISION = "81a7e50047d5"
TABLE = "credit_purchases"
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


def _table_names(engine) -> set[str]:
    return set(inspect(engine).get_table_names())


def _model_diffs(engine) -> list:
    with engine.connect() as connection:
        diffs = compare_metadata(
            MigrationContext.configure(connection, opts={"compare_type": True}), Base.metadata
        )
    return [diff for diff in diffs if TABLE in repr(diff)]


def test_credit_purchases_migration_round_trip(sqlite_url):
    config = _alembic_config()
    previous = ScriptDirectory.from_config(config).get_revision(REVISION).down_revision
    engine = create_engine(sqlite_url)
    # Older migrations use PostgreSQL-only SQL, so build the schema they leave from the models
    # and run Alembic from the revision before this one.
    Base.metadata.create_all(
        engine, tables=[table for name, table in Base.metadata.tables.items() if name != TABLE]
    )
    command.stamp(config, previous)

    command.upgrade(config, REVISION)
    assert TABLE in _table_names(engine)
    assert _model_diffs(engine) == []
    unique = inspect(engine).get_unique_constraints(TABLE)
    assert [constraint["column_names"] for constraint in unique] == [["stripe_checkout_session_id"]]

    command.downgrade(config, previous)
    assert TABLE not in _table_names(engine)

    command.upgrade(config, REVISION)
    assert TABLE in _table_names(engine)
    engine.dispose()
