"""The plan and bought credits migration: its columns, and a backfill on hand-built rows that keeps
bought credits apart in the customer's favour; its downgrade takes the columns away and leaves the
balances as they were. Steps on SQLite."""

from datetime import datetime

import pytest
from alembic import command
from migration_steps import alembic_config, columns, model_diffs, point_alembic_at, previous_revision, schema_at_head
from sqlalchemy import text

from app.models import CreditPurchase, User

REVISION = "270d79dd4b52"
SEPTEMBER, OCTOBER = datetime(2026, 9, 1), datetime(2026, 10, 1)
NOW = datetime(2026, 10, 6)
BILLING_COLUMNS = {"bought_model_credits", "bought_ai_image_credits", "bought_render_credits", "allowance_granted_for"}
TABLES = ("user_billing", "render_jobs", "ingest_items")


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch) -> str:
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    point_alembic_at(url, monkeypatch)
    return url


def _account(connection, user_id: int, *, tier: str, period: datetime | None, subscription: str | None,
             model: int, ai: int, render: int) -> None:
    connection.execute(User.__table__.insert().values(id=user_id, email=f"u{user_id}@example.com", password_hash="h", role="user"))
    connection.execute(
        text(
            "INSERT INTO user_billing (id, user_id, plan_tier, stripe_subscription_id, period_start, "
            "model_credits_balance, ai_image_credits_balance, render_credits_balance, "
            "custom_material_credits_balance, custom_asset_credits_balance, storage_bytes_used, created_at, updated_at) "
            "VALUES (:id, :id, :tier, :subscription, :period, :model, :ai, :render, 5, 5, 0, :now, :now)"
        ),
        {"id": user_id, "tier": tier, "subscription": subscription, "period": period,
         "model": model, "ai": ai, "render": render, "now": NOW},
    )


def _bought(connection, user_id: int, kind: str, credits: int, at: datetime) -> None:
    connection.execute(
        CreditPurchase.__table__.insert().values(
            user_id=user_id, kind=kind, credits=credits, stripe_checkout_session_id=f"cs_{user_id}_{kind}_{at:%m%d%H%M}",
            stripe_event_id="evt", created_at=at,
        )
    )


def _design(connection, item_id: int, user_id: int, *, model: int, render: int, period: datetime | None) -> None:
    connection.execute(
        text(
            "INSERT OR IGNORE INTO ingest_batches (id, user_id, name, status, source, options, item_count, "
            "total_bytes, render_credits_per_design, created_at, updated_at) "
            "VALUES (:user, :user, 'Rings', 'processing', 'studio', '{}', 3, 10, 4, :now, :now)"
        ),
        {"user": user_id, "now": NOW},
    )
    connection.execute(
        text(
            "INSERT INTO ingest_items (id, batch_id, user_id, position, filename, source_key, source_bytes, "
            "companions, sku, name, category, units, status, attempts, model_credit_held, render_credits_held, "
            "credits_period_start, warnings, created_at, updated_at) VALUES (:id, :user, :user, :id, 'r.stl', 'k', "
            "10, '[]', :sku, 'R', 'Ring', 'auto', 'converting', 0, :model, :render, :period, '[]', :now, :now)"
        ),
        {"id": item_id, "user": user_id, "sku": f"R-{item_id}", "model": model, "render": render, "period": period, "now": NOW},
    )


def _job(connection, job_id: int, user_id: int, *, credits: int, state: str, period: datetime | None) -> None:
    connection.execute(
        text(
            "INSERT INTO render_jobs (id, user_id, kind, spec, watermark, priority, max_running, status, attempts, "
            "max_attempts, worker_token, progress, credits, credit_state, billing_period_start, created_at, updated_at) "
            "VALUES (:id, :user, 'still', '{}', 0, 100, 1, 'queued', 0, 3, 't', 0, :credits, :state, :period, :now, :now)"
        ),
        {"id": job_id, "user": user_id, "credits": credits, "state": state, "period": period, "now": NOW},
    )


def _rows(engine, sql: str) -> dict:
    with engine.connect() as connection:
        return {row[0]: tuple(row[1:]) for row in connection.execute(text(sql))}


def test_the_backfill_keeps_bought_credits_apart_in_the_customers_favour(sqlite_url):
    config = alembic_config()
    engine = schema_at_head(sqlite_url)
    command.downgrade(config, previous_revision(REVISION))
    assert BILLING_COLUMNS.isdisjoint(columns(engine, "user_billing"))
    with engine.begin() as connection:
        # 1: Free, no period. Every top-up counts; spending took Free's 25 AI credits, then 10 bought.
        _account(connection, 1, tier="free", period=None, subscription=None, model=13, ai=40, render=25)
        _bought(connection, 1, "model", 10, datetime(2026, 8, 1))
        _bought(connection, 1, "ai", 50, datetime(2026, 9, 10))
        # 2: Grow since 1 October. September's top-up went with that period's reset; one bought at
        # the very start of the period counts.
        _account(connection, 2, tier="grow", period=OCTOBER, subscription="sub_2", model=80, ai=120, render=300)
        _bought(connection, 2, "model", 25, datetime(2026, 9, 15))
        _bought(connection, 2, "model", 10, datetime(2026, 10, 3))
        _bought(connection, 2, "ai", 50, OCTOBER)
        # 3: 10 model credits bought this period and 4 left, all bought; of the 6 bought ones spent,
        # the designs still holding one this period get them back as bought, newest first.
        _account(connection, 3, tier="studio", period=OCTOBER, subscription="sub_3", model=4, ai=500, render=1500)
        _bought(connection, 3, "model", 10, datetime(2026, 10, 2))
        _design(connection, 31, 3, model=1, render=4, period=OCTOBER)
        _design(connection, 32, 3, model=1, render=0, period=SEPTEMBER)  # an earlier period's hold
        _design(connection, 33, 3, model=1, render=4, period=OCTOBER)
        # 4: 30 render credits bought, 10 left; the 20 spent went to its holds, designs then jobs.
        _account(connection, 4, tier="grow", period=OCTOBER, subscription="sub_4", model=75, ai=150, render=10)
        _bought(connection, 4, "render", 30, datetime(2026, 10, 2))
        _design(connection, 41, 4, model=0, render=4, period=OCTOBER)
        _job(connection, 1, 4, credits=12, state="held", period=OCTOBER)
        _job(connection, 2, 4, credits=6, state="held", period=OCTOBER)
        _job(connection, 3, 4, credits=5, state="charged", period=OCTOBER)
        _job(connection, 4, 4, credits=4, state="held", period=SEPTEMBER)
        # 5: a paid account whose period was never stored (the webhook before #49): every top-up counts.
        _account(connection, 5, tier="grow", period=None, subscription="sub_5", model=70, ai=150, render=300)
        _bought(connection, 5, "model", 25, datetime(2026, 8, 20))

    command.upgrade(config, "head")

    assert model_diffs(engine, TABLES) == []
    assert _rows(
        engine,
        "SELECT user_id, bought_model_credits, bought_ai_image_credits, bought_render_credits, allowance_granted_for "
        "FROM user_billing",
    ) == {
        1: (10, 40, 0, "free"),
        2: (10, 50, 0, None),
        3: (4, 0, 0, None),
        4: (0, 0, 10, None),
        5: (25, 0, 0, None),
    }
    assert _rows(engine, "SELECT id, bought_model_credit_held, bought_render_credits_held FROM ingest_items") == {
        31: (1, 0),
        32: (0, 0),
        33: (1, 0),
        41: (0, 4),
    }
    assert _rows(engine, "SELECT id, bought_credits FROM render_jobs") == {1: (10,), 2: (6,), 3: (0,), 4: (0,)}

    command.downgrade(config, previous_revision(REVISION))
    assert BILLING_COLUMNS.isdisjoint(columns(engine, "user_billing"))
    assert "bought_credits" not in columns(engine, "render_jobs")
    assert {"bought_model_credit_held", "bought_render_credits_held"}.isdisjoint(columns(engine, "ingest_items"))
    assert _rows(engine, "SELECT user_id, model_credits_balance, ai_image_credits_balance, render_credits_balance FROM user_billing") == {
        1: (13, 40, 25),
        2: (80, 120, 300),
        3: (4, 500, 1500),
        4: (75, 150, 10),
        5: (70, 150, 300),
    }
    engine.dispose()
