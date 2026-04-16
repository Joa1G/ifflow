"""Service de autenticacao — logica de negocio para registro e login.

Services NAO conhecem FastAPI (sem HTTPException, Depends). Levantam excecoes
de app.core.exceptions que os routers traduzem para HTTP.
"""

from dataclasses import dataclass

from sqlmodel import Session, select

from app.config import settings
from app.core.enums import UserRole, UserStatus
from app.core.exceptions import ConflictError, ForbiddenError, UnauthenticatedError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import RegisterRequest


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
