"""ingest batches and their designs, for bulk uploads

Revision ID: 09b522567b3b
Revises: f388c20848d8
Create Date: 2026-10-05 18:00:00.000000

A batch is the designs one customer drops at once, each a CAD file that a `convert` render job
turns into a scene (docs/adr/0006-bulk-pipeline.md). ingest_items reserves an in-progress
design's SKU across batches with a partial unique index. render_jobs.batch_id gets its foreign
key to the batches, and render_jobs.ingest_item_id names the design a job is for. Nothing made
batch jobs before, so a batch_id a smoke test may have left is cleared first.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '09b522567b3b'
down_revision: Union[str, Sequence[str], None] = 'f388c20848d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_IN_PROGRESS = sa.text("status NOT IN ('done', 'failed', 'skipped', 'canceled')")
_BATCH_FK = 'fk_render_jobs_batch_id_ingest_batches'
_ITEM_FK = 'fk_render_jobs_ingest_item_id_ingest_items'
_ITEM_INDEXES = [
    ('ix_ingest_items_batch_id_status', ['batch_id', 'status']),
    ('ix_ingest_items_batch_id_position', ['batch_id', 'position']),
    ('ix_ingest_items_scene_id', ['scene_id']),
]

_jobs = sa.table('render_jobs', sa.column('batch_id', sa.Integer))


def _create_batches() -> None:
    op.create_table(
        'ingest_batches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=24), nullable=False),
        sa.Column('source', sa.String(length=8), nullable=False),
        sa.Column('look_template', sa.JSON(), nullable=True),
        sa.Column('render_plan', sa.JSON(), nullable=True),
        sa.Column('options', sa.JSON(), nullable=False),
        sa.Column('item_count', sa.Integer(), nullable=False),
        sa.Column('total_bytes', sa.BigInteger(), nullable=False),
        sa.Column('render_credits_per_design', sa.Integer(), nullable=False),
        sa.Column('idempotency_key', sa.String(length=128), nullable=True),
        sa.Column('request_hash', sa.String(length=64), nullable=True),
        sa.Column('archive_keys', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ingest_batches_user_id_created_at', 'ingest_batches', ['user_id', 'created_at'])
    op.create_index(
        'uq_ingest_batches_user_id_idempotency_key', 'ingest_batches', ['user_id', 'idempotency_key'], unique=True
    )


def _create_items() -> None:
    op.create_table(
        'ingest_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('batch_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=512), nullable=False),
        sa.Column('source_key', sa.String(length=512), nullable=False),
        sa.Column('source_bytes', sa.BigInteger(), nullable=False),
        sa.Column('companions', sa.JSON(), nullable=False),
        sa.Column('sku', sa.String(length=128), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=128), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('units', sa.String(length=8), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('error', sa.String(length=1024), nullable=True),
        sa.Column('error_code', sa.String(length=32), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('scene_id', sa.Integer(), nullable=True),
        sa.Column('convert_job_id', sa.Integer(), nullable=True),
        sa.Column('model_credit_held', sa.SmallInteger(), nullable=False),
        sa.Column('render_credits_held', sa.Integer(), nullable=False),
        sa.Column('credits_period_start', sa.DateTime(), nullable=True),
        sa.Column('polygon_count', sa.Integer(), nullable=True),
        sa.Column('size_mm', sa.Float(), nullable=True),
        sa.Column('warnings', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['batch_id'], ['ingest_batches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['scene_id'], ['scenes.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['convert_job_id'], ['render_jobs.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    for name, columns in _ITEM_INDEXES:
        op.create_index(name, 'ingest_items', columns)
    op.create_index('uq_ingest_items_batch_id_sku', 'ingest_items', ['batch_id', 'sku'], unique=True)
    # A SKU is reserved while its design is in progress, in every batch; its scene holds it after.
    op.create_index(
        'uq_ingest_items_sku_in_progress', 'ingest_items', ['sku'], unique=True,
        postgresql_where=_IN_PROGRESS, sqlite_where=_IN_PROGRESS,
    )


def upgrade() -> None:
    """Upgrade schema."""
    _create_batches()
    _create_items()
    op.execute(sa.update(_jobs).where(_jobs.c.batch_id.is_not(None)).values(batch_id=None))
    # Batch mode, so SQLite (tests) adds foreign keys too.
    with op.batch_alter_table('render_jobs') as batch:
        batch.add_column(sa.Column('ingest_item_id', sa.Integer(), nullable=True))
        batch.create_foreign_key(_BATCH_FK, 'ingest_batches', ['batch_id'], ['id'], ondelete='SET NULL')
        batch.create_foreign_key(_ITEM_FK, 'ingest_items', ['ingest_item_id'], ['id'], ondelete='SET NULL')
        batch.create_index(batch.f('ix_render_jobs_ingest_item_id'), ['ingest_item_id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('render_jobs') as batch:
        batch.drop_index(batch.f('ix_render_jobs_ingest_item_id'))
        batch.drop_constraint(_ITEM_FK, type_='foreignkey')
        batch.drop_constraint(_BATCH_FK, type_='foreignkey')
        batch.drop_column('ingest_item_id')
    op.drop_table('ingest_items')
    op.drop_table('ingest_batches')
