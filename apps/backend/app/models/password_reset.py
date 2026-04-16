"""Model PasswordResetToken — token de redefinicao de senha.

Armazenamos apenas o SHA-256 do token; o token em claro viaja pelo email e
nunca e persistido. Um token so pode ser usado uma vez (`used_at`) e expira
em 1h apos criacao.
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    # SHA-256 em hex tem 64 chars. Unique impede reuso acidental de um mesmo
    # hash (colisao de SHA-256 e impossivel na pratica, mas o constraint e
    # barato e documenta a intencao).
    token_hash: str = Field(
        sa_column=Column(String(64), unique=True, index=True, nullable=False)
    )
    expires_at: datetime = Field(nullable=False)
    used_at: datetime | None = Field(default=None, nullable=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
