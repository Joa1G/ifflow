"""Model User — tabela principal de usuarios do sistema.

Campos conforme CLAUDE.md e ARCHITECTURE.md. Enums vivem em app.core.enums
para evitar imports circulares com security/dependencies.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel

from app.core.enums import UserRole, UserStatus


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=255)
    email: str = Field(
        sa_column=Column(String(255), unique=True, index=True, nullable=False)
    )
    siape: str = Field(max_length=20)
    sector: str = Field(max_length=255)
    password_hash: str = Field(max_length=255)
    role: UserRole = Field(default=UserRole.USER)
    status: UserStatus = Field(default=UserStatus.PENDING)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
