"""Service de UserProgress — B-23 e B-24.

Checklist pessoal do usuario num processo. As duas operacoes publicas sao:

- `get_or_create_progress(session, user_id, process_id)`: le ou cria o
  progresso, reconciliando `step_statuses` com as etapas atuais do
  processo (adiciona novas como PENDING, remove chaves de steps
  deletados). E chamado tanto pelo GET (B-23) quanto pelo PATCH (B-24) —
  centralizar aqui evita que a rota do PATCH tenha que duvidar se o
  progresso ja foi criado.

- `update_step_status(...)`: muda o status de UMA etapa. Exige que o
  processo esteja PUBLISHED; se nao estiver, 404 (mesma regra do PATCH
  do CONTRACTS.md).

Decisao combinada (em vez da regra ingenua "sempre PUBLISHED"):
- GET: se ja existe progresso, retorna independente do status do
  processo (preserva historico em ARCHIVED). Se NAO existe, so cria em
  PUBLISHED; caso contrario 404.
- PATCH: so em PUBLISHED. DRAFT/IN_REVIEW/ARCHIVED -> 404.

Seguranca: `user_id` SEMPRE vem do JWT (o router passa
`payload.user_id`). Nenhuma funcao aqui recebe user_id de body ou query
— o unique constraint (user_id, process_id) + essa disciplina garantem
que user A nao alcanca o progresso de B (REQ-102, ADR-007).
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from app.core.enums import ProcessStatus, StepStatus
from app.core.exceptions import NotFoundError, ValidationError
from app.models.process import Process
from app.models.user_progress import UserProgress


def _load_process_with_step_ids(
    session: Session, process_id: UUID
) -> tuple[Process, list[UUID]]:
    """Busca o Process e os step_ids dele em uma unica ida ao banco.

    `selectinload(Process.steps)` dispara uma segunda query, mas evita
    N+1 (iterar `process.steps` depois ficaria carregando cada step por
    id). Retorna a lista ordenada por `order_index` — nao e usada pelo
    progresso em si mas garante ordem estavel se precisarmos debugar.

    404 com code PROCESS_NOT_FOUND quando o id nao existe — mesmo codigo
    usado em process_service para manter a superficie uniforme.
    """
    statement = (
        select(Process)
        .where(Process.id == process_id)
        .options(selectinload(Process.steps))  # type: ignore[attr-defined]
    )
    process = session.exec(statement).one_or_none()
    if process is None:
        raise NotFoundError(
            "Processo nao encontrado.",
            code="PROCESS_NOT_FOUND",
        )
    step_ids = [step.id for step in sorted(process.steps, key=lambda s: s.order_index)]
    return process, step_ids


def _reconcile_step_statuses(
    existing: dict[str, str], current_step_ids: list[UUID]
) -> tuple[dict[str, str], bool]:
    """Retorna (novo_dict, mudou).

    - Steps novos no processo aparecem como PENDING.
    - Steps que sumiram do processo somem tambem do dict.
    - Steps que ja existiam em ambos preservam seu status (PENDING /
      IN_PROGRESS / COMPLETED).

    Centralizar a logica aqui permite test unitario facil e garante que
    o mesmo algoritmo e aplicado no GET e no PATCH (no PATCH, para
    cobrir o caso do usuario que nunca chamou GET antes).
    """
    current_ids_str = {str(sid) for sid in current_step_ids}
    reconciled: dict[str, str] = {}

    for step_id_str in current_ids_str:
        if step_id_str in existing:
            reconciled[step_id_str] = existing[step_id_str]
        else:
            reconciled[step_id_str] = StepStatus.PENDING.value

    changed = reconciled != existing
    return reconciled, changed


def _find_progress(
    session: Session, *, user_id: UUID, process_id: UUID
) -> UserProgress | None:
    statement = select(UserProgress).where(
        UserProgress.user_id == user_id,
        UserProgress.process_id == process_id,
    )
    return session.exec(statement).one_or_none()


def get_or_create_progress(
    session: Session, *, user_id: UUID, process_id: UUID
) -> UserProgress:
    """Retorna o progresso do usuario no processo, criando se nao existir.

    Regras (confirmadas com o time):
    - Processo inexistente -> NotFoundError (PROCESS_NOT_FOUND).
    - Se progresso ja existe, retorna mesmo que o processo esteja
      DRAFT/IN_REVIEW/ARCHIVED (preserva historico).
    - Se NAO existe e o processo nao esta PUBLISHED, 404 tambem —
      um usuario comum nao deve conseguir "materializar" progresso em
      um rascunho.
    - Sempre reconcilia `step_statuses` com as etapas atuais do processo.
    """
    process, step_ids = _load_process_with_step_ids(session, process_id)
    progress = _find_progress(session, user_id=user_id, process_id=process_id)

    if progress is None:
        if process.status != ProcessStatus.PUBLISHED:
            # Nao criamos progresso em processo nao publicado — mesmo 404
            # que usamos para "processo inexistente" evita vazar a
            # existencia de um rascunho para usuarios nao-admin.
            raise NotFoundError(
                "Processo nao encontrado.",
                code="PROCESS_NOT_FOUND",
            )

        initial_statuses = {
            str(step_id): StepStatus.PENDING.value for step_id in step_ids
        }
        progress = UserProgress(
            user_id=user_id,
            process_id=process_id,
            step_statuses=initial_statuses,
            last_updated=datetime.now(timezone.utc),
        )
        session.add(progress)
        session.commit()
        session.refresh(progress)
        return progress

    reconciled, changed = _reconcile_step_statuses(progress.step_statuses, step_ids)
    if changed:
        # Reatribuir o dict inteiro e o padrao usado nos testes de B-22
        # para garantir deteccao da mudanca pelo SQLAlchemy mesmo em
        # JSON (sem mutation tracking nativo).
        progress.step_statuses = reconciled
        progress.last_updated = datetime.now(timezone.utc)
        session.add(progress)
        session.commit()
        session.refresh(progress)
    return progress


def update_step_status(
    session: Session,
    *,
    user_id: UUID,
    process_id: UUID,
    step_id: UUID,
    status: StepStatus,
) -> UserProgress:
    """Muda o status de uma etapa no progresso do usuario.

    Validacoes:
    - Processo deve existir e estar PUBLISHED (senao 404). Nao deixamos
      editar checklist em rascunho nem em arquivado — ARCHIVED no GET e
      "read-only", entao o PATCH tem que recusar.
    - `step_id` precisa pertencer a `process_id` (mitigacao de IDOR).
      Se nao pertence, 404 STEP_NOT_FOUND — mesmo codigo do admin em
      process_service._load_step_in_process.
    - Reconciliar antes do update garante que a chave recem-editada vai
      sobreviver a proxima passagem (caso o admin tenha removido/
      adicionado steps entre o GET inicial do cliente e este PATCH).

    O valor `status` chega ja como enum (Pydantic valida no schema) —
    qualquer string fora do enum e 422 antes de entrar aqui.
    """
    process, step_ids = _load_process_with_step_ids(session, process_id)

    if process.status != ProcessStatus.PUBLISHED:
        raise NotFoundError(
            "Processo nao encontrado.",
            code="PROCESS_NOT_FOUND",
        )

    if step_id not in step_ids:
        raise NotFoundError(
            "Etapa nao encontrada neste processo.",
            code="STEP_NOT_FOUND",
        )

    # Nao e erro o usuario atualizar status sem ter chamado GET antes:
    # cria o progresso implicitamente (PUBLISHED ja foi validado acima).
    progress = _find_progress(session, user_id=user_id, process_id=process_id)
    if progress is None:
        progress = UserProgress(
            user_id=user_id,
            process_id=process_id,
            step_statuses={str(sid): StepStatus.PENDING.value for sid in step_ids},
            last_updated=datetime.now(timezone.utc),
        )
        session.add(progress)
        session.commit()
        session.refresh(progress)

    reconciled, _ = _reconcile_step_statuses(progress.step_statuses, step_ids)

    # Checagem de sanidade: apos reconciliar, a chave do step alvo tem que
    # existir. Se nao existir, algo muito estranho aconteceu (race entre
    # DELETE da etapa pelo admin e este PATCH). Devolvemos o mesmo 404
    # STEP_NOT_FOUND — consistente com o bloqueio IDOR acima.
    step_key = str(step_id)
    if step_key not in reconciled:
        raise NotFoundError(
            "Etapa nao encontrada neste processo.",
            code="STEP_NOT_FOUND",
        )

    # Defesa em profundidade: em teoria `status` ja e StepStatus (validado
    # pelo schema), mas converter explicitamente aqui evita gravar um
    # valor arbitrario se algum chamador interno futuro pular o schema.
    if not isinstance(status, StepStatus):
        raise ValidationError(
            "Status invalido.",
            code="VALIDATION_ERROR",
        )

    reconciled[step_key] = status.value
    progress.step_statuses = reconciled
    progress.last_updated = datetime.now(timezone.utc)
    session.add(progress)
    session.commit()
    session.refresh(progress)
    return progress
