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

- Every stored render plan's publish_media becomes false. The plan's default was true before
  F2 and no page offered the choice, so no customer picked it; F2 publishes media only when a plan
  asks, and the sweep above would otherwise copy those batches' outputs to the public bucket. The
  rest of each plan is kept as it was.

Every existing row gets nothing else: no link, nothing refunded, no public copy; the designs left
converted are started by the sweep, not here, since queuing a job checks its look as the app
does. Downgrading drops the index and the columns, and leaves the plans as they are.
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
_BATCHES = sa.table('ingest_batches', sa.column('id', sa.Integer), sa.column('render_plan', sa.JSON))
_PAGE = 500


def keep_media_private(connection: sa.engine.Connection) -> None:
    """Every stored render plan's publish_media made false, a page of batches at a time, the rest
    of each plan as it was. A batch with no plan has nothing to change."""
    last_id = 0
    while True:
        rows = connection.execute(
            sa.select(_BATCHES.c.id, _BATCHES.c.render_plan)
            .where(_BATCHES.c.id > last_id)
            .order_by(_BATCHES.c.id)
            .limit(_PAGE)
        ).all()
        if not rows:
            return
        for batch_id, plan in rows:
            if isinstance(plan, dict) and plan.get('publish_media') is not False:
                connection.execute(
                    sa.update(_BATCHES).where(_BATCHES.c.id == batch_id).values(render_plan={**plan, 'publish_media': False})
                )
        last_id = rows[-1].id


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
    keep_media_private(op.get_bind())


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_ingest_items_converted', table_name='ingest_items')
    for table, column in reversed(_columns()):
        with op.batch_alter_table(table) as batch:
            batch.drop_column(column.name)
