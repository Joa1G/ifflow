"""Model UserProgress — checklist pessoal de um usuario num processo.

Uma linha representa o acompanhamento individual de UM usuario em UM
processo. O unique constraint em (user_id, process_id) garante que o
servico (B-23) possa usar get-or-create sem duplicar progressos: a
primeira chamada cria, as seguintes apenas lem e atualizam.

ADR-005: `step_statuses` e um dict {step_id: status} em JSONB, nao uma
tabela user_step_status. Para o MVP (<15 etapas por processo), isso evita
N joins por GET e permite update atomico do progresso em uma query. No
SQLite dos testes o JSONB degrada para JSON — o `with_variant` cobre isso
sem vazar o tipo especifico de dialeto no resto do codigo.

ADR-007: cascade delete em `user_id` (LGPD: quando o usuario apaga a conta,
o progresso vai junto) e em `process_id` (se um processo sair do banco de
verdade — hoje so acontece em limpeza futura, ja que usamos soft-delete
via ARCHIVED —, nao queremos registros orfaos).

REQ-102: este progresso NAO altera o processo real no SIPAC. E apenas
organizacao pessoal do usuario — a regra vive na UI (ver DESIGN_SYSTEM e
textos do frontend), mas o model aqui e o lugar onde o estado e
persistido.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import JSON, Column, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class UserProgress(SQLModel, table=True):
    __tablename__ = "user_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "process_id", name="uq_user_progress_user_process"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    process_id: UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("processes.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    # JSONB no Postgres (permite operadores de JSON path/indice GIN se for
    # necessario no futuro); JSON no SQLite usado nos testes. O valor em
    # cada chave e um dos status definidos em B-24: PENDING | IN_PROGRESS
    # | COMPLETED. A validacao desses strings e responsabilidade do
    # service/schema — no model ficam como str para nao acoplar o model a
    # um enum que ainda nao existe.
    step_statuses: dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(
            JSONB().with_variant(JSON(), "sqlite"),
            nullable=False,
            server_default="{}",
        ),
    )
    last_updated: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
