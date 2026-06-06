"""User billing, Stripe ledger, and profile phone.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-06 23:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(length=32), nullable=True))

    op.create_table(
        "user_billing",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plan_tier", sa.String(length=32), nullable=False, server_default="free"),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("period_start", sa.DateTime(), nullable=True),
        sa.Column("period_end", sa.DateTime(), nullable=True),
        sa.Column("model_credits_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ai_image_credits_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("custom_material_credits_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("custom_asset_credits_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("storage_bytes_used", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_user_billing_user_id", "user_billing", ["user_id"], unique=True)
    op.create_index("ix_user_billing_stripe_customer_id", "user_billing", ["stripe_customer_id"])

    op.create_table(
        "billing_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("stripe_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_event_id"),
    )
    op.create_index("ix_billing_events_stripe_event_id", "billing_events", ["stripe_event_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_billing_events_stripe_event_id", table_name="billing_events")
    op.drop_table("billing_events")
    op.drop_index("ix_user_billing_stripe_customer_id", table_name="user_billing")
    op.drop_index("ix_user_billing_user_id", table_name="user_billing")
    op.drop_table("user_billing")
    op.drop_column("users", "phone")
