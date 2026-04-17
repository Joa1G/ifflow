"""Service de autenticacao — logica de negocio para registro e login.

Services NAO conhecem FastAPI (sem HTTPException, Depends). Levantam excecoes
de app.core.exceptions que os routers traduzem para HTTP.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.config import settings
from app.core.enums import UserRole, UserStatus
from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    UnauthenticatedError,
    ValidationError,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.email.client import send_email
from app.email.templates import password_reset_email
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.schemas.auth import RegisterRequest

PASSWORD_RESET_TOKEN_EXPIRATION_HOURS = 1


@dataclass
class LoginResult:
    user: User
    access_token: str
    expires_in: int


# Hash pre-computado usado quando o email nao existe, para equalizar o tempo de
# resposta entre "email inexistente" e "senha errada" (mitigacao de timing
# attack para enumeracao de usuarios). Computado lazy para nao atrasar o import.
_DUMMY_PASSWORD_HASH: str | None = None


def _dummy_hash() -> str:
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = hash_password("ifflow-timing-safety-dummy")
    return _DUMMY_PASSWORD_HASH


def register_user(session: Session, data: RegisterRequest) -> User:
    """Cria usuario em status PENDING. Nao faz login automatico."""
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise ConflictError(
            "Este email ja esta cadastrado.",
            code="EMAIL_ALREADY_EXISTS",
        )

    user = User(
        name=data.name,
        email=data.email,
        siape=data.siape,
        sector=data.sector,
        password_hash=hash_password(data.password),
        role=UserRole.USER,
        status=UserStatus.PENDING,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def authenticate_user(session: Session, email: str, password: str) -> LoginResult:
    """Valida credenciais e retorna token + dados do usuario.

    Regras:
    - Email inexistente ou senha errada -> INVALID_CREDENTIALS (mesma mensagem,
      para nao vazar quais emails estao cadastrados).
    - Status PENDING -> ACCOUNT_PENDING (403).
    - Status REJECTED -> ACCOUNT_REJECTED (403).
    - Aprovado -> emite JWT com expiracao de `settings.jwt_expiration_hours`.
    """
    user = session.exec(select(User).where(User.email == email)).first()

    if user is None:
        # Rodamos verify_password mesmo sem user para que o tempo de resposta
        # nao revele a existencia do email (timing attack).
        verify_password(password, _dummy_hash())
        raise UnauthenticatedError(
            "Email ou senha incorretos.",
            code="INVALID_CREDENTIALS",
        )

    if not verify_password(password, user.password_hash):
        raise UnauthenticatedError(
            "Email ou senha incorretos.",
            code="INVALID_CREDENTIALS",
        )

    if user.status == UserStatus.PENDING:
        raise ForbiddenError(
            "Seu cadastro ainda nao foi aprovado pelo administrador.",
            code="ACCOUNT_PENDING",
        )

    if user.status == UserStatus.REJECTED:
        raise ForbiddenError(
            "Seu cadastro foi rejeitado. Entre em contato com o administrador.",
            code="ACCOUNT_REJECTED",
        )

    access_token = create_access_token(user.id, user.role)
    expires_in = settings.jwt_expiration_hours * 3600
    return LoginResult(user=user, access_token=access_token, expires_in=expires_in)


def _hash_reset_token(token: str) -> str:
    """SHA-256 em hex. Armazenamos so o hash; o token em claro vai no email."""
    return hashlib.sha256(token.encode()).hexdigest()


def request_password_reset(session: Session, email: str) -> None:
    """Gera token, grava o hash e envia email com link de redefinicao.

    Silencioso por design: se o email nao existe ou o user nao esta APPROVED,
    nada acontece. O endpoint sempre retorna 200 para nao vazar existencia
    de conta (CONTRACTS.md e REQ de seguranca).
    """
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or user.status != UserStatus.APPROVED:
        return

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_reset_token(token),
        expires_at=now + timedelta(hours=PASSWORD_RESET_TOKEN_EXPIRATION_HOURS),
    )
    session.add(reset)
    session.commit()

    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    subject, html = password_reset_email(user.name, reset_url)
    send_email(to=user.email, subject=subject, html=html)


def confirm_password_reset(session: Session, token: str, new_password: str) -> None:
    """Valida o token e atualiza a senha do usuario.

    Erros (todos com code INVALID_RESET_TOKEN e mensagem identica — nao
    revelar se o token nao existe, se expirou, ou se ja foi usado):
    - Token nao encontrado
    - Token expirado (expires_at < now)
    - Token ja usado (used_at != null)
    - User dono do token foi deletado

    Em caso de sucesso, marca used_at e atualiza password_hash + updated_at
    do user em uma unica transacao.
    """
    reset = session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == _hash_reset_token(token)
        )
    ).first()

    now = datetime.now(timezone.utc)
    # SQLite (testes) devolve datetime naive mesmo quando o valor foi
    # persistido como aware. Normalizamos tratando o valor do banco como UTC.
    if reset is not None:
        expires_at = reset.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    if reset is None or reset.used_at is not None or expires_at < now:
        raise ValidationError(
            "Token de redefinicao invalido ou expirado.",
            code="INVALID_RESET_TOKEN",
        )

    user = session.get(User, reset.user_id)
    if user is None:
        raise ValidationError(
            "Token de redefinicao invalido ou expirado.",
            code="INVALID_RESET_TOKEN",
        )

    user.password_hash = hash_password(new_password)
    user.updated_at = now
    reset.used_at = now
    session.add(user)
    session.add(reset)
    session.commit()
