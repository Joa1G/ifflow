"""Router admin de Process — endpoints /admin/processes/*.

Todos os endpoints exigem role ADMIN ou SUPER_ADMIN via `require_role` — a
dependency ja devolve 401/403 em caso de token ausente/insuficiente, entao o
router nao checa isso manualmente.

O router so adapta request <-> schema <-> service. Regras de negocio (DRAFT
inicial, bloqueio de editar ARCHIVED, etc) estao em process_service.

Seguranca (B-16 checklist):
- `created_by` vem do JWT (`auth.user_id`), nunca do body.
- ProcessCreate/Update nem tem o campo created_by — o mass assignment ja e
  barrado no nivel do schema. A passagem explicita aqui e reforco.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlmodel import Session

from app.core.dependencies import require_role
from app.core.enums import ProcessCategory, ProcessStatus, UserRole
from app.core.security import TokenPayload
from app.database import get_session
from app.schemas.process import (
    FlowStepAdminView,
    FlowStepCreate,
    FlowStepUpdate,
    ProcessAdminView,
    ProcessCreate,
    ProcessUpdate,
    StepResourceAdminView,
    StepResourceCreate,
)
from app.services import process_service

router = APIRouter(prefix="/admin/processes", tags=["admin-processes"])

_require_admin = require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN)


class ProcessesAdminListResponse(BaseModel):
    processes: list[ProcessAdminView]
    total: int


def _to_admin_view(process) -> ProcessAdminView:
    """Converte o model Process para o schema ProcessAdminView.

    Usar `model_validate` direto no model funciona porque os campos do schema
    batem 1:1 com os atributos do model (ver app/schemas/process.py).
    """
    return ProcessAdminView.model_validate(process, from_attributes=True)


def _step_to_view(step) -> FlowStepAdminView:
    """Converte FlowStep (model) -> FlowStepAdminView (schema).

    O model usa `order_index` mas o contrato publico expoe `order` — rename
    explicito aqui evita vazar o detalhe SQL para o cliente.
    """
    return FlowStepAdminView(
        id=step.id,
        process_id=step.process_id,
        sector_id=step.sector_id,
        order=step.order_index,
        title=step.title,
        description=step.description,
        responsible=step.responsible,
        estimated_time=step.estimated_time,
    )


def _resource_to_view(resource) -> StepResourceAdminView:
    return StepResourceAdminView.model_validate(resource, from_attributes=True)


@router.post(
    "",
    response_model=ProcessAdminView,
    status_code=status.HTTP_201_CREATED,
)
def create_process(
    data: ProcessCreate,
    auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    # created_by do JWT — o cliente nao tem como mandar outro valor.
    process = process_service.create_process(session, data, created_by=auth.user_id)
    return _to_admin_view(process)


@router.get("", response_model=ProcessesAdminListResponse)
def list_processes(
    status: ProcessStatus | None = None,
    category: ProcessCategory | None = None,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> ProcessesAdminListResponse:
    processes = process_service.list_processes_admin(
        session, status=status, category=category
    )
    return ProcessesAdminListResponse(
        processes=[_to_admin_view(p) for p in processes],
        total=len(processes),
    )


@router.get("/{process_id}", response_model=ProcessAdminView)
def get_process(
    process_id: UUID,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    process = process_service.get_process_admin(session, process_id)
    return _to_admin_view(process)


@router.patch("/{process_id}", response_model=ProcessAdminView)
def update_process(
    process_id: UUID,
    data: ProcessUpdate,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    process = process_service.update_process(session, process_id, data)
    return _to_admin_view(process)


@router.delete("/{process_id}", response_model=ProcessAdminView)
def archive_process(
    process_id: UUID,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    # Soft delete — status vai para ARCHIVED. Retornamos o recurso atualizado
    # (nao 204) para o frontend ja ter o novo status sem refetch.
    process = process_service.archive_process(session, process_id)
    return _to_admin_view(process)


# ---------- FlowStep (B-17) ----------


@router.post(
    "/{process_id}/steps",
    response_model=FlowStepAdminView,
    status_code=status.HTTP_201_CREATED,
)
def create_step(
    process_id: UUID,
    data: FlowStepCreate,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> FlowStepAdminView:
    step = process_service.create_flow_step(session, process_id, data)
    return _step_to_view(step)


@router.patch(
    "/{process_id}/steps/{step_id}",
    response_model=FlowStepAdminView,
)
def update_step(
    process_id: UUID,
    step_id: UUID,
    data: FlowStepUpdate,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> FlowStepAdminView:
    step = process_service.update_flow_step(session, process_id, step_id, data)
    return _step_to_view(step)


@router.delete(
    "/{process_id}/steps/{step_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_step(
    process_id: UUID,
    step_id: UUID,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> None:
    # 204 — delete de sub-recurso nao precisa retornar nada; frontend ja sabe
    # o que foi deletado pelo path.
    process_service.delete_flow_step(session, process_id, step_id)


# ---------- StepResource (B-17) ----------


@router.post(
    "/{process_id}/steps/{step_id}/resources",
    response_model=StepResourceAdminView,
    status_code=status.HTTP_201_CREATED,
)
def create_resource(
    process_id: UUID,
    step_id: UUID,
    data: StepResourceCreate,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> StepResourceAdminView:
    resource = process_service.create_step_resource(session, process_id, step_id, data)
    return _resource_to_view(resource)


@router.delete(
    "/{process_id}/steps/{step_id}/resources/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_resource(
    process_id: UUID,
    step_id: UUID,
    resource_id: UUID,
    _auth: TokenPayload = Depends(_require_admin),
    session: Session = Depends(get_session),
) -> None:
    process_service.delete_step_resource(session, process_id, step_id, resource_id)
