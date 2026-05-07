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
- ARCHIVED e terminal para edicao direta: nao se edita um processo arquivado.
  Admin pode `restore_process` (volta para DRAFT) ou `delete_process_permanently`
  (remove em definitivo, com cascade nos steps/resources/user_progress).
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
    StepResourceUpdate,
)

logger = logging.getLogger(__name__)


# Statuses que contam como "proposta pendente" (bloqueia mutacoes no original
# pela decisao 6A). ARCHIVED e PUBLISHED nao contam — o slot fica liberado.
_PENDING_PROPOSAL_STATUSES = (ProcessStatus.DRAFT, ProcessStatus.IN_REVIEW)


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


# ---------- Proposta de edicao: helpers de leitura (B-30) ----------
#
# `pending_proposal_id` e um campo computado em ProcessAdminView — nao existe
# no model, e calculado a partir de uma subquery em `processes` apontando de
# volta para o original (proposed_change_for == original.id) com status
# pendente. Centralizar as duas formas de leitura (single e batch) aqui evita
# N+1 nos endpoints de listagem.


def get_pending_proposal_id(session: Session, process_id: UUID) -> UUID | None:
    """Id da proposta pendente apontando para `process_id`, ou None.

    "Pendente" = DRAFT ou IN_REVIEW. ARCHIVED e PUBLISHED nao contam: a
    primeira porque ja foi rejeitada/limpa, a segunda porque uma proposta
    nao chega a virar PUBLISHED (o approve consome a proposta e atualiza o
    original — ver `approve_process`).

    O unique partial index garante no maximo um resultado.
    """
    statement = select(Process.id).where(
        Process.proposed_change_for == process_id,
        Process.status.in_(_PENDING_PROPOSAL_STATUSES),  # type: ignore[attr-defined]
    )
    return session.exec(statement).one_or_none()


def get_pending_proposal_id_map(
    session: Session, process_ids: list[UUID]
) -> dict[UUID, UUID]:
    """Versao batch para listagens — `{original_id: proposal_id}`.

    Uma unica query para todos os ids, evitando N+1 em GET /admin/processes
    e GET /processes/mine. Ids sem proposta pendente nao aparecem no dict —
    o caller checa com `.get(pid)` e ja recebe None.
    """
    if not process_ids:
        return {}
    statement = select(Process.id, Process.proposed_change_for).where(
        Process.proposed_change_for.in_(process_ids),  # type: ignore[attr-defined]
        Process.status.in_(_PENDING_PROPOSAL_STATUSES),  # type: ignore[attr-defined]
    )
    rows = session.exec(statement).all()
    return {original_id: proposal_id for proposal_id, original_id in rows}


def _assert_no_pending_proposal(session: Session, process: Process) -> None:
    """Bloqueia update/archive do ORIGINAL com proposta pendente (decisao 6A).

    Workflow linear: admin precisa aprovar (merge) ou rejeitar (arquivar a
    proposta) antes de tocar no original. O check usa o id do processo
    passado — para uma proposta (ela tambem chama isso indiretamente via
    `_ensure_process_editable`), nao ha proposta apontando pra ela, entao
    passa direto.
    """
    proposal_id = get_pending_proposal_id(session, process.id)
    if proposal_id is None:
        return
    raise ConflictError(
        "Existe uma proposta de edicao pendente para este processo. "
        "Aprove ou rejeite-a antes de continuar.",
        code="PROCESS_HAS_PENDING_PROPOSAL",
        details={"proposal_id": str(proposal_id)},
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
    _assert_no_pending_proposal(session, process)

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

    # Bloqueia archive do ORIGINAL com proposta pendente (decisao 6A). Nao
    # afeta archive da PROPOSTA (rejeicao via /processes/{proposalId}) — ela
    # nao tem nenhuma proposta apontando pra ela.
    _assert_no_pending_proposal(session, process)

    process.status = ProcessStatus.ARCHIVED
    process.updated_at = datetime.now(timezone.utc)
    # Se estamos arquivando uma PROPOSTA (rejeicao), liberamos o slot do
    # unique partial index — `proposed_change_for` volta a NULL para que o
    # autor possa propor uma nova edicao mais tarde.
    if process.proposed_change_for is not None:
        process.proposed_change_for = None
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
      4. nao ha proposta de edicao pendente apontando pra ele (decisao 6A)

    A ordem importa: ownership antes de status para nao vazar a existencia
    de um DRAFT alheio via mensagem "PROCESS_LOCKED_IN_REVIEW".
    """
    process = get_process_admin(session, process_id)
    _assert_owner_or_admin(process, requester_id, requester_role)
    _assert_editable_status(process)
    _assert_no_pending_proposal(session, process)
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


def update_step_resource(
    session: Session,
    process_id: UUID,
    step_id: UUID,
    resource_id: UUID,
    data: StepResourceUpdate,
    *,
    requester_id: UUID,
    requester_role: UserRole,
) -> StepResource:
    """Edita um recurso. Tripla validacao IDOR (process editavel, step no
    process, resource no step). `model_dump(exclude_unset=True)` permite
    PATCH parcial; `url=None` ou `content=None` explicitos limpam o campo."""
    _ensure_process_editable(
        session, process_id, requester_id=requester_id, requester_role=requester_role
    )
    _load_step_in_process(session, process_id, step_id)
    resource = _load_resource_in_step(session, step_id, resource_id)

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(resource, field, value)

    resource.updated_at = datetime.now(timezone.utc)
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
    """DRAFT -> IN_REVIEW. Owner ou admin. Outro estado e 409.

    Para uma PROPOSTA de edicao (proposed_change_for set), tambem valida
    que o original ainda esta PUBLISHED — submeter uma proposta cuja base
    foi arquivada nao faz sentido e ia explodir no approve depois.
    """
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

    if process.proposed_change_for is not None:
        original = session.get(Process, process.proposed_change_for)
        if original is None or original.status != ProcessStatus.PUBLISHED:
            raise ConflictError(
                "A versao publicada deste processo nao esta mais ativa. "
                "Esta proposta nao pode ser submetida.",
                code="PROPOSAL_BASE_NOT_PUBLISHED",
                details={
                    "current_status": (
                        original.status.value if original is not None else None
                    ),
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
    """IN_REVIEW -> PUBLISHED, OU merge de proposta de edicao no original.

    Dois caminhos:

    1. Caminho legado: target e um processo "comum" (sem proposed_change_for).
       Aplica a transicao IN_REVIEW -> PUBLISHED, seta approved_by, retorna o
       proprio target atualizado.

    2. Caminho B-30: target e uma PROPOSTA (proposed_change_for set). Carrega
       o original, faz o merge ID-preserving (ver _apply_proposal_merge),
       hard-deleta a proposta, atualiza approved_by/updated_at do original,
       e retorna o ORIGINAL — que continua PUBLISHED. A proposta some.

    `approver_id` e sempre o do usuario autenticado, NUNCA do body — o router
    passa `auth.user_id`.

    No MVP, um admin pode aprovar o proprio processo (decisao da equipe — ver
    CONTRACTS.md). Registramos em log WARNING quando isso acontece para servir
    de trilha de auditoria ate termos logging estruturado (B-27).
    """
    target = get_process_admin(session, process_id)

    if target.status != ProcessStatus.IN_REVIEW:
        raise ConflictError(
            "Apenas processos em IN_REVIEW podem ser aprovados.",
            code="INVALID_STATE_TRANSITION",
            details={
                "current_status": target.status.value,
                "required_status": ProcessStatus.IN_REVIEW.value,
            },
        )

    if target.proposed_change_for is not None:
        # Caminho B-30: aprovar uma proposta = merge no original.
        return _approve_proposal(session, target, approver_id=approver_id)

    target.status = ProcessStatus.PUBLISHED
    target.approved_by = approver_id
    target.updated_at = datetime.now(timezone.utc)
    session.add(target)
    session.commit()
    session.refresh(target)

    if approver_id == target.created_by:
        # Auto-aprovacao permitida no MVP mas registrada. B-27 vai transformar
        # isso em evento estruturado persistido.
        logger.warning(
            "process_self_approval process_id=%s approver=%s",
            target.id,
            approver_id,
        )

    return target


def _approve_proposal(
    session: Session, proposal: Process, *, approver_id: UUID
) -> Process:
    """Aprovacao de proposta de edicao (B-30). Mantem o id do original.

    Sequencia:
    1. Carrega original com steps + resources via selectinload (sem N+1).
    2. Defesa em profundidade: original tem que estar PUBLISHED. A decisao
       6A bloqueia archive do original com proposta pendente, mas se algo
       furar (e.g. delete_process_permanently nao bloqueia hoje), ainda
       falhamos cedo aqui em vez de apagar o progresso silenciosamente.
    3. Carrega proposta com steps + resources tambem via selectinload — vamos
       iterar sobre eles antes de hard-deletar a proposta.
    4. Merge ID-preserving (ver _apply_proposal_merge): updates, deletes e
       inserts no original baseados em cloned_from_*.
    5. Hard-delete da proposta (cascade ORM apaga seus steps e resources).
    6. Atualiza approved_by/updated_at do original.
    """
    original = _load_process_with_full_flow(session, proposal.proposed_change_for)
    if original is None or original.status != ProcessStatus.PUBLISHED:
        raise ConflictError(
            "A versao publicada deste processo nao esta mais ativa. "
            "A proposta nao pode ser aprovada.",
            code="PROPOSAL_BASE_NOT_PUBLISHED",
            details={
                "current_status": (
                    original.status.value if original is not None else None
                ),
            },
        )

    # Carrega a proposta com flow completo. Embora `proposal` ja seja a row,
    # forcamos eager loading dos steps/resources/cloned_from para iterar com
    # seguranca antes do delete cascade.
    proposal_full = _load_process_with_full_flow(session, proposal.id)
    assert proposal_full is not None  # acabamos de carregar a row pelo target

    _apply_proposal_merge(session, original=original, proposal=proposal_full)

    original.approved_by = approver_id
    original.updated_at = datetime.now(timezone.utc)
    session.add(original)
    session.delete(proposal_full)
    session.commit()
    session.refresh(original)

    if approver_id == original.created_by:
        logger.warning(
            "process_proposal_self_approval original_id=%s approver=%s",
            original.id,
            approver_id,
        )

    return original


def _load_process_with_full_flow(session: Session, process_id: UUID) -> Process | None:
    """SELECT do processo + steps + resources em poucas queries (selectinload).

    Usado pelo merge da aprovacao de proposta. Retorna None se nao achar —
    permite o caller responder com 404/409 conforme o contexto.
    """
    statement = (
        select(Process)
        .where(Process.id == process_id)
        .options(
            selectinload(Process.steps).selectinload(FlowStep.resources),  # type: ignore[attr-defined]
        )
    )
    return session.exec(statement).one_or_none()


def _apply_proposal_merge(
    session: Session, *, original: Process, proposal: Process
) -> None:
    """Merge ID-preserving (decisao 5B). Mutaciona `original` no lugar.

    Estrategia:
    - Steps da proposta com `cloned_from_step_id` apontando pra um step do
      original que ainda existe -> UPDATE in-place (preserva o id; o
      progresso pessoal indexado por step_id nao reseta).
    - Steps do original sem correspondencia na proposta -> DELETE (cascade
      apaga resources via cascade ORM).
    - Steps da proposta sem correspondencia (cloned_from None ou apontando
      pra step que sumiu) -> INSERT como step novo no original (id novo).
    - Para cada step preservado, aplica a mesma logica nos resources via
      `cloned_from_resource_id`.
    - Por fim, copia metadados do proposal pro original.

    Como os steps do `original` ja foram carregados via selectinload, eles
    estao em memoria — nao precisamos re-querar. O caller (`_approve_proposal`)
    da o commit que persiste tudo.
    """
    now = datetime.now(timezone.utc)

    # Index original.steps por id pra lookup O(1). Convertemos em lista pra
    # evitar mutacao do collection durante iteracao no SQLAlchemy.
    orig_steps_by_id: dict[UUID, FlowStep] = {step.id: step for step in original.steps}
    matched_orig_step_ids: set[UUID] = set()

    new_steps_payload: list[FlowStep] = []
    for prop_step in proposal.steps:
        match_id = prop_step.cloned_from_step_id
        if match_id is not None and match_id in orig_steps_by_id:
            orig_step = orig_steps_by_id[match_id]
            orig_step.title = prop_step.title
            orig_step.description = prop_step.description
            orig_step.responsible = prop_step.responsible
            orig_step.sector_id = prop_step.sector_id
            orig_step.order_index = prop_step.order_index
            orig_step.estimated_time = prop_step.estimated_time
            orig_step.updated_at = now
            session.add(orig_step)
            matched_orig_step_ids.add(match_id)
            _apply_step_resource_merge(
                session, orig_step=orig_step, prop_step=prop_step, now=now
            )
        else:
            new_steps_payload.append(prop_step)

    # Deletes pros steps do original sem match na proposta. Cascade ORM
    # (Process.steps tem cascade="all, delete-orphan") apaga os resources.
    for orig_id, orig_step in orig_steps_by_id.items():
        if orig_id not in matched_orig_step_ids:
            session.delete(orig_step)

    # Inserts dos steps novos da proposta. O cloned_from_step_id NAO e
    # copiado — esses steps agora sao "originais" do processo, sem origem
    # rastreavel.
    for prop_step in new_steps_payload:
        new_step = FlowStep(
            process_id=original.id,
            sector_id=prop_step.sector_id,
            order_index=prop_step.order_index,
            title=prop_step.title,
            description=prop_step.description,
            responsible=prop_step.responsible,
            estimated_time=prop_step.estimated_time,
            cloned_from_step_id=None,
            created_at=now,
            updated_at=now,
        )
        session.add(new_step)
        for prop_res in prop_step.resources:
            session.add(
                StepResource(
                    step_id=new_step.id,
                    type=prop_res.type,
                    title=prop_res.title,
                    url=prop_res.url,
                    content=prop_res.content,
                    cloned_from_resource_id=None,
                    created_at=now,
                    updated_at=now,
                )
            )

    # Metadados — copiados em bloco do proposal pro original. Notar que
    # `status` (PUBLISHED), `created_by`, `access_count`, `id` ficam fora
    # de proposito: queremos preservar o original.
    original.title = proposal.title
    original.short_description = proposal.short_description
    original.full_description = proposal.full_description
    original.category = proposal.category
    original.estimated_time = proposal.estimated_time
    original.requirements = list(proposal.requirements)


def _apply_step_resource_merge(
    session: Session,
    *,
    orig_step: FlowStep,
    prop_step: FlowStep,
    now: datetime,
) -> None:
    """Merge ID-preserving dos resources dentro de uma etapa preservada.

    Mesma logica do merge de steps, restrita ao escopo de UM step. Resources
    sao indexados por id; a proposta pode ter renomeado, criado novos ou
    pedido pra remover existentes — refletido no original via update/insert/
    delete sob o `orig_step`.
    """
    orig_res_by_id: dict[UUID, StepResource] = {
        res.id: res for res in orig_step.resources
    }
    matched_orig_res_ids: set[UUID] = set()

    new_resources_payload: list[StepResource] = []
    for prop_res in prop_step.resources:
        match_id = prop_res.cloned_from_resource_id
        if match_id is not None and match_id in orig_res_by_id:
            orig_res = orig_res_by_id[match_id]
            orig_res.type = prop_res.type
            orig_res.title = prop_res.title
            orig_res.url = prop_res.url
            orig_res.content = prop_res.content
            orig_res.updated_at = now
            session.add(orig_res)
            matched_orig_res_ids.add(match_id)
        else:
            new_resources_payload.append(prop_res)

    for orig_id, orig_res in orig_res_by_id.items():
        if orig_id not in matched_orig_res_ids:
            session.delete(orig_res)

    for prop_res in new_resources_payload:
        session.add(
            StepResource(
                step_id=orig_step.id,
                type=prop_res.type,
                title=prop_res.title,
                url=prop_res.url,
                content=prop_res.content,
                cloned_from_resource_id=None,
                created_at=now,
                updated_at=now,
            )
        )


# ---------- Proposta de edicao: criacao (B-30) ----------


def start_edit_proposal(
    session: Session, process_id: UUID, *, requester_id: UUID
) -> Process:
    """Cria (ou recupera) uma proposta de edicao para um processo PUBLISHED.

    Regras (ver WIP_PUBLISHED_PROCESS_EDIT.md):
    - O original tem que estar PUBLISHED — 409 PROCESS_NOT_PUBLISHED.
    - Apenas o autor original pode chamar — 403 PROCESS_NOT_OWNED. Admin
      edita PUBLISHED direto via /processes/{id} (decisao 2), nao usa este
      endpoint. Se admin chamar, recebe 403 tambem (e o autor original do
      processo, nao um admin qualquer, que tem direito a propor edicao).
    - Idempotente: se ja existe proposta pendente (DRAFT/IN_REVIEW)
      apontando pro original, retorna ela em vez de criar outra. O unique
      partial index na coluna `proposed_change_for` garante o invariant.

    O clone copia metadados, steps e resources, populando `cloned_from_*`
    com os ids do original. Esses ids sao usados pelo merge ao aprovar
    (decisao 5B) para preservar o id da etapa quando ela ainda existe.

    `requester_id` vem do JWT (o router passa `auth.user_id`). NUNCA do body.
    """
    original = get_process_admin(session, process_id)

    if original.status != ProcessStatus.PUBLISHED:
        raise ConflictError(
            "Apenas processos publicados podem receber propostas de edicao.",
            code="PROCESS_NOT_PUBLISHED",
            details={"current_status": original.status.value},
        )

    if original.created_by != requester_id:
        # Codigo `PROCESS_NOT_OWNED` (403) reaproveitado de
        # `_assert_owner_or_admin` — a UX e "este processo nao e seu".
        raise ForbiddenError(
            "Apenas o autor original pode propor edicoes neste processo.",
            code="PROCESS_NOT_OWNED",
        )

    existing = _find_pending_proposal(session, original.id)
    if existing is not None:
        return existing

    proposal = _clone_published_into_proposal(
        session, original=original, requester_id=requester_id
    )
    return proposal


def _find_pending_proposal(session: Session, original_id: UUID) -> Process | None:
    """Retorna a proposta pendente apontando pro original, se houver.

    Diferente de `get_pending_proposal_id` (que retorna so o id), este busca
    a row inteira para devolver na chamada idempotente.
    """
    statement = select(Process).where(
        Process.proposed_change_for == original_id,
        Process.status.in_(_PENDING_PROPOSAL_STATUSES),  # type: ignore[attr-defined]
    )
    return session.exec(statement).one_or_none()


def _clone_published_into_proposal(
    session: Session, *, original: Process, requester_id: UUID
) -> Process:
    """Clona um Process PUBLISHED em um novo DRAFT marcado como proposta.

    `created_by` da proposta e o requester (o autor que propos a edicao —
    no MVP sempre o mesmo do original, mas explicito por completude).
    `proposed_change_for` aponta pro id do original. Cada step clonado leva
    `cloned_from_step_id = original.step.id`; cada resource clonado leva
    `cloned_from_resource_id = original.resource.id`. Esses ids drivem o
    merge ID-preserving no approve.
    """
    full_original = _load_process_with_full_flow(session, original.id)
    assert full_original is not None  # acabamos de validar a existencia

    now = datetime.now(timezone.utc)
    proposal = Process(
        title=full_original.title,
        short_description=full_original.short_description,
        full_description=full_original.full_description,
        category=full_original.category,
        estimated_time=full_original.estimated_time,
        requirements=list(full_original.requirements),
        access_count=0,
        status=ProcessStatus.DRAFT,
        created_by=requester_id,
        approved_by=None,
        proposed_change_for=full_original.id,
        created_at=now,
        updated_at=now,
    )
    session.add(proposal)
    # Flush para gerar o id da proposta antes de associar steps.
    session.flush()

    for orig_step in full_original.steps:
        new_step = FlowStep(
            process_id=proposal.id,
            sector_id=orig_step.sector_id,
            order_index=orig_step.order_index,
            title=orig_step.title,
            description=orig_step.description,
            responsible=orig_step.responsible,
            estimated_time=orig_step.estimated_time,
            cloned_from_step_id=orig_step.id,
            created_at=now,
            updated_at=now,
        )
        session.add(new_step)
        session.flush()
        for orig_res in orig_step.resources:
            session.add(
                StepResource(
                    step_id=new_step.id,
                    type=orig_res.type,
                    title=orig_res.title,
                    url=orig_res.url,
                    content=orig_res.content,
                    cloned_from_resource_id=orig_res.id,
                    created_at=now,
                    updated_at=now,
                )
            )

    session.commit()
    session.refresh(proposal)
    return proposal


def restore_process(
    session: Session,
    process_id: UUID,
    *,
    requester_role: UserRole,
) -> Process:
    """ARCHIVED -> DRAFT. Apenas admin/super_admin.

    Reativa um processo arquivado para edicao. Volta sempre para DRAFT (nao
    tentamos reconstruir o status anterior — o admin re-publica via fluxo
    normal se for o caso). `approved_by` e mantido para nao apagar o
    historico de quem aprovou na vida anterior — se o processo for
    re-publicado, sera sobrescrito.
    """
    if not _is_admin(requester_role):
        raise ForbiddenError(
            "Apenas administradores podem restaurar processos arquivados.",
            code="FORBIDDEN",
        )

    process = get_process_admin(session, process_id)

    if process.status != ProcessStatus.ARCHIVED:
        raise ConflictError(
            "Apenas processos arquivados podem ser restaurados.",
            code="INVALID_STATE_TRANSITION",
            details={
                "current_status": process.status.value,
                "required_status": ProcessStatus.ARCHIVED.value,
            },
        )

    process.status = ProcessStatus.DRAFT
    process.updated_at = datetime.now(timezone.utc)
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


def delete_process_permanently(
    session: Session,
    process_id: UUID,
    *,
    requester_role: UserRole,
) -> None:
    """Hard delete. Apenas admin/super_admin, e somente em ARCHIVED.

    Forcar passagem por ARCHIVED antes do hard delete e uma rede de seguranca:
    deletar em definitivo um processo PUBLISHED apagaria progresso de servidores
    sem aviso. ARCHIVED da chance de reverter (`restore_process`).

    Cascades em jogo:
    - `Process.steps` (ORM, all/delete-orphan) -> apaga FlowStep + StepResource
      antes do DELETE no Process. Funciona em qualquer dialeto.
    - `user_progress.process_id` (FK ON DELETE CASCADE) -> apaga progresso
      individual dos usuarios. Em Postgres a integridade e do banco; em SQLite
      sem PRAGMA foreign_keys=ON o cascade nao e aplicado, mas o conftest dos
      testes nao depende disso (testes do hard delete focam em steps/resources
      e na declaracao do FK).
    """
    if not _is_admin(requester_role):
        raise ForbiddenError(
            "Apenas administradores podem excluir processos definitivamente.",
            code="FORBIDDEN",
        )

    process = get_process_admin(session, process_id)

    if process.status != ProcessStatus.ARCHIVED:
        raise ConflictError(
            "Apenas processos arquivados podem ser excluidos definitivamente.",
            code="PROCESS_NOT_DELETABLE",
            details={
                "current_status": process.status.value,
                "required_status": ProcessStatus.ARCHIVED.value,
            },
        )

    session.delete(process)
    session.commit()


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
