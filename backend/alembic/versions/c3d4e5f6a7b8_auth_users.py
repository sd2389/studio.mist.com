"""Auth + users tables; Scene.user_id FK to users (non-null).

Revision ID: c3d4e5f6a7b8
Revises: b2d3e4f5a6c7
Create Date: 2026-06-06 18:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from datetime import datetime

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2d3e4f5a6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LEGACY_EMAIL = "legacy@system.local"
LEGACY_PASSWORD_HASH = "$2b$12$legacy.placeholder.hash.for.system.user.only"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sessions_token", "sessions", ["token"], unique=True)

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_reset_tokens_token", "password_reset_tokens", ["token"], unique=True)

    op.create_table(
        "contact_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    now = datetime.utcnow().isoformat(sep=" ", timespec="seconds")
    op.execute(
        sa.text(
            "INSERT INTO users (id, email, password_hash, name, is_active, created_at, updated_at) "
            f"VALUES (1, '{LEGACY_EMAIL}', '{LEGACY_PASSWORD_HASH}', 'Legacy', false, "
            f"'{now}', '{now}')"
        )
    )

    op.drop_column("scenes", "user_id")
    op.add_column("scenes", sa.Column("user_id", sa.Integer(), nullable=False, server_default="1"))
    op.create_foreign_key("fk_scenes_user_id", "scenes", "users", ["user_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_scenes_user_id", "scenes", ["user_id"])
    op.alter_column("scenes", "user_id", server_default=None)
    op.execute(sa.text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users))"))


def downgrade() -> None:
    op.drop_constraint("fk_scenes_user_id", "scenes", type_="foreignkey")
    op.drop_index("ix_scenes_user_id", table_name="scenes")
    op.drop_column("scenes", "user_id")
    op.add_column("scenes", sa.Column("user_id", sa.String(length=128), nullable=True))

    op.drop_table("contact_messages")
    op.drop_index("ix_password_reset_tokens_token", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_index("ix_sessions_token", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
