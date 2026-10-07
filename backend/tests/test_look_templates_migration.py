"""The look templates migration adds the table of saved templates, one a scene for each owner, and
its downgrade takes it away again. Steps on SQLite."""

from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.models import User

REVISION = "7c70876cdcf2"
NOW = datetime(2026, 10, 6)


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def _insert_template(connection, template_id: int, scene_id: int | None) -> None:
    connection.execute(
        text(
            "INSERT INTO look_templates (id, user_id, name, template, source_scene_id, created_at, updated_at) "
            "VALUES (:id, 1, 'Look of R', '{}', :scene, :now, :now)"
        ),
        {"id": template_id, "scene": scene_id, "now": NOW},
    )


def test_the_look_templates_migration_round_trip(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)

    command.downgrade(config, previous_revision(REVISION))
    assert "look_templates" not in inspect(engine).get_table_names()

    command.upgrade(config, "head")
    assert model_diffs(engine) == []
    keys = {key["referred_table"]: key for key in inspect(engine).get_foreign_keys("look_templates")}
    assert (keys["users"]["constrained_columns"], keys["users"]["options"].get("ondelete")) == (["user_id"], "CASCADE")
    assert (keys["scenes"]["constrained_columns"], keys["scenes"]["options"].get("ondelete")) == (["source_scene_id"], "SET NULL")
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(id=1, email="a@example.com", password_hash="h", role="user"))
        _insert_template(connection, 1, 5)
        _insert_template(connection, 2, None)
        _insert_template(connection, 3, None)  # templates whose scenes are gone are many
    with pytest.raises(IntegrityError), engine.begin() as connection:
        _insert_template(connection, 4, 5)  # one template a scene

    command.downgrade(config, previous_revision(REVISION))
    assert "look_templates" not in inspect(engine).get_table_names()
    engine.dispose()
