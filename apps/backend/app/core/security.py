"""Hash de senhas (argon2) e operacoes JWT (HS256).

Centraliza toda a criptografia do backend. Servicos chamam estas funcoes —
nunca usam passlib/jwt diretamente.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict
from pydantic import ValidationError as PydanticValidationError

from app.config import settings
from app.core.enums import UserRole
from app.core.exceptions import UnauthenticatedError

JWT_ALGORITHM = "HS256"

_pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


class TokenPayload(BaseModel):
    """Conteudo do JWT — apenas campos essenciais para autorizacao.

    Nao incluir dados sensiveis: o JWT e apenas base64, qualquer um que
    intercepte le todo o conteudo.
    """

    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    role: UserRole
    iat: int
    exp: int


def create_access_token(user_id: UUID, role: UserRole) -> str:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=settings.jwt_expiration_hours)
    payload = {
        "user_id": str(user_id),
        "role": role.value,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> TokenPayload:
    """Decodifica e valida o JWT. Levanta UnauthenticatedError em qualquer falha.

    Os codigos de erro distinguem token expirado (UNAUTHENTICATED) de token
    malformado/com assinatura invalida (INVALID_TOKEN), conforme CONTRACTS.md.
    """
    try:
        decoded = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthenticatedError(
            "Sessao expirada. Faca login novamente.",
            code="UNAUTHENTICATED",
        ) from exc
    except jwt.InvalidTokenError as exc:
        # Cobre assinatura invalida, claims faltando, formato invalido.
        raise UnauthenticatedError(
            "Token invalido.",
            code="INVALID_TOKEN",
        ) from exc

    try:
        return TokenPayload.model_validate(decoded)
    except PydanticValidationError as exc:
        raise UnauthenticatedError(
            "Token invalido.",
            code="INVALID_TOKEN",
        ) from exc
