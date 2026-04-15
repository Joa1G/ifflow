"""Testa as dependencies de auth/role no contexto de um app FastAPI."""

from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user_payload, require_role
from app.core.enums import UserRole
from app.core.exceptions import IFFLOWError
from app.core.security import TokenPayload, create_access_token
from app.main import ifflow_exception_handler, validation_exception_handler


@pytest.fixture()
def app_with_routes():
    app = FastAPI()
    app.add_exception_handler(IFFLOWError, ifflow_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    @app.get("/me")
    def _me(payload: TokenPayload = Depends(get_current_user_payload)):
        return {"user_id": str(payload.user_id), "role": payload.role.value}

    @app.get("/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
    def _admin_only():
        return {"ok": True}

    @app.get("/super-only", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))])
    def _super_only():
        return {"ok": True}

    return TestClient(app)


def _auth_headers(role: UserRole) -> dict[str, str]:
    token = create_access_token(uuid4(), role)
    return {"Authorization": f"Bearer {token}"}


class TestGetCurrentUserPayload:
    def test_valid_token_returns_payload(self, app_with_routes):
        response = app_with_routes.get("/me", headers=_auth_headers(UserRole.USER))
        assert response.status_code == 200
        assert response.json()["role"] == "USER"

    def test_missing_authorization_returns_401_unauthenticated(self, app_with_routes):
        response = app_with_routes.get("/me")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"

    def test_malformed_token_returns_401_invalid_token(self, app_with_routes):
        response = app_with_routes.get("/me", headers={"Authorization": "Bearer xxx"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_TOKEN"

    def test_wrong_scheme_returns_401(self, app_with_routes):
        # HTTPBearer rejeita schemes diferentes de "Bearer".
        response = app_with_routes.get("/me", headers={"Authorization": "Basic abc"})
        assert response.status_code == 401


class TestRequireRole:
    def test_admin_can_access_admin_route(self, app_with_routes):
        response = app_with_routes.get(
            "/admin-only", headers=_auth_headers(UserRole.ADMIN)
        )
        assert response.status_code == 200

    def test_super_admin_can_access_admin_route(self, app_with_routes):
        # Hierarquia: SUPER_ADMIN cobre ADMIN.
        response = app_with_routes.get(
            "/admin-only", headers=_auth_headers(UserRole.SUPER_ADMIN)
        )
        assert response.status_code == 200

    def test_user_cannot_access_admin_route(self, app_with_routes):
        response = app_with_routes.get(
            "/admin-only", headers=_auth_headers(UserRole.USER)
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_admin_cannot_access_super_only_route(self, app_with_routes):
        response = app_with_routes.get(
            "/super-only", headers=_auth_headers(UserRole.ADMIN)
        )
        assert response.status_code == 403

    def test_super_admin_can_access_super_only_route(self, app_with_routes):
        response = app_with_routes.get(
            "/super-only", headers=_auth_headers(UserRole.SUPER_ADMIN)
        )
        assert response.status_code == 200

    def test_no_token_on_protected_route_returns_unauthenticated(self, app_with_routes):
        response = app_with_routes.get("/admin-only")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"

    def test_require_role_without_args_raises(self):
        with pytest.raises(ValueError):
            require_role()
