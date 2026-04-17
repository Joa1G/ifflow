"""Router de moderacao de usuarios — endpoints /admin/users/*.

Todos os endpoints exigem role ADMIN ou SUPER_ADMIN via `require_role`. A
dependency ja devolve 403 FORBIDDEN quando a role do token nao atende —
por isso o router nao precisa checar isso manualmente.

Logica de negocio fica em `services.user_service`. Este router so:
- valida o schema de entrada,
- repassa para o service,
- monta a response no formato do CONTRACTS.md.

Schemas estao inline no arquivo porque sao especificos a estes 3 endpoints e
nao sao reutilizados fora daqui. Se vierem a ser usados em outro lugar
(ex: super-admin), extraimos para `schemas/user.py`.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.core.dependencies import require_role
from app.core.enums import UserRole, UserStatus
from app.core.security import TokenPayload
from app.database import get_session
from app.services import user_service

router = APIRouter(prefix="/admin/users", tags=["admin-users"])

_require_admin = require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)


class PendingUserSummary(BaseModel):
    id: UUID
    name: str
    email: str
    siape: str
    sector: str
    created_at: datetime


class PendingUsersListResponse(BaseModel):
    users: list[PendingUserSummary]
    total: int


class UserStatusChangeResponse(BaseModel):
    id: UUID
    status: UserStatus


class RejectUserRequest(BaseModel):
    # `reason` e opcional e aceita string vazia — o service normaliza para
    # None antes de chamar o template de email. Ver user_service.reject_user.
    reason: str | None = Field(default=None, max_length=500)


@router.get("/pending", response_model=PendingUsersListResponse)
def list_pending_users(
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> PendingUsersListResponse:
    users = user_service.list_pending_users(session)
    return PendingUsersListResponse(
        users=[
            PendingUserSummary(
                id=u.id,
                name=u.name,
                email=u.email,
                siape=u.siape,
                sector=u.sector,
                created_at=u.created_at,
            )
            for u in users
        ],
        total=len(users),
    )


@router.post("/{user_id}/approve", response_model=UserStatusChangeResponse)
def approve_user(
    user_id: UUID,
    auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> UserStatusChangeResponse:
    user = user_service.approve_user(session, user_id, auth.user_id)
    return UserStatusChangeResponse(id=user.id, status=user.status)


@router.post("/{user_id}/reject", response_model=UserStatusChangeResponse)
def reject_user(
    user_id: UUID,
    data: RejectUserRequest | None = None,
    auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> UserStatusChangeResponse:
    # Body inteiro e opcional — reject sem body e valido (motivo ausente).
    reason = data.reason if data is not None else None
    user = user_service.reject_user(session, user_id, auth.user_id, reason)
    return UserStatusChangeResponse(id=user.id, status=user.status)
