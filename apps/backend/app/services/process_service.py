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

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import String, cast, func, or_
from sqlmodel import Session, select

from app.core.enums import ProcessCategory, ProcessStatus
from app.core.exceptions import ConflictError, NotFoundError
from app.models.flow_step import FlowStep
from app.models.process import Process
from app.models.sector import Sector
from app.models.step_resource import StepResource
from app.schemas.process import (
    FlowStepCreate,
    FlowStepUpdate,
    ProcessCreate,
    ProcessUpdate,
    StepResourceCreate,
)

logger = logging.getLogger(__name__)


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


# ---------- FlowStep (B-17) ----------


def _ensure_process_editable(session: Session, process_id: UUID) -> Process:
    """Garante que o processo existe e nao esta ARCHIVED.

    Usado por todas as mutacoes de step/resource. Bloquear edicao de fluxo
    em processos arquivados evita que um processo historico seja alterado
    acidentalmente — se precisar revisar, o admin tem que desarquivar (ou
    criar uma nova versao, conforme decisao da equipe).
    """
    process = get_process_admin(session, process_id)
    if process.status == ProcessStatus.ARCHIVED:
        raise ConflictError(
            "Processos arquivados nao podem ter fluxo editado.",
            code="PROCESS_NOT_EDITABLE",
            details={"current_status": process.status.value},
        )
    return process


def _load_step_in_process(
    session: Session, process_id: UUID, step_id: UUID
) -> FlowStep:
    """Busca uma FlowStep validando que ela pertence ao processo do path.

    Mitigacao de IDOR: se `step_id` existe mas esta em OUTRO processo, o
    atacante nao deve conseguir editar nem descobrir isso. Respondemos 404
    (STEP_NOT_FOUND) em vez de 403 para nao confirmar que o id existe em
    algum lugar do sistema.
    """
    step = session.get(FlowStep, step_id)
    if step is None or step.process_id != process_id:
        raise NotFoundError(
            "Etapa nao encontrada.",
            code="STEP_NOT_FOUND",
        )
    return step


def create_flow_step(
    session: Session, process_id: UUID, data: FlowStepCreate
) -> FlowStep:
    """Adiciona uma etapa ao fluxo de um processo nao-arquivado."""
    _ensure_process_editable(session, process_id)

    # Valida sector — sem esta checagem, o insert falharia com FK error no
    # Postgres (500 para o cliente) e passaria silenciosamente no SQLite.
    # Melhor devolver um 404 dominio-especifico.
    if session.get(Sector, data.sector_id) is None:
        raise NotFoundError(
            "Setor nao encontrado.",
            code="SECTOR_NOT_FOUND",
        )

    step = FlowStep(
        process_id=process_id,
        sector_id=data.sector_id,
        order_index=data.order,
        title=data.title,
        description=data.description,
        responsible=data.responsible,
        estimated_time=data.estimated_time,
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


def update_flow_step(
    session: Session,
    process_id: UUID,
    step_id: UUID,
    data: FlowStepUpdate,
) -> FlowStep:
    """Edita uma etapa. `order` permite reordenacao.

    Renomeia `order` (schema) -> `order_index` (model). Valida sector novo
    se foi enviado. IDOR barrado em _load_step_in_process.
    """
    _ensure_process_editable(session, process_id)
    step = _load_step_in_process(session, process_id, step_id)

    updates = data.model_dump(exclude_unset=True)

    if "sector_id" in updates and session.get(Sector, updates["sector_id"]) is None:
        raise NotFoundError("Setor nao encontrado.", code="SECTOR_NOT_FOUND")

    # Rename explicito antes do setattr loop — fazer so um "order" -> "order_index"
    # em um lugar e mais facil de auditar do que espalhar `if field == "order"`.
    if "order" in updates:
        updates["order_index"] = updates.pop("order")

    for field, value in updates.items():
        setattr(step, field, value)

    step.updated_at = datetime.now(timezone.utc)
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


def delete_flow_step(session: Session, process_id: UUID, step_id: UUID) -> None:
    """Remove uma etapa. Os resources vinculados somem via cascade ORM."""
    _ensure_process_editable(session, process_id)
    step = _load_step_in_process(session, process_id, step_id)

    session.delete(step)
    session.commit()


# ---------- StepResource (B-17) ----------


def _load_resource_in_step(
    session: Session, step_id: UUID, resource_id: UUID
) -> StepResource:
    """IDOR check para resources: resource tem que pertencer ao step do path."""
    resource = session.get(StepResource, resource_id)
    if resource is None or resource.step_id != step_id:
        raise NotFoundError(
            "Recurso nao encontrado.",
            code="RESOURCE_NOT_FOUND",
        )
    return resource


def create_step_resource(
    session: Session,
    process_id: UUID,
    step_id: UUID,
    data: StepResourceCreate,
) -> StepResource:
    """Adiciona um recurso a uma etapa. Dupla validacao IDOR (process->step)."""
    _ensure_process_editable(session, process_id)
    _load_step_in_process(session, process_id, step_id)

    resource = StepResource(
        step_id=step_id,
        type=data.type,
        title=data.title,
        url=data.url,
        content=data.content,
    )
    session.add(resource)
    session.commit()
    session.refresh(resource)
    return resource


def delete_step_resource(
    session: Session,
    process_id: UUID,
    step_id: UUID,
    resource_id: UUID,
) -> None:
    """Remove um recurso. Tripla validacao: process editavel, step no process,
    resource no step."""
    _ensure_process_editable(session, process_id)
    _load_step_in_process(session, process_id, step_id)
    resource = _load_resource_in_step(session, step_id, resource_id)

    session.delete(resource)
    session.commit()


# ---------- Fluxo de aprovacao (B-18) ----------
#
# Transicoes permitidas:
#   DRAFT -> IN_REVIEW    (submit_for_review)
#   IN_REVIEW -> PUBLISHED (approve_process)
#
# ARCHIVED e terminal e alcancado via archive_process. Nao ha "voltar" —
# se um admin mandou pra review por engano, precisa aprovar e depois editar
# (ou aguardar uma feature futura de "retornar para rascunho").


def submit_for_review(session: Session, process_id: UUID) -> Process:
    """DRAFT -> IN_REVIEW. Qualquer outro estado atual e 409."""
    process = get_process_admin(session, process_id)

    if process.status != ProcessStatus.DRAFT:
        raise ConflictError(
            "Apenas processos em DRAFT podem ser enviados para revisao.",
            code="INVALID_STATE_TRANSITION",
            details={
                "current_status": process.status.value,
                "required_status": ProcessStatus.DRAFT.value,
            },
        )

    process.status = ProcessStatus.IN_REVIEW
    process.updated_at = datetime.now(timezone.utc)
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


def approve_process(
    session: Session, process_id: UUID, *, approver_id: UUID
) -> Process:
    """IN_REVIEW -> PUBLISHED. Seta approved_by a partir do JWT.

    `approver_id` e sempre o do usuario autenticado, NUNCA do body — o router
    passa `auth.user_id`.

    No MVP, um admin pode aprovar o proprio processo (decisao da equipe — ver
    CONTRACTS.md). Registramos em log INFO quando isso acontece para servir
    de trilha de auditoria ate termos logging estruturado (B-25).
    """
    process = get_process_admin(session, process_id)

    if process.status != ProcessStatus.IN_REVIEW:
        raise ConflictError(
            "Apenas processos em IN_REVIEW podem ser aprovados.",
            code="INVALID_STATE_TRANSITION",
            details={
                "current_status": process.status.value,
                "required_status": ProcessStatus.IN_REVIEW.value,
            },
        )

    process.status = ProcessStatus.PUBLISHED
    process.approved_by = approver_id
    process.updated_at = datetime.now(timezone.utc)
    session.add(process)
    session.commit()
    session.refresh(process)

    if approver_id == process.created_by:
        # Auto-aprovacao permitida no MVP mas registrada. B-25 vai transformar
        # isso em evento estruturado persistido.
        logger.warning(
            "process_self_approval process_id=%s approver=%s",
            process.id,
            approver_id,
        )

    return process


# ---------- Listagem publica (B-19) ----------


def list_processes_public(
    session: Session,
    *,
    search: str | None = None,
    category: ProcessCategory | None = None,
) -> list[tuple[Process, int]]:
    """Lista processos PUBLISHED para o servidor consultar.

    Retorna tuplas `(Process, step_count)` — o count vem via outer join com
    FlowStep para evitar N+1 (um processo pode nao ter steps ainda, dai o
    outer join). O router converte cada tupla para ProcessPublicList.

    Filtros (opcionais, combinaveis):
    - `search`: case-insensitive em title/short_description/category (casting
      explicito para String no ILIKE da categoria pra funcionar tanto em
      Postgres, onde a coluna e enum nativo, quanto em SQLite, onde e varchar).
    - `category`: filtro exato (enum).

    Ordenacao: access_count desc, tie-break por title asc — processos mais
    acessados primeiro e ordem estavel pra os que nao foram acessados.
    """
    step_count = func.count(FlowStep.id).label("step_count")
    statement = (
        select(Process, step_count)
        .outerjoin(FlowStep, FlowStep.process_id == Process.id)
        .where(Process.status == ProcessStatus.PUBLISHED)
        .group_by(Process.id)
        .order_by(Process.access_count.desc(), Process.title.asc())  # type: ignore[attr-defined]
    )

    if category is not None:
        statement = statement.where(Process.category == category)

    if search:
        like_pattern = f"%{search}%"
        statement = statement.where(
            or_(
                Process.title.ilike(like_pattern),  # type: ignore[attr-defined]
                Process.short_description.ilike(like_pattern),  # type: ignore[attr-defined]
                cast(Process.category, String).ilike(like_pattern),
            )
        )

    return [(process, count) for process, count in session.exec(statement).all()]
