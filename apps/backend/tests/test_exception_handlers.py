"""Testa que cada excecao customizada vira um ErrorResponse padrao do CONTRACTS.md."""

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.core.exceptions import (
    ConflictError,
    ForbiddenError,
    IFFLOWError,
    NotFoundError,
    UnauthenticatedError,
    ValidationError,
)
from app.main import (
    ifflow_exception_handler,
    validation_exception_handler,
)


@pytest.fixture()
def test_app():
    """App isolado com rotas que disparam cada excecao para testar handlers."""
    app = FastAPI()
    app.add_exception_handler(IFFLOWError, ifflow_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    @app.get("/raise/unauthenticated")
    def _raise_unauthenticated():
        raise UnauthenticatedError("nao autenticado", code="UNAUTHENTICATED")

    @app.get("/raise/forbidden")
    def _raise_forbidden():
        raise ForbiddenError("sem permissao", code="FORBIDDEN")

    @app.get("/raise/not-found")
    def _raise_not_found():
        raise NotFoundError("nao existe", code="NOT_FOUND")

    @app.get("/raise/conflict")
    def _raise_conflict():
        raise ConflictError(
            "ja existe",
            code="EMAIL_ALREADY_EXISTS",
            details={"field": "email"},
        )

    @app.get("/raise/validation")
    def _raise_validation():
        raise ValidationError("dado invalido", code="WEAK_PASSWORD")

    class Body(BaseModel):
        name: str
        age: int

    @app.post("/echo")
    def _echo(body: Body):
        return body

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    "path,expected_status,expected_code",
    [
        ("/raise/unauthenticated", 401, "UNAUTHENTICATED"),
        ("/raise/forbidden", 403, "FORBIDDEN"),
        ("/raise/not-found", 404, "NOT_FOUND"),
        ("/raise/conflict", 409, "EMAIL_ALREADY_EXISTS"),
        ("/raise/validation", 400, "WEAK_PASSWORD"),
    ],
)
def test_handler_translates_exception_to_error_response(
    test_app, path, expected_status, expected_code
):
    response = test_app.get(path)
    assert response.status_code == expected_status

    body = response.json()
    assert set(body.keys()) == {"error"}
    assert set(body["error"].keys()) == {"code", "message", "details"}
    assert body["error"]["code"] == expected_code
    assert isinstance(body["error"]["message"], str)
    assert isinstance(body["error"]["details"], dict)


def test_conflict_handler_preserves_details(test_app):
    response = test_app.get("/raise/conflict")
    assert response.json()["error"]["details"] == {"field": "email"}


def test_request_validation_error_returns_422_with_padded_format(test_app):
    response = test_app.post("/echo", json={"name": "joao"})  # falta age
    assert response.status_code == 422

    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "errors" in body["error"]["details"]
    assert isinstance(body["error"]["details"]["errors"], list)
    assert len(body["error"]["details"]["errors"]) >= 1


def test_handlers_dont_leak_internal_details():
    """Excecao nao registrada nao deve vazar stack trace na resposta."""
    app = FastAPI()
    app.add_exception_handler(IFFLOWError, ifflow_exception_handler)

    @app.get("/boom")
    def _boom():
        raise RuntimeError("detalhe interno secreto SQL=...")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom")
    # Sem handler customizado, FastAPI/Starlette retorna 500 generico.
    assert response.status_code == 500
    assert "detalhe interno secreto" not in response.text
