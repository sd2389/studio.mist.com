"""credit purchases

Revision ID: 81a7e50047d5
Revises: f13380ac830a
Create Date: 2026-10-02 21:00:00.000000

A ledger of paid top-ups: one row per Stripe Checkout Session that added
credits, written with the balance change. The unique session id keeps a
replayed webhook from adding the same purchase twice. Top-ups bought before
this table existed are only in Stripe.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '81a7e50047d5'
down_revision: Union[str, Sequence[str], None] = 'f13380ac830a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'credit_purchases',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('credits', sa.Integer(), nullable=False),
        sa.Column('stripe_checkout_session_id', sa.String(length=255), nullable=False),
        sa.Column('stripe_event_id', sa.String(length=255), nullable=False),
        sa.Column('amount_total', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('stripe_checkout_session_id'),
    )
    op.create_index('ix_credit_purchases_user_id', 'credit_purchases', ['user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_credit_purchases_user_id', table_name='credit_purchases')
    op.drop_table('credit_purchases')
