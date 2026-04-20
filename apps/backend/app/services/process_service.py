"""Service de CRUD de Process (admin).

Services NAO conhecem FastAPI — levantam excecoes de app.core.exceptions que
o router traduz para HTTP.

Regras de negocio encapsuladas aqui:
- Todo processo nasce em DRAFT, access_count=0.
- created_by e passado explicitamente pelo router (vem do JWT), nunca do body.
  Isso e o que impede mass assignment: mesmo que o schema aceitasse
  `created_by`, o service ignoraria o valor do cliente.
- ARCHIVED e terminal para edicao: um processo arquivado existe so para
  auditoria/historico. Para reativar, a equipe decidiu que o fluxo e criar um
  novo processo (mais simples que permitir unarchive e lidar com progresso
  orfao dos usuarios).
- Listagem admin inclui TODOS os status — e o unico lugar onde DRAFT/IN_REVIEW
  aparecem. A listagem publica (B-19) filtra so PUBLISHED.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Session, select

from app.core.enums import ProcessCategory, ProcessStatus
from app.core.exceptions import ConflictError, NotFoundError
from app.models.process import Process
from app.schemas.process import ProcessCreate, ProcessUpdate


def create_process(
    session: Session, data: ProcessCreate, *, created_by: UUID
) -> Process:
    """Cria um processo em DRAFT.

    `created_by` vem explicitamente do router (JWT), NUNCA do `data`. O schema
    ProcessCreate nem aceita esse campo, mas reforcar na assinatura deixa
    claro que a fonte de verdade e o usuario autenticado.
    """
    process = Process(
        title=data.title,
        short_description=data.short_description,
        full_description=data.full_description,
        category=data.category,
        estimated_time=data.estimated_time,
        requirements=list(data.requirements),
        status=ProcessStatus.DRAFT,
        access_count=0,
        created_by=created_by,
    )
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


def get_process_admin(session: Session, process_id: UUID) -> Process:
    """Busca um processo pelo id ou levanta PROCESS_NOT_FOUND (404).

    Nao filtra por status — admin ve DRAFT/IN_REVIEW/ARCHIVED tambem.
    """
    process = session.get(Process, process_id)
    if process is None:
        raise NotFoundError(
            "Processo nao encontrado.",
            code="PROCESS_NOT_FOUND",
        )
    return process


def list_processes_admin(
    session: Session,
    *,
    status: ProcessStatus | None = None,
    category: ProcessCategory | None = None,
) -> list[Process]:
    """Lista TODOS os processos (incluindo DRAFT/IN_REVIEW/ARCHIVED).

    Ordenacao por created_at desc — admin normalmente quer ver o que criou
    mais recente no topo. Filtros opcionais por status/category sao passados
    via query string no router.
    """
    statement = select(Process)
    if status is not None:
        statement = statement.where(Process.status == status)
    if category is not None:
        statement = statement.where(Process.category == category)
    statement = statement.order_by(Process.created_at.desc())  # type: ignore[attr-defined]
    return list(session.exec(statement).all())


def update_process(session: Session, process_id: UUID, data: ProcessUpdate) -> Process:
    """Edita campos de um processo. Bloqueia edicao de ARCHIVED (409).

    Usa model_dump(exclude_unset=True) para aplicar semantica PATCH — so os
    campos enviados pelo cliente sao atualizados. Status/approved_by/
    access_count/created_by NAO sao editaveis por aqui (nem fazem parte do
    schema ProcessUpdate).
    """
    process = get_process_admin(session, process_id)

    if process.status == ProcessStatus.ARCHIVED:
        raise ConflictError(
            "Processos arquivados nao podem ser editados.",
            code="PROCESS_NOT_EDITABLE",
            details={"current_status": process.status.value},
        )

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(process, field, value)

    process.updated_at = datetime.now(timezone.utc)
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


def archive_process(session: Session, process_id: UUID) -> Process:
    """Soft delete — marca como ARCHIVED.

    Idempotencia deliberadamente NAO implementada: arquivar um processo ja
    arquivado e provavelmente um bug do admin (clique duplo, race entre abas).
    Responder 409 da feedback util em vez de silenciar.
    """
    process = get_process_admin(session, process_id)

    if process.status == ProcessStatus.ARCHIVED:
        raise ConflictError(
            "Processo ja esta arquivado.",
            code="PROCESS_ALREADY_ARCHIVED",
            details={"current_status": process.status.value},
        )

    process.status = ProcessStatus.ARCHIVED
    process.updated_at = datetime.now(timezone.utc)
    session.add(process)
    session.commit()
    session.refresh(process)
    return process
