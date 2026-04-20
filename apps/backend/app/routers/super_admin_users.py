"""Router de gestao de papeis — endpoints /super-admin/users/*.

Exige role SUPER_ADMIN apenas (ADMIN nao tem acesso, diferente dos endpoints
de moderacao em admin_users.py). A dependency `require_role(SUPER_ADMIN)` ja
devolve 403 FORBIDDEN para qualquer role abaixo, entao o router so trata o
happy path.

Logica de negocio em `services.user_service.promote_to_admin` e `demote_to_user`
— incluindo as travas contra auto-rebaixamento e rebaixar outro SUPER_ADMIN.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app.core.dependencies import require_role
from app.core.enums import UserRole
from app.core.security import TokenPayload
from app.database import get_session
from app.services import user_service

router = APIRouter(prefix="/super-admin/users", tags=["super-admin-users"])

_require_super_admin = require_role(UserRole.SUPER_ADMIN)


class RoleChangeResponse(BaseModel):
    id: UUID
    role: UserRole


@router.post("/{user_id}/promote", response_model=RoleChangeResponse)
def promote_user(
    user_id: UUID,
    auth: TokenPayload = Depends(_require_super_admin),
    session: Session = Depends(get_session),
) -> RoleChangeResponse:
    user = user_service.promote_to_admin(session, user_id, auth.user_id)
    return RoleChangeResponse(id=user.id, role=user.role)


@router.post("/{user_id}/demote", response_model=RoleChangeResponse)
def demote_user(
    user_id: UUID,
    auth: TokenPayload = Depends(_require_super_admin),
    session: Session = Depends(get_session),
) -> RoleChangeResponse:
    user = user_service.demote_to_user(session, user_id, auth.user_id)
    return RoleChangeResponse(id=user.id, role=user.role)
