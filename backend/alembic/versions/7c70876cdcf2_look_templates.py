"""look templates: a customer's saved looks by slot role, for bulk uploads

Revision ID: 7c70876cdcf2
Revises: 09b522567b3b
Create Date: 2026-10-06 22:00:00.000000

A look template names materials by slot role (metal, gem, accent), with the lighting, finish and
scene settings, made from one of its owner's scenes (docs/adr/0006-bulk-pipeline.md, "Look
templates by slot role"). A batch that picks one keeps a checked copy in
ingest_batches.look_template, so changing or losing the template changes no batch. One template a
scene: making it again from the same scene updates it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7c70876cdcf2'
down_revision: Union[str, Sequence[str], None] = '09b522567b3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'look_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('template', sa.JSON(), nullable=False),
        sa.Column('source_scene_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_scene_id'], ['scenes.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_look_templates_user_id_updated_at', 'look_templates', ['user_id', 'updated_at'])
    op.create_index(
        'uq_look_templates_user_id_source_scene_id', 'look_templates', ['user_id', 'source_scene_id'], unique=True
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_look_templates_user_id_source_scene_id', table_name='look_templates')
    op.drop_index('ix_look_templates_user_id_updated_at', table_name='look_templates')
    op.drop_table('look_templates')
