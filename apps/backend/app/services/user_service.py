"""Service de moderacao e gestao de papeis de usuarios.

Services NAO conhecem FastAPI (sem HTTPException, Depends). Levantam excecoes
de app.core.exceptions que os routers traduzem para HTTP.

Regras gerais:
- Apenas usuarios em status PENDING podem ser aprovados ou rejeitados aqui.
  Tentar moderar um usuario ja APPROVED ou REJECTED e 409 (USER_NOT_PENDING),
  porque o estado e terminal — mudar exige outra acao (ex: rebaixar super-admin).
- O moderador nao pode aprovar/rejeitar a si mesmo: defense in depth contra
  escalonamento acidental de privilegio (o super_admin inicial vem do seed em
  status APPROVED, entao em pratica a checagem so e alcancavel por bug).
- Email de notificacao e best-effort: send_email nao relevanta em prod (ADR-013).
  O status ja foi commitado antes do envio, entao uma falha de email nao desfaz
  a moderacao.
- Promocao/rebaixamento (B-13) e acao de super_admin. O self-check e o
  bloqueio de rebaixar outro SUPER_ADMIN sao as duas travas que impedem o
  sistema de ficar sem nenhum super_admin ativo.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Session, select

from app.core.enums import UserRole, UserStatus
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.email.client import send_email
from app.email.templates import account_approved_email, account_rejected_email
from app.models.user import User

logger = logging.getLogger(__name__)


def list_pending_users(session: Session) -> list[User]:
    """Retorna todos os usuarios aguardando moderacao, mais antigos primeiro.

    Ordenacao por created_at asc da primazia a quem esperou mais — evita
    starvation em filas grandes e da previsibilidade ao admin.
    """
    statement = (
        select(User)
        .where(User.status == UserStatus.PENDING)
        .order_by(User.created_at.asc())  # type: ignore[attr-defined]
    )
    return list(session.exec(statement).all())


def _load_pending_target(session: Session, user_id: UUID, moderator_id: UUID) -> User:
    """Centraliza as checagens comuns a approve/reject.

    Ordem proposital:
    1. Self-check (403) ANTES do lookup: se alguem manda o proprio id, isso e
       evidencia de intencao suspeita — responder antes de revelar qualquer
       informacao sobre o target.
    2. NotFound (404) se user nao existe.
    3. Conflict (409) se user nao esta mais em PENDING.
    """
    if user_id == moderator_id:
        raise ForbiddenError(
            "Nao e possivel moderar o proprio cadastro.",
            code="CANNOT_MODERATE_SELF",
        )

    user = session.get(User, user_id)
    if user is None:
        raise NotFoundError(
            "Usuario nao encontrado.",
            code="USER_NOT_FOUND",
        )

    if user.status != UserStatus.PENDING:
        raise ConflictError(
            f"Cadastro ja foi moderado (status atual: {user.status.value}).",
            code="USER_NOT_PENDING",
            details={"current_status": user.status.value},
        )

    return user


def approve_user(session: Session, user_id: UUID, moderator_id: UUID) -> User:
    """Aprova um cadastro PENDING e envia email de notificacao.

    O commit acontece antes do envio do email — se o send_email lancar (nao
    lanca em prod, mas o tipo nao impede), o status ja foi persistido.
    """
    user = _load_pending_target(session, user_id, moderator_id)

    user.status = UserStatus.APPROVED
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    subject, html = account_approved_email(user.name)
    send_email(to=user.email, subject=subject, html=html)

    return user


def reject_user(
    session: Session,
    user_id: UUID,
    moderator_id: UUID,
    reason: str | None = None,
) -> User:
    """Rejeita um cadastro PENDING e envia email com motivo opcional.

    Nao deleta o user — apenas muda o status. Isso preserva o registro para
    auditoria (LGPD) e impede reuso do mesmo email para um novo cadastro
    sem passar novamente pela moderacao.

    `reason` vazio/None vira um email generico pedindo contato com a
    administracao (ver template account_rejected_email).
    """
    user = _load_pending_target(session, user_id, moderator_id)

    user.status = UserStatus.REJECTED
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    # Normaliza string vazia para None antes de passar ao template — o template
    # ja trata None, e isso evita um bloco de "Motivo:" sem conteudo.
    effective_reason = reason.strip() if reason and reason.strip() else None
    subject, html = account_rejected_email(user.name, effective_reason)
    send_email(to=user.email, subject=subject, html=html)

    return user


def promote_to_admin(session: Session, user_id: UUID, requester_id: UUID) -> User:
    """Promove USER (APPROVED) para ADMIN. Router deve exigir SUPER_ADMIN.

    Exclui intencionalmente:
    - ADMIN -> USER_ALREADY_ADMIN (operacao no-op).
    - SUPER_ADMIN -> CANNOT_PROMOTE_ROLE (e o topo, nao ha para onde subir).
    - Qualquer status != APPROVED -> USER_NOT_APPROVED (nao faz sentido dar
      privilegios a quem nao passou pela moderacao).
    """
    user = session.get(User, user_id)
    if user is None:
        raise NotFoundError("Usuario nao encontrado.", code="USER_NOT_FOUND")

    if user.role == UserRole.ADMIN:
        raise ConflictError(
            "Usuario ja e ADMIN.",
            code="USER_ALREADY_ADMIN",
            details={"current_role": user.role.value},
        )

    if user.role != UserRole.USER:
        raise ConflictError(
            "Apenas usuarios com role USER podem ser promovidos.",
            code="CANNOT_PROMOTE_ROLE",
            details={"current_role": user.role.value},
        )

    if user.status != UserStatus.APPROVED:
        raise ConflictError(
            "Apenas usuarios aprovados podem ser promovidos.",
            code="USER_NOT_APPROVED",
            details={"current_status": user.status.value},
        )

    user.role = UserRole.ADMIN
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    # Auditoria leve — B-25 substituira por logging estruturado + trilha persistente.
    logger.info(
        "role_change promote requester=%s target=%s new_role=ADMIN",
        requester_id,
        user.id,
    )

    return user


def demote_to_user(session: Session, user_id: UUID, requester_id: UUID) -> User:
    """Rebaixa ADMIN para USER. Router deve exigir SUPER_ADMIN.

    Ordem das checagens:
    1. Self-check (403 CANNOT_DEMOTE_SELF) antes do lookup — impede o super_admin
       inicial de se auto-rebaixar e deixar o sistema sem nenhum super_admin.
    2. NotFound.
    3. 403 CANNOT_DEMOTE_SUPER_ADMIN: rebaixamento entre super_admins esta
       proibido por politica (decisao de equipe, nao apenas protecao do self).
    4. 409 USER_NOT_ADMIN se o alvo ja e USER comum.
    """
    if user_id == requester_id:
        raise ForbiddenError(
            "Nao e possivel rebaixar o proprio cadastro.",
            code="CANNOT_DEMOTE_SELF",
        )

    user = session.get(User, user_id)
    if user is None:
        raise NotFoundError("Usuario nao encontrado.", code="USER_NOT_FOUND")

    if user.role == UserRole.SUPER_ADMIN:
        raise ForbiddenError(
            "Nao e possivel rebaixar um SUPER_ADMIN.",
            code="CANNOT_DEMOTE_SUPER_ADMIN",
        )

    if user.role == UserRole.USER:
        raise ConflictError(
            "Usuario ja e USER comum.",
            code="USER_NOT_ADMIN",
            details={"current_role": user.role.value},
        )

    user.role = UserRole.USER
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    logger.info(
        "role_change demote requester=%s target=%s new_role=USER",
        requester_id,
        user.id,
    )

    return user
