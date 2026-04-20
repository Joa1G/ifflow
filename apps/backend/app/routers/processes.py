"""Router publico de Processes — endpoints /processes/*.

Sem auth (qualquer servidor / visitante pode listar e buscar). Filtra
rigorosamente por PUBLISHED — DRAFT/IN_REVIEW/ARCHIVED nao devem vazar por
este endpoint (checklist de seguranca B-19).

A validacao do `category` como enum e feita pelo FastAPI automaticamente:
valores invalidos retornam 422 (VALIDATION_ERROR) via o handler global em
app.main.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.enums import ProcessCategory
from app.database import get_session
from app.schemas.process import (
    ProcessesPublicListResponse,
    ProcessPublicDetail,
    ProcessPublicList,
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
