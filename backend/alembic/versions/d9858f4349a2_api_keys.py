"""api keys: keys for the customer API, stored as a peppered hash

Revision ID: d9858f4349a2
Revises: 343885745c98
Create Date: 2026-10-07 11:00:00.000000

Each key belongs to a user and acts as them on /v1 only (docs/adr/0006-bulk-pipeline.md, "The
customer API"). The table keeps the key's prefix, unique and not secret, and an HMAC-SHA-256 of the
whole key; never the key. Deleting the user deletes their keys.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd9858f4349a2'
down_revision: Union[str, Sequence[str], None] = '343885745c98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'api_keys',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('prefix', sa.String(length=8), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('scopes', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_api_keys_user_id_created_at', 'api_keys', ['user_id', 'created_at'])
    op.create_index('uq_api_keys_prefix', 'api_keys', ['prefix'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_api_keys_prefix', table_name='api_keys')
    op.drop_index('ix_api_keys_user_id_created_at', table_name='api_keys')
    op.drop_table('api_keys')
