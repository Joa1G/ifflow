"""Schemas de usuario — formatos de saida para diferentes contextos.

Nenhum destes schemas expoe password_hash. Cada um mostra apenas os campos
apropriados para o nivel de acesso:
- UserPublic: informacoes minimas (listagens publicas)
- UserMe: dados do proprio usuario autenticado
- UserAdminView: visao completa para admins gerenciando cadastros
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.core.enums import UserRole, UserStatus


class UserPublic(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole
    sector: str


class UserMe(BaseModel):
    id: UUID
    name: str
    email: str
    siape: str
    sector: str
    role: UserRole
    status: UserStatus
    created_at: datetime


class UserAdminView(BaseModel):
    id: UUID
    name: str
    email: str
    siape: str
    sector: str
    role: UserRole
    status: UserStatus
    created_at: datetime
    updated_at: datetime
