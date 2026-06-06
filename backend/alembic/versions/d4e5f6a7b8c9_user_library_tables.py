"""User library tables — custom materials and uploaded assets.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-06 20:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_materials",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("slug", sa.String(length=96), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("category", sa.String(length=32), nullable=True),
        sa.Column("family", sa.String(length=48), nullable=True),
        sa.Column("gem_family", sa.String(length=48), nullable=True),
        sa.Column("swatch_key", sa.String(length=512), nullable=True),
        sa.Column("sort_weight", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "slug", name="uq_user_materials_user_slug"),
    )
    op.create_index("ix_user_materials_user_kind", "user_materials", ["user_id", "kind"])

    op.create_table(
        "user_assets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("asset_type", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("preview_key", sa.String(length=512), nullable=True),
        sa.Column("mime_type", sa.String(length=64), nullable=True),
        sa.Column("byte_size", sa.BigInteger(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "storage_key", name="uq_user_assets_user_key"),
    )
    op.create_index("ix_user_assets_user_type", "user_assets", ["user_id", "asset_type"])


def downgrade() -> None:
    op.drop_index("ix_user_assets_user_type", table_name="user_assets")
    op.drop_table("user_assets")
    op.drop_index("ix_user_materials_user_kind", table_name="user_materials")
    op.drop_table("user_materials")
