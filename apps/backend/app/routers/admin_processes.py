"""Router admin de Process — endpoints /admin/processes/*.

Reduzido a "moderacao": admin lista todos os processos (qualquer status,
qualquer autor) e aprova os que estao em IN_REVIEW.

CRUD propriamente dito (criar/editar/arquivar/withdraw/submit-for-review)
foi movido para `routers/processes.py` na refatoracao
`feat/user-can-create-processes` — qualquer USER autenticado cria/edita os
proprios processos por la, com checagem de ownership no service. Admin
continua tendo poder amplo via os mesmos endpoints (`PROCESS_NOT_OWNED` so
dispara para nao-admin tocando processo alheio).

Permissao: todos os endpoints exigem ADMIN ou SUPER_ADMIN via `require_role`.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.dependencies import require_role
from app.core.enums import ProcessCategory, ProcessStatus, UserRole
from app.core.security import TokenPayload
from app.database import get_session
from app.schemas.process import (
    ProcessAdminView,
    ProcessesManagementListResponse,
)
from app.services import process_service

router = APIRouter(prefix="/admin/processes", tags=["admin-processes"])

_require_admin = require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)


def _to_admin_view(process) -> ProcessAdminView:
    return ProcessAdminView.model_validate(process, from_attributes=True)


@router.get("", response_model=ProcessesManagementListResponse)
def list_processes(
    status: ProcessStatus | None = None,
    category: ProcessCategory | None = None,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> ProcessesManagementListResponse:
    """Listagem de moderacao — admin ve TODOS os processos, qualquer autor."""
    processes = process_service.list_processes_admin(
        session, status=status, category=category
    )
    return ProcessesManagementListResponse(
        processes=[_to_admin_view(p) for p in processes],
        total=len(processes),
    )


@router.post("/{process_id}/approve", response_model=ProcessAdminView)
def approve(
    process_id: UUID,
    auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    # approved_by vem do JWT — router e o unico lugar que sabe quem e o
    # aprovador. Nao aceitamos esse campo de body em lugar nenhum.
    process = process_service.approve_process(
        session, process_id, approver_id=auth.user_id
    )
    return _to_admin_view(process)
