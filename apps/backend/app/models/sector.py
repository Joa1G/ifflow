"""Model Sector — setor institucional usado para agrupar etapas em swimlanes.

Exemplos: "PROAD", "DGP", "DCF". Deletar um Sector em uso derruba (ou deveria
derrubar, no Postgres) a operacao via ON DELETE RESTRICT — o relacionamento
reverso `steps` ajuda o ORM a detectar uso antes de tentar o DELETE.
"""

from uuid import UUID, uuid4

from sqlalchemy import Column, String
from sqlmodel import Field, Relationship, SQLModel


class Sector(SQLModel, table=True):
    __tablename__ = "sectors"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=255, nullable=False)
    # Acronym e a sigla curta exibida em badges ("PROAD", "DGP"). Unique
    # porque a equipe quer poder referenciar um setor pela sigla sem
    # ambiguidade (e impede duplicatas acidentais no seed).
    acronym: str = Field(
        sa_column=Column(String(20), unique=True, index=True, nullable=False)
    )

    steps: list["FlowStep"] = Relationship(back_populates="sector")  # noqa: F821
