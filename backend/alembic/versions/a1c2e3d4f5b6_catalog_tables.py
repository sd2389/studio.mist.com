"""catalog tables (metals, gems, environments, backgrounds, grounds, scene presets)

Revision ID: a1c2e3d4f5b6
Revises: 4f2ab6d72b31
Create Date: 2026-06-06 00:45:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c2e3d4f5b6"
down_revision: Union[str, Sequence[str], None] = "4f2ab6d72b31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _shared_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=96), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("sort_weight", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("swatch_key", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    ]


def _create(table: str, *extra: sa.Column) -> None:
    op.create_table(table, *_shared_columns(), *extra)
    op.create_index(f"ix_{table}_slug", table, ["slug"], unique=True)


def upgrade() -> None:
    _create(
        "catalog_metals",
        sa.Column("category", sa.String(length=32), nullable=False, server_default="metal"),
        sa.Column("family", sa.String(length=48), nullable=False, server_default="gold"),
    )
    op.create_index("ix_catalog_metals_category", "catalog_metals", ["category"])
    op.create_index("ix_catalog_metals_family", "catalog_metals", ["family"])

    _create(
        "catalog_gems",
        sa.Column("gem_family", sa.String(length=48), nullable=False, server_default="diamond"),
    )
    op.create_index("ix_catalog_gems_gem_family", "catalog_gems", ["gem_family"])

    _create(
        "catalog_environments",
        sa.Column("env_type", sa.String(length=32), nullable=False, server_default="metal_env"),
        sa.Column("master_key", sa.String(length=512), nullable=True),
        sa.Column("preview_key", sa.String(length=512), nullable=True),
        sa.Column("default_rotation", sa.Float(), nullable=False, server_default=sa.text("0")),
        sa.Column("default_intensity", sa.Float(), nullable=False, server_default=sa.text("1")),
    )
    op.create_index("ix_catalog_environments_env_type", "catalog_environments", ["env_type"])

    _create(
        "catalog_backgrounds",
        sa.Column("is_transparent", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    _create("catalog_grounds")
    _create("catalog_scene_presets")


def downgrade() -> None:
    op.drop_table("catalog_scene_presets")
    op.drop_table("catalog_grounds")
    op.drop_table("catalog_backgrounds")
    op.drop_index("ix_catalog_environments_env_type", table_name="catalog_environments")
    op.drop_table("catalog_environments")
    op.drop_index("ix_catalog_gems_gem_family", table_name="catalog_gems")
    op.drop_table("catalog_gems")
    op.drop_index("ix_catalog_metals_family", table_name="catalog_metals")
    op.drop_index("ix_catalog_metals_category", table_name="catalog_metals")
    op.drop_table("catalog_metals")
