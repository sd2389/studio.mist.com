"""render plans: a design's embed link, what it was refunded, its outputs' public copies, and the designs left converted

Revision ID: 343885745c98
Revises: 7c70876cdcf2
Create Date: 2026-10-07 09:00:00.000000

ADR 0006 F2 renders a batch's plan for each design once its scene is made.

- ingest_items.embed_url: the piece's embed link, APP_PUBLIC_URL/embed/<SKU>, kept once its scene
  holds the SKU, so the batch's manifest (F3) lists it.
- ingest_items.model_credits_refunded and render_credits_refunded: what a design was given back
  every time it failed or was canceled, which with its jobs' refunds is the batch's refunded
  credits.
- renders.public_key: an output's copy in the public bucket
  (published/<user>/<sku>/media/<job>/<file>) when its batch publishes media.
- ix_ingest_items_converted, partial on status = 'converted': a design whose conversion completed
  before this ran stayed converted, its render credits held and no render job queued, since only
  a conversion's completion queued them. The sweep every worker claim makes
  (app/features/ingest/renders.py, resume_converted_designs) finds such designs by this index and
  queues their jobs once, moving their held credits onto them as a conversion would have. From
  now on a design is converted only inside its conversion's commit, so the index stays empty.

Every existing row gets nothing: no link, nothing refunded, no public copy; the designs left
converted are started by the sweep, not here, since queuing a job checks its look as the app
does. Downgrading drops the index and the columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '343885745c98'
down_revision: Union[str, Sequence[str], None] = '7c70876cdcf2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONVERTED = sa.text("status = 'converted'")


def _columns() -> tuple[tuple[str, sa.Column], ...]:
    """Each table and its new column, made fresh for every use (a Column belongs to one table)."""
    return (
        ('ingest_items', sa.Column('model_credits_refunded', sa.SmallInteger(), nullable=False, server_default='0')),
        ('ingest_items', sa.Column('render_credits_refunded', sa.Integer(), nullable=False, server_default='0')),
        ('ingest_items', sa.Column('embed_url', sa.String(length=512), nullable=True)),
        ('renders', sa.Column('public_key', sa.String(length=512), nullable=True)),
    )


def upgrade() -> None:
    """Upgrade schema."""
    for table, column in _columns():
        with op.batch_alter_table(table) as batch:
            batch.add_column(column)
    op.create_index(
        'ix_ingest_items_converted', 'ingest_items', ['id'], postgresql_where=_CONVERTED, sqlite_where=_CONVERTED
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_ingest_items_converted', table_name='ingest_items')
    for table, column in reversed(_columns()):
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column.name)
