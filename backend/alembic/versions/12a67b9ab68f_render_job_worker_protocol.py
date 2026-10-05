"""render jobs: the worker protocol reads specs and looks, not the old columns

Revision ID: 12a67b9ab68f
Revises: 97e22f9d865b
Create Date: 2026-10-05 11:20:00.000000

Workers now render a job from its kind, spec and frozen look (docs/adr/0005-server-exports.md,
A2), so the columns the old protocol read go: model_ref, lighting, preset, width, height and
result_key. A job's output names move from spec.outputs to spec.output_names, the name the
harness reads them by. Unfinished rows from before A1 (smoke tests, without a look) can't be
rendered any more: they end failed. They held no credits.

A downgrade puts the columns back, filled from the spec, the look, the scene and the job's first
output, and moves the names back; the rows this ended stay failed.
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '12a67b9ab68f'
down_revision: Union[str, Sequence[str], None] = '97e22f9d865b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_OLD_COLUMNS = ('model_ref', 'lighting', 'preset', 'width', 'height', 'result_key')
_REQUIRED_OLD_COLUMNS = {
    'model_ref': sa.String(length=1024),
    'lighting': sa.String(length=32),
    'preset': sa.String(length=64),
    'width': sa.Integer(),
    'height': sa.Integer(),
}

# The columns the data steps touch, typed so JSON reads and writes the same on every database.
_jobs = sa.table(
    'render_jobs',
    sa.column('id', sa.Integer),
    sa.column('scene_id', sa.Integer),
    sa.column('status', sa.String),
    sa.column('spec', sa.JSON),
    sa.column('look', sa.JSON),
    sa.column('error', sa.String),
    sa.column('error_code', sa.String),
    sa.column('finished_at', sa.DateTime),
    sa.column('updated_at', sa.DateTime),
    sa.column('model_ref', sa.String),
    sa.column('lighting', sa.String),
    sa.column('preset', sa.String),
    sa.column('width', sa.Integer),
    sa.column('height', sa.Integer),
    sa.column('result_key', sa.String),
)
_scenes = sa.table('scenes', sa.column('id', sa.Integer), sa.column('model_key', sa.String))
_renders = sa.table('renders', sa.column('id', sa.Integer), sa.column('job_id', sa.Integer), sa.column('key', sa.String))


def _rename_spec_key(old: str, new: str) -> None:
    connection = op.get_bind()
    for row in connection.execute(sa.select(_jobs.c.id, _jobs.c.spec)).all():
        if isinstance(row.spec, dict) and old in row.spec:
            spec = {(new if key == old else key): value for key, value in row.spec.items()}
            connection.execute(sa.update(_jobs).where(_jobs.c.id == row.id).values(spec=spec))


def _end_unrenderable_rows() -> None:
    now = datetime.utcnow()
    op.execute(
        sa.update(_jobs)
        .where(_jobs.c.look.is_(None), _jobs.c.status.in_(('queued', 'running')))
        .values(
            status='failed',
            error='made for the render protocol before ADR 0005; create the job again',
            error_code='invalid_spec',
            finished_at=now,
            updated_at=now,
        )
    )


def upgrade() -> None:
    """Upgrade schema."""
    _rename_spec_key('outputs', 'output_names')
    _end_unrenderable_rows()
    # Batch mode, so SQLite (tests) drops columns too.
    with op.batch_alter_table('render_jobs') as batch:
        for name in _OLD_COLUMNS:
            batch.drop_column(name)


def _restore_old_columns() -> None:
    """The old columns' values, from what replaced them."""
    connection = op.get_bind()
    connection.execute(
        sa.update(_jobs).values(
            model_ref=sa.func.coalesce(
                sa.select(_scenes.c.model_key).where(_scenes.c.id == _jobs.c.scene_id).scalar_subquery(), ''
            ),
            result_key=sa.select(_renders.c.key)
            .where(_renders.c.job_id == _jobs.c.id)
            .order_by(_renders.c.id)
            .limit(1)
            .scalar_subquery(),
        )
    )
    for row in connection.execute(sa.select(_jobs.c.id, _jobs.c.spec, _jobs.c.look)).all():
        spec, look = row.spec or {}, row.look or {}
        connection.execute(
            sa.update(_jobs)
            .where(_jobs.c.id == row.id)
            .values(
                lighting=look.get('lighting') or spec.get('lighting') or 'studio',
                preset=look.get('material') or spec.get('preset') or 'gold-18k-yellow',
                width=spec.get('width') or 2048,
                height=spec.get('height') or 2048,
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('render_jobs') as batch:
        for name, type_ in _REQUIRED_OLD_COLUMNS.items():
            batch.add_column(sa.Column(name, type_, nullable=True))
        batch.add_column(sa.Column('result_key', sa.String(length=512), nullable=True))
    _restore_old_columns()
    with op.batch_alter_table('render_jobs') as batch:
        for name, type_ in _REQUIRED_OLD_COLUMNS.items():
            batch.alter_column(name, existing_type=type_, nullable=False)
    _rename_spec_key('output_names', 'outputs')
