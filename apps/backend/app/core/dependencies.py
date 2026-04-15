"""Dependencies de autenticacao e autorizacao.

Routers usam estas dependencies — nunca leem `Authorization` header
manualmente.

NOTA SOBRE TRADE-OFF: get_current_user_payload nao faz query no banco a cada
request. A role e lida do JWT. Beneficio: zero overhead de DB por request.
Custo: se um admin for rebaixado para USER, o JWT antigo continua valido ate
expirar (max 24h, conforme settings.jwt_expiration_hours). Aceitavel no MVP
— a janela e curta e o impacto e limitado a um unico usuario problematico.
Quando B-03 estiver pronta, criaremos um get_current_user que carrega o User
do banco para casos que precisam dos campos completos (e que nao sao
hot-path).
"""

from collections.abc import Callable

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.enums import UserRole
from app.core.exceptions import ForbiddenError, UnauthenticatedError
from app.core.security import TokenPayload, decode_access_token

# auto_error=False: queremos retornar o ErrorResponse padrao em vez do default
# 403 do FastAPI quando o header Authorization esta ausente.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> TokenPayload:
    if credentials is None or not credentials.credentials:
        raise UnauthenticatedError(
            "Autenticacao necessaria.",
            code="UNAUTHENTICATED",
        )
    return decode_access_token(credentials.credentials)


# Hierarquia de privilegios: papeis acima cobrem os de baixo. Garantir que
# require_role(USER) tambem aceite ADMIN e SUPER_ADMIN, etc.
_ROLE_LEVEL: dict[UserRole, int] = {
    UserRole.USER: 1,
    UserRole.ADMIN: 2,
    UserRole.SUPER_ADMIN: 3,
}


def require_role(*allowed_roles: UserRole) -> Callable[[TokenPayload], TokenPayload]:
    """Cria uma dependency que aceita apenas tokens cujo role >= menor allowed."""
    if not allowed_roles:
        raise ValueError("require_role precisa de ao menos um role.")
    min_required_level = min(_ROLE_LEVEL[r] for r in allowed_roles)

    def _checker(
        payload: TokenPayload = Depends(get_current_user_payload),
    ) -> TokenPayload:
        if _ROLE_LEVEL[payload.role] < min_required_level:
            raise ForbiddenError(
                "Voce nao tem permissao para esta acao.",
                code="FORBIDDEN",
            )
        return payload

    return _checker
