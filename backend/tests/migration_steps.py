"""Stepping the render job and ingest migrations on SQLite.

Older migrations use PostgreSQL-only SQL, so a test builds the schema the models describe (the
head), stamps it, and steps down to the revision it checks.
"""

from pathlib import Path
from types import SimpleNamespace

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, create_engine, inspect

import app.config
from app.models import Base

ALEMBIC_DIR = Path(__file__).resolve().parent.parent / "alembic"
TABLES = ("render_jobs", "renders", "ingest_batches", "ingest_items")


def point_alembic_at(url: str, monkeypatch) -> None:
    """alembic/env.py takes the database URL from the settings: point it at this database only."""
    monkeypatch.setattr(app.config, "get_settings", lambda: SimpleNamespace(database_url=url))


def alembic_config() -> Config:
    config = Config()  # no ini file, so env.py leaves the test run's logging alone
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    return config


def previous_revision(revision: str) -> str:
    return ScriptDirectory.from_config(alembic_config()).get_revision(revision).down_revision


def schema_at_head(url: str) -> Engine:
    """A database with the models' schema, stamped at the head revision."""
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    command.stamp(alembic_config(), "head")
    return engine


def columns(engine: Engine, table: str) -> set[str]:
    return {column["name"] for column in inspect(engine).get_columns(table)}


def model_diffs(engine: Engine, tables: tuple[str, ...] = TABLES) -> list:
    """How these tables (the render job and ingest ones unless told) differ from what the models describe."""
    with engine.connect() as connection:
        diffs = compare_metadata(
            MigrationContext.configure(connection, opts={"compare_type": True}), Base.metadata
        )
    return [diff for diff in diffs if any(table in repr(diff) for table in tables)]
