"""Model FlowStep — etapa ordenada dentro de um Process.

Relacionamentos:
- process (N-1, FK CASCADE): etapas desaparecem quando o processo e deletado
  de verdade (diferente de ARCHIVED, que e soft delete).
- sector (N-1, FK RESTRICT): impede apagar um setor em uso e quebrar a
  visualizacao do fluxo. Quem quiser remover um setor precisa antes trocar
  as etapas para outro setor.
- resources (1-N, cascade delete-orphan).

Nota sobre o nome `order_index`: o SQL tem `ORDER BY` como palavra reservada.
Usar `order` como nome de coluna obriga quoting e cria ambiguidade em querys
— `order_index` deixa explicito que e o indice ordinal da etapa no fluxo.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey
from sqlmodel import Field, Relationship, SQLModel


class FlowStep(SQLModel, table=True):
    __tablename__ = "flow_steps"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    process_id: UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("processes.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    sector_id: UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("sectors.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    order_index: int = Field(nullable=False)
    title: str = Field(max_length=255, nullable=False)
    description: str = Field(sa_column=Column(sa.Text(), nullable=False))
    responsible: str = Field(max_length=255, nullable=False)
    estimated_time: str = Field(max_length=100, nullable=False)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    process: "Process" = Relationship(back_populates="steps")  # noqa: F821
    sector: "Sector" = Relationship(back_populates="steps")  # noqa: F821
    resources: list["StepResource"] = Relationship(  # noqa: F821
        back_populates="step",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
