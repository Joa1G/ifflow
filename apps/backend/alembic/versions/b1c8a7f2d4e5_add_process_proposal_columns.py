"""add_process_proposal_columns

Revision ID: b1c8a7f2d4e5
Revises: 275be82388ad
Create Date: 2026-05-05 19:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c8a7f2d4e5"
down_revision: Union[str, Sequence[str], None] = "275be82388ad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add proposal-of-edit columns (B-30).

    Modelo "sombra-draft" (ver WIP_PUBLISHED_PROCESS_EDIT.md):
    - `processes.proposed_change_for` aponta do clone (DRAFT) para o
      processo PUBLISHED original. ON DELETE CASCADE: hard-delete do
      original tambem apaga propostas penduradas nele.
    - Unique partial index garante o invariant "uma proposta pendente por
      original" mesmo sob race entre dois POST simultaneos. Postgres e
      SQLite >=3.8 suportam partial indexes.
    - `flow_steps.cloned_from_step_id` e `step_resources.
      cloned_from_resource_id` sao "best-effort" (sem FK constraint): o
      id apontado pode sumir do original entre clonagem e merge — nesses
      casos o approve trata como step/resource novo.
    """
    op.add_column(
        "processes",
        sa.Column("proposed_change_for", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_processes_proposed_change_for",
        "processes",
        "processes",
        ["proposed_change_for"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_processes_proposed_change_for_unique",
        "processes",
        ["proposed_change_for"],
        unique=True,
        postgresql_where=sa.text("proposed_change_for IS NOT NULL"),
        sqlite_where=sa.text("proposed_change_for IS NOT NULL"),
    )
    op.add_column(
        "flow_steps",
        sa.Column("cloned_from_step_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "step_resources",
        sa.Column("cloned_from_resource_id", sa.Uuid(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("step_resources", "cloned_from_resource_id")
    op.drop_column("flow_steps", "cloned_from_step_id")
    op.drop_index(
        "ix_processes_proposed_change_for_unique",
        table_name="processes",
    )
    op.drop_constraint(
        "fk_processes_proposed_change_for",
        "processes",
        type_="foreignkey",
    )
    op.drop_column("processes", "proposed_change_for")
