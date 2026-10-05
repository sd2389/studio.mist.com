"""render job kinds, specs, looks and credit holds

Revision ID: 97e22f9d865b
Revises: f7e94879f642
Create Date: 2026-10-03 05:08:55.000000

Render jobs gain a kind, a spec, a frozen look and held credits (docs/adr/0005-server-exports.md).
Existing rows come from smoke tests only: they become stills whose width, height, preset and
lighting are copied into spec, watermarked as the owner's plan watermarks them today, and those
that completed were charged one credit. The old columns stay until the worker reads the new
payload (A2). Renders gain what job outputs need, and bytes becomes a bigint: a pack ZIP can
pass 2 GB.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '97e22f9d865b'
down_revision: Union[str, Sequence[str], None] = 'f7e94879f642'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RENDERS_JOB_FK = 'fk_renders_job_id_render_jobs'
_JOB_INDEXES = [
    ('ix_render_jobs_user_id_status', ['user_id', 'status']),
    ('ix_render_jobs_user_id_id', ['user_id', 'id']),
    ('ix_render_jobs_scene_id_created_at', ['scene_id', 'created_at']),
    ('ix_render_jobs_batch_id_status', ['batch_id', 'status']),
]


def _job_columns() -> list[sa.Column]:
    return [
        sa.Column('batch_id', sa.Integer(), nullable=True),
        sa.Column('kind', sa.String(length=24), nullable=False, server_default='still'),
        sa.Column('spec', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column('look', sa.JSON(), nullable=True),
        sa.Column('watermark', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('priority', sa.SmallInteger(), nullable=False, server_default='100'),
        sa.Column('max_running', sa.SmallInteger(), nullable=False, server_default='1'),
        sa.Column('max_attempts', sa.SmallInteger(), nullable=False, server_default='3'),
        sa.Column('run_after', sa.DateTime(), nullable=True),
        sa.Column('worker_id', sa.String(length=64), nullable=True),
        sa.Column('heartbeat_at', sa.DateTime(), nullable=True),
        sa.Column('progress', sa.Float(), nullable=False, server_default='0'),
        sa.Column('stage', sa.String(length=16), nullable=True),
        sa.Column('cancel_requested_at', sa.DateTime(), nullable=True),
        sa.Column('credits', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('credit_state', sa.String(length=12), nullable=False, server_default='none'),
        sa.Column('billing_period_start', sa.DateTime(), nullable=True),
        sa.Column('idempotency_key', sa.String(length=128), nullable=True),
        sa.Column('request_hash', sa.String(length=64), nullable=True),
        sa.Column('error_code', sa.String(length=32), nullable=True),
        sa.Column('renderer', sa.JSON(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
    ]


def _render_columns() -> list[sa.Column]:
    return [
        sa.Column('content_type', sa.String(length=64), nullable=True),
        sa.Column('filename', sa.String(length=255), nullable=True),
        sa.Column('label', sa.String(length=128), nullable=True),
        sa.Column('meta', sa.JSON(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
    ]


def _copy_settings_into_spec() -> None:
    """Existing rows are stills; their size and look settings move into the spec."""
    # SQLite (the migration's test) spells PostgreSQL's json_build_object json_object.
    build = 'json_build_object' if op.get_context().dialect.name == 'postgresql' else 'json_object'
    op.execute(
        f"UPDATE render_jobs SET spec = {build}("
        "'width', width, 'height', height, 'preset', preset, 'lighting', lighting)"
    )


def upgrade() -> None:
    """Upgrade schema."""
    for column in _job_columns():
        op.add_column('render_jobs', column)

    _copy_settings_into_spec()
    # Mirrors normalize_tier: only Grow and Studio export without the mark.
    op.execute(
        """
        UPDATE render_jobs SET watermark = false
        WHERE user_id IN (
            SELECT user_id FROM user_billing WHERE LOWER(TRIM(plan_tier)) IN ('grow', 'studio')
        )
        """
    )
    op.execute("UPDATE render_jobs SET credits = 1, credit_state = 'charged' WHERE status = 'completed'")

    op.create_index(
        'ix_render_jobs_claim', 'render_jobs', ['status', 'priority', 'created_at'],
        postgresql_where=sa.text("status = 'queued'"),
    )
    op.create_index(
        'ix_render_jobs_lease', 'render_jobs', ['status', 'lease_expires_at'],
        postgresql_where=sa.text("status = 'running'"),
    )
    for name, columns in _JOB_INDEXES:
        op.create_index(name, 'render_jobs', columns)
    op.create_index(
        'uq_render_jobs_user_id_idempotency_key', 'render_jobs', ['user_id', 'idempotency_key'], unique=True
    )

    # Batch mode, so SQLite (tests) can change a column's type and add a foreign key too.
    with op.batch_alter_table('renders') as batch:
        batch.add_column(sa.Column('job_id', sa.Integer(), nullable=True))
        for column in _render_columns():
            batch.add_column(column)
        batch.alter_column('bytes', type_=sa.BigInteger(), existing_type=sa.Integer(), existing_nullable=False)
        batch.create_foreign_key(_RENDERS_JOB_FK, 'render_jobs', ['job_id'], ['id'], ondelete='SET NULL')
        batch.create_index(batch.f('ix_renders_job_id'), ['job_id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('renders') as batch:
        batch.drop_index(batch.f('ix_renders_job_id'))
        batch.drop_constraint(_RENDERS_JOB_FK, type_='foreignkey')
        batch.drop_column('job_id')
        for column in _render_columns():
            batch.drop_column(column.name)
        batch.alter_column('bytes', type_=sa.Integer(), existing_type=sa.BigInteger(), existing_nullable=False)

    op.drop_index('uq_render_jobs_user_id_idempotency_key', table_name='render_jobs')
    for name, _ in _JOB_INDEXES:
        op.drop_index(name, table_name='render_jobs')
    op.drop_index('ix_render_jobs_lease', table_name='render_jobs')
    op.drop_index('ix_render_jobs_claim', table_name='render_jobs')
    for column in _job_columns():
        op.drop_column('render_jobs', column.name)
