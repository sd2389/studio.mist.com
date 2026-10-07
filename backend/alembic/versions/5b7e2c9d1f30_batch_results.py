"""batch results: a batch's archive, when its raw CAD files went, and files waiting to be deleted

Revision ID: 5b7e2c9d1f30
Revises: 343885745c98
Create Date: 2026-10-07 12:00:00.000000

ADR 0006 F3 gives a batch a ZIP archive of its outputs and deletes what it keeps for a while only.

- ingest_batches.archive_job_id and archive_expires_at: the batch_archive job whose parts
  archive_keys lists, and when those parts are deleted (14 days after they were made). The job's
  id tells one archive from the one that replaces it, so its parts' storage bytes are given back
  once.
- ingest_batches.sources_deleted_at: when the retention sweep took the batch's raw CAD files for
  deletion, 30 days after it finished (expires_at); its designs can't convert again from then on.
- storage_deletions: files nothing lists any more, queued in the transaction that lets them go
  and deleted after it, so a deletion that fails or never runs is tried again by the sweep.

Every existing batch gets nothing: no archive, its files not deleted. Downgrading drops the
columns and the table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5b7e2c9d1f30'
down_revision: Union[str, Sequence[str], None] = '343885745c98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns() -> tuple[sa.Column, ...]:
    """The new columns, made fresh for every use (a Column belongs to one table)."""
    return (
        sa.Column('archive_job_id', sa.Integer(), nullable=True),
        sa.Column('archive_expires_at', sa.DateTime(), nullable=True),
        sa.Column('sources_deleted_at', sa.DateTime(), nullable=True),
    )


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('ingest_batches') as batch:
        for column in _columns():
            batch.add_column(column)
    op.create_table(
        'storage_deletions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('key', sa.String(length=512), nullable=False),
        sa.Column('reason', sa.String(length=32), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('last_error', sa.String(length=1024), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('storage_deletions')
    with op.batch_alter_table('ingest_batches') as batch:
        for column in reversed(_columns()):
            batch.drop_column(column.name)
