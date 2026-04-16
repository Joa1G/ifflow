"""Testes de integracao de POST /auth/login.

Cobrem os criterios de seguranca do B-07: INVALID_CREDENTIALS identico para
email inexistente e senha errada, bloqueio de contas PENDING/REJECTED, rate
limit de 5/min por IP.
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import UserRole, UserStatus
from app.core.security import hash_password
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str = "login.test@ifam.edu.br",
    password: str = "senhaForte123",
    status: UserStatus = UserStatus.APPROVED,
    role: UserRole = UserRole.USER,
) -> User:
    user = User(
        name="Teste Login",
        email=email,
        siape="9999999",
        sector="PROAD",
        password_hash=hash_password(password),
        role=role,
        status=status,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_login_sucesso_retorna_token_e_user(client: TestClient, session: Session):
    user = _create_user(session)

    response = client.post(
        "/auth/login",
        json={"email": user.email, "password": "senhaForte123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20
    assert body["expires_in"] == 86400
    assert body["user"] == {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": UserRole.USER.value,
        "sector": user.sector,
    }


def test_login_email_inexistente_retorna_invalid_credentials(client: TestClient):
    response = client.post(
        "/auth/login",
        json={"email": "nao.existe@ifam.edu.br", "password": "qualquerCoisa123"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_senha_errada_retorna_invalid_credentials_identico(
    client: TestClient, session: Session
):
    """Mensagem deve ser IDENTICA a do email inexistente (nao vazar existencia)."""
    user = _create_user(session, email="existe@ifam.edu.br", password="senhaCerta123")

    # Mesma requisicao com email cadastrado + senha errada.
    resp_senha_errada = client.post(
        "/auth/login",
        json={"email": user.email, "password": "senhaErrada123"},
    )
    # Email inexistente com qualquer senha.
    resp_email_inexistente = client.post(
        "/auth/login",
        json={"email": "outro.nao.existe@ifam.edu.br", "password": "senhaErrada123"},
    )

    assert resp_senha_errada.status_code == 401
    assert resp_email_inexistente.status_code == 401

    err_senha = resp_senha_errada.json()["error"]
    err_email = resp_email_inexistente.json()["error"]
    assert err_senha["code"] == "INVALID_CREDENTIALS"
    assert err_email["code"] == "INVALID_CREDENTIALS"
    assert err_senha["message"] == err_email["message"]


def test_login_user_pending_retorna_account_pending(
    client: TestClient, session: Session
):
    user = _create_user(session, status=UserStatus.PENDING)

    response = client.post(
        "/auth/login",
        json={"email": user.email, "password": "senhaForte123"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_PENDING"


def test_login_user_rejected_retorna_account_rejected(
    client: TestClient, session: Session
):
    user = _create_user(session, status=UserStatus.REJECTED)

    response = client.post(
        "/auth/login",
        json={"email": user.email, "password": "senhaForte123"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ACCOUNT_REJECTED"


def test_login_rate_limit_bloqueia_apos_5_tentativas(
    client: TestClient, session: Session
):
    """5 tentativas/min por IP. A 6a tentativa deve retornar 429 RATE_LIMITED."""
    _create_user(session, email="ratelimit@ifam.edu.br", password="senhaForte123")

    # 5 tentativas com senha errada — todas passam pelo rate limit e retornam 401.
    for _ in range(5):
        resp = client.post(
            "/auth/login",
            json={"email": "ratelimit@ifam.edu.br", "password": "senhaErrada"},
        )
        assert resp.status_code == 401

    # 6a tentativa eh bloqueada pelo rate limit antes de chegar ao endpoint.
    resp = client.post(
        "/auth/login",
        json={"email": "ratelimit@ifam.edu.br", "password": "senhaErrada"},
    )
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "RATE_LIMITED"
