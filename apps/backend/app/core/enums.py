"""Enums centrais do dominio.

Centralizamos enums em `app.core` para evitar imports circulares entre
`app.models` (que define tabelas) e `app.core.security` / `app.core.dependencies`
(que precisam dos mesmos enums para validar JWT e roles antes mesmo de tocar
no banco).

Todo enum usa `class X(str, Enum)` para serializar como string em JSON e em
colunas SQL — e para que comparacoes do tipo `user.role == "USER"` funcionem
em testes.
"""

from enum import Enum


class UserRole(str, Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class UserStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ProcessCategory(str, Enum):
    RH = "RH"
    MATERIAIS = "MATERIAIS"
    FINANCEIRO = "FINANCEIRO"
    TECNOLOGIA = "TECNOLOGIA"
    INFRAESTRUTURA = "INFRAESTRUTURA"
    CONTRATACOES = "CONTRATACOES"


class ProcessStatus(str, Enum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class ResourceType(str, Enum):
    DOCUMENT = "DOCUMENT"
    LEGAL_BASIS = "LEGAL_BASIS"
    POP = "POP"
    LINK = "LINK"
