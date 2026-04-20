"""Model Process — processo administrativo publicavel.

Fluxo de estados: DRAFT -> IN_REVIEW -> PUBLISHED -> ARCHIVED. Apenas
PUBLISHED aparece nas listagens publicas (B-19/B-20). ARCHIVED e soft delete
(ADR-007): preserva o progresso dos usuarios que ja estavam acompanhando.

FKs:
- `created_by` (User, NOT NULL, ON DELETE RESTRICT): preservar autoria e
  bloquear delete de admin com processos pendurados. A remocao LGPD de uma
  conta admin precisa antes transferir autoria (tratado em task futura).
- `approved_by` (User, NULLABLE, ON DELETE SET NULL): aprovador pode sumir
  sem invalidar a publicacao — o registro de quem aprovou e informacional.

`requirements` e um JSON array de strings (ADR-006). `access_count` comeca
em 0 e so incrementa em GET de detalhe (ADR-008).
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import JSON, Column, ForeignKey, String
from sqlmodel import Field, Relationship, SQLModel

from app.core.enums import ProcessCategory, ProcessStatus


class Process(SQLModel, table=True):
    __tablename__ = "processes"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str = Field(sa_column=Column(String(255), index=True, nullable=False))
    short_description: str = Field(max_length=500, nullable=False)
    # TEXT — sem limite de tamanho. O full_description pode conter markdown
    # longo escrito pelo admin no editor.
    full_description: str = Field(sa_column=Column(sa.Text(), nullable=False))
    category: ProcessCategory = Field(index=True, nullable=False)
    estimated_time: str = Field(max_length=100, nullable=False)
    # JSON array de strings (ADR-006). server_default="[]" garante que linhas
    # antigas criadas antes de preencher o campo ganhem lista vazia em vez
    # de NULL, simplificando as queries do MVP.
    requirements: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    access_count: int = Field(default=0, nullable=False)
    status: ProcessStatus = Field(
        default=ProcessStatus.DRAFT, index=True, nullable=False
    )
    created_by: UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )
    )
    approved_by: UUID | None = Field(
        default=None,
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # cascade="all, delete-orphan" garante o comportamento de DELETE em cascade
    # mesmo sob SQLite (onde ondelete=CASCADE do banco so funciona com PRAGMA
    # foreign_keys=ON). Em Postgres o ondelete do FK e a fonte primaria; aqui
    # a camada ORM e cinto + suspensorio.
    steps: list["FlowStep"] = Relationship(  # noqa: F821
        back_populates="process",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
