"""Router de Processes — endpoints /processes/*.

Tres camadas de visibilidade neste router:

1. PUBLICOS (sem auth, so PUBLISHED): GET /, GET /{id}.
2. AUTENTICADOS GENERICOS (USER+, ainda so PUBLISHED): GET /{id}/flow.
3. AUTENTICADOS DE GESTAO (USER+, autor ou admin): POST /, GET /mine,
   GET /{id}/management, PATCH /{id}, DELETE /{id}, todo o CRUD de
   steps/resources, /submit-for-review, /withdraw.

A camada 3 cobre o caso de USER comum criando/editando os proprios processos
em DRAFT/IN_REVIEW. As regras de ownership e role moram em process_service —
o router so passa `auth.user_id`/`auth.role` adiante.

A validacao do `category` como enum e feita pelo FastAPI automaticamente:
valores invalidos retornam 422 (VALIDATION_ERROR) via o handler global em
app.main.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.core.dependencies import get_current_user_payload
from app.core.enums import ProcessCategory, ProcessStatus, UserRole
from app.core.security import TokenPayload
from app.database import get_session
from app.schemas.process import (
    FlowStepAdminView,
    FlowStepCreate,
    FlowStepRead,
    FlowStepUpdate,
    ProcessAdminView,
    ProcessCreate,
    ProcessesManagementListResponse,
    ProcessesPublicListResponse,
    ProcessFullFlow,
    ProcessPublicDetail,
    ProcessPublicList,
    ProcessRef,
    ProcessUpdate,
    SectorRef,
    StepResourceAdminView,
    StepResourceCreate,
    StepResourceRead,
)
from app.services import process_service

router = APIRouter(prefix="/processes", tags=["processes"])


@router.get("", response_model=ProcessesPublicListResponse)
def list_processes(
    search: str | None = None,
    category: ProcessCategory | None = None,
    session: Session = Depends(get_session),
) -> ProcessesPublicListResponse:
    results = process_service.list_processes_public(
        session, search=search, category=category
    )
    processes = [
        ProcessPublicList(
            id=process.id,
            title=process.title,
            short_description=process.short_description,
            category=process.category,
            estimated_time=process.estimated_time,
            step_count=step_count,
            access_count=process.access_count,
        )
        for process, step_count in results
    ]
    return ProcessesPublicListResponse(processes=processes, total=len(processes))


# `/mine` precisa estar declarado ANTES de `/{process_id}` — caso contrario
# o FastAPI casaria "mine" como UUID invalido e devolveria 422.
@router.get("/mine", response_model=ProcessesManagementListResponse)
def list_my_processes(
    status_filter: ProcessStatus | None = None,
    category: ProcessCategory | None = None,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessesManagementListResponse:
    """Processos cujo `created_by` e o usuario autenticado.

    Aceita o param `status_filter` (renomeado para nao colidir com o `status`
    importado de fastapi); exposto na query string como `?status_filter=DRAFT`.
    """
    processes = process_service.list_processes_for_owner(
        session,
        owner_id=auth.user_id,
        status=status_filter,
        category=category,
    )
    return ProcessesManagementListResponse(
        processes=[_to_admin_view(p) for p in processes],
        total=len(processes),
    )


@router.get("/{process_id}", response_model=ProcessPublicDetail)
def get_process_detail(
    process_id: UUID,
    session: Session = Depends(get_session),
) -> ProcessPublicDetail:
    process, step_count = process_service.get_process_public_detail(session, process_id)
    return ProcessPublicDetail(
        id=process.id,
        title=process.title,
        short_description=process.short_description,
        full_description=process.full_description,
        category=process.category,
        estimated_time=process.estimated_time,
        requirements=process.requirements,
        step_count=step_count,
        access_count=process.access_count,
    )


@router.get(
    "/{process_id}/flow",
    response_model=ProcessFullFlow,
)
def get_process_flow(
    process_id: UUID,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessFullFlow:
    """Retorna o fluxo completo do processo. Exige autenticacao (ADR-006).

    Usa `get_current_user_payload` (decodifica o JWT) em vez de
    `get_current_user` (SELECT no banco) pra manter o endpoint barato — aqui
    so importa que o token e valido, nao os dados do User.
    """
    is_admin = auth.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    process = process_service.get_process_full_flow(
        session, process_id, require_published=not is_admin
    )

    # Ordena por order_index em Python — a lista ja esta carregada (selectinload)
    # e as tabelas tem poucos steps por processo; ORDER BY na query exigiria
    # escopar o eager loader com .order_by(), complicacao sem payoff.
    sorted_steps = sorted(process.steps, key=lambda s: s.order_index)

    return ProcessFullFlow(
        process=ProcessRef(id=process.id, title=process.title),
        steps=[
            FlowStepRead(
                id=step.id,
                order=step.order_index,
                sector=SectorRef(
                    id=step.sector.id,
                    name=step.sector.name,
                    acronym=step.sector.acronym,
                ),
                title=step.title,
                description=step.description,
                responsible=step.responsible,
                estimated_time=step.estimated_time,
                resources=[
                    StepResourceRead(
                        id=resource.id,
                        type=resource.type,
                        title=resource.title,
                        url=resource.url,
                        content=resource.content,
                    )
                    for resource in step.resources
                ],
            )
            for step in sorted_steps
        ],
    )


# ---------- Endpoints de gestao (autor ou admin) ----------
#
# Os endpoints abaixo cobrem o caso "USER autenticado cria/edita seus
# proprios processos". A autorizacao detalhada (autor vs admin, transicoes
# de status) mora em process_service via _assert_owner_or_admin etc.; o
# router so encaminha auth.user_id e auth.role.


def _to_admin_view(process) -> ProcessAdminView:
    """Process model -> ProcessAdminView. Campos batem 1:1."""
    return ProcessAdminView.model_validate(process, from_attributes=True)


def _step_to_view(step) -> FlowStepAdminView:
    """FlowStep model -> view. Renomeia order_index -> order para nao vazar
    o nome reservado SQL no contrato publico."""
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
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    # created_by sempre do JWT — o cliente nao tem como mandar outro valor.
    process = process_service.create_process(session, data, created_by=auth.user_id)
    return _to_admin_view(process)


# (`list_my_processes` esta declarado mais acima, antes de `/{process_id}`,
# para evitar conflito de matching de rota — ver comentario la.)


@router.get("/{process_id}/management", response_model=ProcessAdminView)
def get_process_management(
    process_id: UUID,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    """Visao completa para autor ou admin gerenciar o processo.

    Diferente de GET /processes/{id} (publico, so PUBLISHED), esse devolve
    qualquer status. A checagem ownership-or-admin esta em
    `get_process_for_management` no service.
    """
    process = process_service.get_process_for_management(
        session,
        process_id,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _to_admin_view(process)


@router.patch("/{process_id}", response_model=ProcessAdminView)
def update_process(
    process_id: UUID,
    data: ProcessUpdate,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    process = process_service.update_process(
        session,
        process_id,
        data,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _to_admin_view(process)


@router.delete("/{process_id}", response_model=ProcessAdminView)
def archive_process(
    process_id: UUID,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    # Soft delete. USER pode arquivar proprio DRAFT/IN_REVIEW; admin pode
    # qualquer. Service decide e retorna 403/409 conforme o caso.
    process = process_service.archive_process(
        session,
        process_id,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _to_admin_view(process)


# ---------- FlowStep CRUD (autor ou admin) ----------


@router.post(
    "/{process_id}/steps",
    response_model=FlowStepAdminView,
    status_code=status.HTTP_201_CREATED,
)
def create_step(
    process_id: UUID,
    data: FlowStepCreate,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> FlowStepAdminView:
    step = process_service.create_flow_step(
        session,
        process_id,
        data,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _step_to_view(step)


@router.patch(
    "/{process_id}/steps/{step_id}",
    response_model=FlowStepAdminView,
)
def update_step(
    process_id: UUID,
    step_id: UUID,
    data: FlowStepUpdate,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> FlowStepAdminView:
    step = process_service.update_flow_step(
        session,
        process_id,
        step_id,
        data,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _step_to_view(step)


@router.delete(
    "/{process_id}/steps/{step_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_step(
    process_id: UUID,
    step_id: UUID,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> None:
    process_service.delete_flow_step(
        session,
        process_id,
        step_id,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )


# ---------- StepResource CRUD (autor ou admin) ----------


@router.post(
    "/{process_id}/steps/{step_id}/resources",
    response_model=StepResourceAdminView,
    status_code=status.HTTP_201_CREATED,
)
def create_resource(
    process_id: UUID,
    step_id: UUID,
    data: StepResourceCreate,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> StepResourceAdminView:
    resource = process_service.create_step_resource(
        session,
        process_id,
        step_id,
        data,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _resource_to_view(resource)


@router.delete(
    "/{process_id}/steps/{step_id}/resources/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_resource(
    process_id: UUID,
    step_id: UUID,
    resource_id: UUID,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> None:
    process_service.delete_step_resource(
        session,
        process_id,
        step_id,
        resource_id,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )


# ---------- Transicoes de status (autor ou admin) ----------


@router.post("/{process_id}/submit-for-review", response_model=ProcessAdminView)
def submit_for_review(
    process_id: UUID,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    process = process_service.submit_for_review(
        session,
        process_id,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _to_admin_view(process)


@router.post("/{process_id}/withdraw", response_model=ProcessAdminView)
def withdraw_from_review(
    process_id: UUID,
    auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> ProcessAdminView:
    """IN_REVIEW -> DRAFT. Autor (ou admin) chama para destravar a edicao.

    Endpoint dedicado em vez de PATCH status: deixa explicito no contrato
    que essa e uma transicao de status (gera log, podera disparar
    notificacao no futuro) e nao um campo arbitrario do recurso.
    """
    process = process_service.withdraw_from_review(
        session,
        process_id,
        requester_id=auth.user_id,
        requester_role=auth.role,
    )
    return _to_admin_view(process)
