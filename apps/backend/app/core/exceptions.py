"""Excecoes customizadas do dominio.

Services NUNCA importam fastapi (HTTPException, etc) — eles levantam estas
excecoes, e os handlers em `app.main` traduzem para o `ErrorResponse` padrao
do CONTRACTS.md:

    {"error": {"code": "...", "message": "...", "details": {...}}}
"""

from typing import Any


class IFFLOWError(Exception):
    """Base de todas as excecoes de dominio. Carrega code, message e http_status."""

    code: str = "INTERNAL_ERROR"
    http_status: int = 500
    default_message: str = "Erro interno do servidor."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.default_message
        if code is not None:
            self.code = code
        self.details: dict[str, Any] = details or {}
        super().__init__(self.message)


class UnauthenticatedError(IFFLOWError):
    code = "UNAUTHENTICATED"
    http_status = 401
    default_message = "Autenticacao necessaria."


class ForbiddenError(IFFLOWError):
    code = "FORBIDDEN"
    http_status = 403
    default_message = "Voce nao tem permissao para esta acao."


class NotFoundError(IFFLOWError):
    code = "NOT_FOUND"
    http_status = 404
    default_message = "Recurso nao encontrado."


class ConflictError(IFFLOWError):
    code = "CONFLICT"
    http_status = 409
    default_message = "Conflito com o estado atual do recurso."


class ValidationError(IFFLOWError):
    code = "VALIDATION_ERROR"
    http_status = 400
    default_message = "Dados de entrada invalidos."
