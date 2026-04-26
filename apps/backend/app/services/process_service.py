"""Service de CRUD de Process.

Services NAO conhecem FastAPI — levantam excecoes de app.core.exceptions que
o router traduz para HTTP.

Regras de negocio encapsuladas aqui:
- Todo processo nasce em DRAFT, access_count=0.
- USER autenticado pode criar/editar/submeter/arquivar/withdraw os PROPRIOS
  processos. Admin pode tudo isso em qualquer processo, e e o unico que
  aprova (DRAFT/IN_REVIEW -> PUBLISHED) e que arquiva PUBLISHED.
- created_by e passado explicitamente pelo router (vem do JWT), nunca do body.
  Isso e o que impede mass assignment: mesmo que o schema aceitasse
  `created_by`, o service ignoraria o valor do cliente.
- Toda mutacao apos a criacao recebe `requester_id` e `requester_role` para
  enforcar ownership e regras de role. Helpers `_assert_owner_or_admin` e
  `_assert_editable_status` centralizam essa logica.
- ARCHIVED e terminal para edicao: um processo arquivado existe so para
  auditoria/historico. Para reativar, a equipe decidiu que o fluxo e criar um
  novo processo.
- IN_REVIEW e bloqueado para PATCH/edicao de steps/resources — autor (ou admin)
  precisa chamar `withdraw_from_review` antes de editar.
- Listagem admin inclui TODOS os status; listagem por owner mostra so do
  proprio servidor; listagem publica (B-19) filtra so PUBLISHED.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import String, cast, func, or_, update
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.enums import ProcessCategory, ProcessStatus, UserRole
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
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


# ---------- Helpers de autorizacao ----------
#
# USER comum agora cria/edita seus proprios processos. Admin segue podendo
# tudo. Os helpers abaixo centralizam as duas regras transversais —
# "ownership ou admin" e "transicoes de status que cada role pode disparar".


def _is_admin(role: UserRole) -> bool:
    return role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)


def _assert_owner_or_admin(
    process: Process, requester_id: UUID, requester_role: UserRole
) -> None:
    """Bloqueia USER de tocar em processo que nao criou.

    Codigo `PROCESS_NOT_OWNED` (403) — distinto de `FORBIDDEN` generico para
    o frontend poder dar mensagem especifica ("este processo pertence a outro
    servidor").
    """
    if process.created_by == requester_id or _is_admin(requester_role):
        return
    raise ForbiddenError(
        "Voce nao tem permissao para alterar este processo.",
        code="PROCESS_NOT_OWNED",
    )


def _assert_editable_status(process: Process) -> None:
    """Bloqueia mutacoes em ARCHIVED (terminal) e IN_REVIEW (locked).

    IN_REVIEW so pode ser editado se o autor (ou admin) chamar `withdraw`
    primeiro — isso evita que mudancas escapem do olhar do revisor.
    """
    if process.status == ProcessStatus.ARCHIVED:
        raise ConflictError(
            "Processos arquivados nao podem ser editados.",
            code="PROCESS_NOT_EDITABLE",
            details={"current_status": process.status.value},
        )
    if process.status == ProcessStatus.IN_REVIEW:
        raise ConflictError(
            "Processo em revisao. Volte para rascunho antes de editar.",
            code="PROCESS_LOCKED_IN_REVIEW",
            details={"current_status": process.status.value},
        )


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


def get_process_for_management(
    session: Session,
    process_id: UUID,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> Process:
    """Versao "ownership-aware" de get_process_admin.

    Devolve o processo se o requester for autor ou admin; caso contrario,
    levanta `PROCESS_NOT_OWNED` (403). Usado pelo endpoint
    GET /processes/{id}/management — o frontend chama isso pra carregar o
    editor de um processo onde o usuario tem permissao de gestao.
    """
    process = get_process_admin(session, process_id)
    _assert_owner_or_admin(process, requester_id, requester_role)
    return process


def list_processes_for_owner(
    session: Session,
    *,
    owner_id: UUID,
    status: ProcessStatus | None = None,
    category: ProcessCategory | None = None,
) -> list[Process]:
    """Lista processos cujo `created_by` e `owner_id` (qualquer status).

    Usada pela tela "Meus processos" do USER. Admin que queira ver os
    proprios processos tambem pode usar — para ver tudo, ele cai na
    listagem admin (ver list_processes_admin).
    """
    statement = select(Process).where(Process.created_by == owner_id)
    if status is not None:
        statement = statement.where(Process.status == status)
    if category is not None:
        statement = statement.where(Process.category == category)
    statement = statement.order_by(Process.created_at.desc())  # type: ignore[attr-defined]
    return list(session.exec(statement).all())


def update_process(
    session: Session,
    process_id: UUID,
    data: ProcessUpdate,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> Process:
    """Edita campos de um processo. Owner OU admin; bloqueia ARCHIVED/IN_REVIEW.

    Usa model_dump(exclude_unset=True) para aplicar semantica PATCH — so os
    campos enviados pelo cliente sao atualizados. Status/approved_by/
    access_count/created_by NAO sao editaveis por aqui (nem fazem parte do
    schema ProcessUpdate).
    """
    process = get_process_admin(session, process_id)
    _assert_owner_or_admin(process, requester_id, requester_role)
    _assert_editable_status(process)

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(process, field, value)

    process.updated_at = datetime.now(timezone.utc)
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


def archive_process(
    session: Session,
    process_id: UUID,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> Process:
    """Soft delete — marca como ARCHIVED.

    Permissao:
    - Admin pode arquivar processos em qualquer status (DRAFT/IN_REVIEW/PUBLISHED).
    - Autor pode arquivar somente os proprios DRAFT ou IN_REVIEW. Para arquivar
      um processo ja PUBLISHED a decisao e institucional — passa pelo admin.

    Idempotencia deliberadamente NAO implementada: arquivar um processo ja
    arquivado e provavelmente um bug do cliente (clique duplo, race entre abas).
    Responder 409 da feedback util em vez de silenciar.
    """
    process = get_process_admin(session, process_id)
    _assert_owner_or_admin(process, requester_id, requester_role)

    if process.status == ProcessStatus.ARCHIVED:
        raise ConflictError(
            "Processo ja esta arquivado.",
            code="PROCESS_ALREADY_ARCHIVED",
            details={"current_status": process.status.value},
        )

    if not _is_admin(requester_role) and process.status == ProcessStatus.PUBLISHED:
        raise ForbiddenError(
            "Apenas administradores podem arquivar processos publicados.",
            code="PROCESS_ARCHIVE_REQUIRES_ADMIN",
            details={"current_status": process.status.value},
        )

    process.status = ProcessStatus.ARCHIVED
    process.updated_at = datetime.now(timezone.utc)
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


# ---------- FlowStep (B-17) ----------


def _ensure_process_editable(
    session: Session,
    process_id: UUID,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> Process:
    """Garante que o processo existe, e que o requester pode edita-lo agora.

    Usado por todas as mutacoes de step/resource. Aplica em sequencia:
      1. processo existe (404 PROCESS_NOT_FOUND)
      2. requester e dono OU admin (403 PROCESS_NOT_OWNED)
      3. status permite edicao — nem ARCHIVED nem IN_REVIEW (409)

    A ordem importa: ownership antes de status para nao vazar a existencia
    de um DRAFT alheio via mensagem "PROCESS_LOCKED_IN_REVIEW".
    """
    process = get_process_admin(session, process_id)
    _assert_owner_or_admin(process, requester_id, requester_role)
    _assert_editable_status(process)
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
    session: Session,
    process_id: UUID,
    data: FlowStepCreate,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> FlowStep:
    """Adiciona uma etapa ao fluxo de um processo editavel pelo requester."""
    _ensure_process_editable(
        session, process_id, requester_id=requester_id, requester_role=requester_role
    )

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
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> FlowStep:
    """Edita uma etapa. `order` permite reordenacao.

    Renomeia `order` (schema) -> `order_index` (model). Valida sector novo
    se foi enviado. IDOR barrado em _load_step_in_process.
    """
    _ensure_process_editable(
        session, process_id, requester_id=requester_id, requester_role=requester_role
    )
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


def delete_flow_step(
    session: Session,
    process_id: UUID,
    step_id: UUID,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> None:
    """Remove uma etapa. Os resources vinculados somem via cascade ORM."""
    _ensure_process_editable(
        session, process_id, requester_id=requester_id, requester_role=requester_role
    )
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
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> StepResource:
    """Adiciona um recurso a uma etapa. Dupla validacao IDOR (process->step)."""
    _ensure_process_editable(
        session, process_id, requester_id=requester_id, requester_role=requester_role
    )
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
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> None:
    """Remove um recurso. Tripla validacao: process editavel, step no process,
    resource no step."""
    _ensure_process_editable(
        session, process_id, requester_id=requester_id, requester_role=requester_role
    )
    _load_step_in_process(session, process_id, step_id)
    resource = _load_resource_in_step(session, step_id, resource_id)

    session.delete(resource)
    session.commit()


# ---------- Fluxo de aprovacao ----------
#
# Transicoes permitidas:
#   DRAFT     -> IN_REVIEW   (submit_for_review)   — autor ou admin
#   IN_REVIEW -> DRAFT       (withdraw_from_review) — autor ou admin
#   IN_REVIEW -> PUBLISHED   (approve_process)      — admin
#
# ARCHIVED e terminal e alcancado via archive_process (admin amplo, autor
# restrito a DRAFT/IN_REVIEW proprios).


def submit_for_review(
    session: Session,
    process_id: UUID,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> Process:
    """DRAFT -> IN_REVIEW. Owner ou admin. Outro estado e 409."""
    process = get_process_admin(session, process_id)
    _assert_owner_or_admin(process, requester_id, requester_role)

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


def withdraw_from_review(
    session: Session,
    process_id: UUID,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> Process:
    """IN_REVIEW -> DRAFT. Owner ou admin.

    Endpoint criado para suportar o fluxo "autor edita processo em revisao":
    como PATCH em IN_REVIEW e bloqueado, o autor primeiro retira do review,
    edita, e re-submete. Admin tambem pode retirar (devolver pra autor para
    ajustes), evitando que admins precisem aprovar/arquivar so para
    "destravar" a edicao.
    """
    process = get_process_admin(session, process_id)
    _assert_owner_or_admin(process, requester_id, requester_role)

    if process.status != ProcessStatus.IN_REVIEW:
        raise ConflictError(
            "Apenas processos em revisao podem voltar para rascunho.",
            code="INVALID_STATE_TRANSITION",
            details={
                "current_status": process.status.value,
                "required_status": ProcessStatus.IN_REVIEW.value,
            },
        )

    process.status = ProcessStatus.DRAFT
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
    de trilha de auditoria ate termos logging estruturado (B-27).
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
        # Auto-aprovacao permitida no MVP mas registrada. B-27 vai transformar
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


def get_process_public_detail(
    session: Session, process_id: UUID
) -> tuple[Process, int]:
    """Retorna (Process, step_count) para o detalhe publico + incrementa access_count.

    Incremento ATOMICO: executa `UPDATE processes SET access_count =
    access_count + 1 WHERE id = ? AND status = PUBLISHED` numa unica query.
    Sem SELECT + SET no app — se dois requests chegarem juntos, o banco
    serializa os UPDATEs e nenhum incremento se perde (REQ-020).

    O WHERE status=PUBLISHED cumpre dupla funcao: impede incremento em
    DRAFT/IN_REVIEW/ARCHIVED (rowcount == 0) e serve de filtro de
    visibilidade — mesmo tratamento 404 para processo inexistente e
    processo nao-publicado, para nao vazar existencia de rascunhos.
    """
    result = session.execute(
        update(Process)
        .where(Process.id == process_id)
        .where(Process.status == ProcessStatus.PUBLISHED)
        .values(access_count=Process.access_count + 1)
    )
    session.commit()

    if result.rowcount == 0:
        raise NotFoundError(
            "Processo nao encontrado.",
            code="PROCESS_NOT_FOUND",
        )

    step_count_col = func.count(FlowStep.id).label("step_count")
    statement = (
        select(Process, step_count_col)
        .outerjoin(FlowStep, FlowStep.process_id == Process.id)
        .where(Process.id == process_id)
        .group_by(Process.id)
    )
    row = session.exec(statement).one()
    process, step_count = row
    return process, step_count


def get_process_full_flow(
    session: Session,
    process_id: UUID,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> Process:
    """Retorna um Process com steps, sectors e resources carregados.

    Usa `selectinload` em tres niveis para evitar N+1: uma query pra carregar
    os steps do processo, uma pros sectors dos steps, e uma pros resources
    dos steps. Sem eager loading, iterar `process.steps[n].resources` no
    router dispararia 2*N queries adicionais.

    Regra de acesso:
    - Processos PUBLISHED sao visiveis a qualquer usuario autenticado.
    - Processos nao publicados (DRAFT/IN_REVIEW/ARCHIVED) so sao visiveis
      ao autor ou a admins.

    Para terceiros, o comportamento continua sendo 404 uniforme para nao
    vazar existencia de fluxos ainda nao publicados.
    """
    statement = select(Process).where(Process.id == process_id)

    statement = statement.options(
        selectinload(Process.steps).selectinload(FlowStep.sector),  # type: ignore[attr-defined]
        selectinload(Process.steps).selectinload(FlowStep.resources),  # type: ignore[attr-defined]
    )
    process = session.exec(statement).one_or_none()
    if process is None:
        raise NotFoundError(
            "Processo nao encontrado.",
            code="PROCESS_NOT_FOUND",
        )

    if process.status == ProcessStatus.PUBLISHED:
        return process

    if process.created_by == requester_id or _is_admin(requester_role):
        return process

    raise NotFoundError(
        "Processo nao encontrado.",
        code="PROCESS_NOT_FOUND",
    )
