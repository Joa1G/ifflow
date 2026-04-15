"""Enums centrais do dominio.

Centralizamos enums em `app.core` para evitar imports circulares entre
`app.models` (que define tabelas) e `app.core.security` / `app.core.dependencies`
(que precisam dos mesmos enums para validar JWT e roles antes mesmo de tocar
no banco).

Tasks futuras (B-03, B-14) adicionarao UserStatus, ProcessStatus,
ProcessCategory, ResourceType aqui — use sempre `class X(str, Enum)` para
serializar como string em JSON e em colunas SQL.
"""

from enum import Enum


class UserRole(str, Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"
