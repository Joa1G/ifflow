"""Service de moderacao de usuarios — aprovacao e rejeicao de cadastros.

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
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Session, select

from app.core.enums import UserStatus
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.email.client import send_email
from app.email.templates import account_approved_email, account_rejected_email
from app.models.user import User


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
