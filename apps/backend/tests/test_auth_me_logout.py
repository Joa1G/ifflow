"""Testes de integracao de GET /auth/me e POST /auth/logout (B-08).

Cobrem os criterios do checklist: response correta de /me (sem password_hash),
logout 204, e os quatro modos de falha de autenticacao que o router deve
recusar — ausente, malformado, expirado, e token cujo user foi apagado.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.config import settings
from app.core.enums import UserRole, UserStatus
from app.core.security import JWT_ALGORITHM, create_access_token, hash_password
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str = "me.test@ifam.edu.br",
    status: UserStatus = UserStatus.APPROVED,
    role: UserRole = UserRole.USER,
) -> User:
    user = User(
        name="Teste Me",
        email=email,
        siape="1111111",
        sector="PROAD",
        password_hash=hash_password("senhaForte123"),
        role=role,
        status=status,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


def test_me_retorna_dados_do_usuario_autenticado(client: TestClient, session: Session):
    user = _create_user(session)

    response = client.get("/auth/me", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.id)
    assert body["name"] == user.name
    assert body["email"] == user.email
    assert body["siape"] == user.siape
    assert body["sector"] == user.sector
    assert body["role"] == UserRole.USER.value
    assert body["status"] == UserStatus.APPROVED.value
    assert "created_at" in body
    # Nunca expor o hash, mesmo para o proprio usuario.
    assert "password_hash" not in body


def test_me_sem_token_retorna_401(client: TestClient):
    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_me_token_malformado_retorna_401(client: TestClient):
    response = client.get("/auth/me", headers={"Authorization": "Bearer nao-e-um-jwt"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


def test_me_token_expirado_retorna_401(client: TestClient, session: Session):
    """Token com exp no passado -> UNAUTHENTICATED (sessao expirada)."""
    user = _create_user(session, email="expirado@ifam.edu.br")
    now = datetime.now(timezone.utc) - timedelta(hours=25)
    payload = {
        "user_id": str(user.id),
        "role": user.role.value,
        "iat": int((now - timedelta(hours=1)).timestamp()),
        "exp": int(now.timestamp()),
    }
    expired = jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_me_token_de_user_inexistente_retorna_401(client: TestClient):
    """Token valido mas com user_id que nao existe no banco -> INVALID_TOKEN."""
    token = create_access_token(uuid4(), UserRole.USER)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


def test_logout_com_token_valido_retorna_204(client: TestClient, session: Session):
    user = _create_user(session, email="logout@ifam.edu.br")

    response = client.post("/auth/logout", headers=_auth_headers(user))

    assert response.status_code == 204
    assert response.content == b""


def test_logout_sem_token_retorna_401(client: TestClient):
    response = client.post("/auth/logout")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
