"""Router de Processes publicos — endpoints /processes/*.

GET / e GET /{id} sao abertos (qualquer visitante lista/ve detalhe). GET
/{id}/flow exige autenticacao (ADR-006: o fluxo operacional nao e info
anonima, so servidor autenticado ve). Todos filtram rigorosamente por
PUBLISHED — DRAFT/IN_REVIEW/ARCHIVED nao podem vazar por nenhum desses
endpoints (checklist de seguranca B-19/B-21).

A validacao do `category` como enum e feita pelo FastAPI automaticamente:
valores invalidos retornam 422 (VALIDATION_ERROR) via o handler global em
app.main.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.dependencies import get_current_user_payload
from app.core.enums import ProcessCategory, UserRole
from app.core.security import TokenPayload
from app.database import get_session
from app.schemas.process import (
    FlowStepRead,
    ProcessesPublicListResponse,
    ProcessFullFlow,
    ProcessPublicDetail,
    ProcessPublicList,
    ProcessRef,
    SectorRef,
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
