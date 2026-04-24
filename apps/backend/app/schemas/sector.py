"""Schemas de Sector — so leitura no MVP.

No MVP nao expomos endpoints de create/update/delete de sector — o seed
inicial (`app.scripts.seed_sectors`) e a fonte canonica. Se a equipe
precisar adicionar um novo setor, edita o seed e reexecuta; a idempotencia
preserva dados ja usados em processos.
"""

from uuid import UUID

from pydantic import BaseModel


class SectorRead(BaseModel):
    id: UUID
    name: str
    acronym: str


class SectorsListResponse(BaseModel):
    sectors: list[SectorRead]
    total: int
