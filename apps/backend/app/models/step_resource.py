"""Model StepResource — anexo de uma FlowStep (documento, base legal, POP, link).

Um resource tem `url` OU `content` (ou os dois). `content` existe para textos
curtos inline (ex: excerto de lei), enquanto `url` aponta para algo externo
(formulario, POP). Ambos sao nullable porque os admins podem criar um LINK
so com url e um LEGAL_BASIS so com content.

FK step_id com ON DELETE CASCADE — recurso orfao nao faz sentido.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import Column, ForeignKey
from sqlmodel import Field, Relationship, SQLModel

from app.core.enums import ResourceType


class StepResource(SQLModel, table=True):
    __tablename__ = "step_resources"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    step_id: UUID = Field(
        sa_column=Column(
            sa.Uuid(),
            ForeignKey("flow_steps.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    type: ResourceType = Field(nullable=False)
    title: str = Field(max_length=255, nullable=False)
    url: str | None = Field(default=None, max_length=2048, nullable=True)
    content: str | None = Field(
        default=None,
        sa_column=Column(sa.Text(), nullable=True),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    step: "FlowStep" = Relationship(back_populates="resources")  # noqa: F821
