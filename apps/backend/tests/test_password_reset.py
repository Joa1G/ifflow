"""Testes do fluxo de reset de senha (B-10).

Cobrem os dois endpoints (`/auth/request-password-reset` e
`/auth/reset-password`) e os criterios de seguranca: endpoint de request
sempre 200 mesmo para email inexistente, rate limit 3/h, token expirado /
ja usado / invalido caem no mesmo erro INVALID_RESET_TOKEN (mensagem
identica para nao vazar estado interno), e que depois de redefinir a senha
o login com a nova senha funciona.
"""

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.config import settings
from app.core.enums import UserRole, UserStatus
from app.core.security import hash_password, verify_password
from app.email.client import clear_sent_emails, get_sent_emails
from app.models.password_reset import PasswordResetToken
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str = "reset.test@ifam.edu.br",
    password: str = "senhaForte123",
    status: UserStatus = UserStatus.APPROVED,
    role: UserRole = UserRole.USER,
) -> User:
    user = User(
        name="Teste Reset",
        email=email,
        siape="2222222",
        sector="PROAD",
        password_hash=hash_password(password),
        role=role,
        status=status,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _clear_emails():
    clear_sent_emails()


def test_request_reset_email_existente_cria_token_e_envia_email(
    client: TestClient, session: Session
):
    _clear_emails()
    user = _create_user(session, email="tem.conta@ifam.edu.br")

    response = client.post("/auth/request-password-reset", json={"email": user.email})

    assert response.status_code == 200
    # Token foi persistido (exatamente 1 para esse user)
    tokens = session.exec(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    ).all()
    assert len(tokens) == 1
    assert tokens[0].used_at is None
    # Email foi despachado com link que inclui o frontend_url
    sent = get_sent_emails()
    assert len(sent) == 1
    assert sent[0].to == user.email
    assert f"{settings.frontend_url}/reset-password?token=" in sent[0].html


def test_request_reset_email_inexistente_retorna_200_sem_criar_token(
    client: TestClient, session: Session
):
    _clear_emails()

    response = client.post(
        "/auth/request-password-reset",
        json={"email": "nao.existe@ifam.edu.br"},
    )

    assert response.status_code == 200
    assert session.exec(select(PasswordResetToken)).first() is None
    assert get_sent_emails() == []


def test_request_reset_user_pending_nao_cria_token(
    client: TestClient, session: Session
):
    _clear_emails()
    user = _create_user(session, email="pending@ifam.edu.br", status=UserStatus.PENDING)

    response = client.post("/auth/request-password-reset", json={"email": user.email})

    assert response.status_code == 200
    assert session.exec(select(PasswordResetToken)).first() is None
    assert get_sent_emails() == []


def test_request_reset_user_rejected_nao_cria_token(
    client: TestClient, session: Session
):
    _clear_emails()
    user = _create_user(
        session, email="rejected@ifam.edu.br", status=UserStatus.REJECTED
    )

    response = client.post("/auth/request-password-reset", json={"email": user.email})

    assert response.status_code == 200
    assert session.exec(select(PasswordResetToken)).first() is None
    assert get_sent_emails() == []


def test_request_reset_rate_limit_bloqueia_apos_3_tentativas(
    client: TestClient, session: Session
):
    """3 tentativas/hora por IP. A 4a deve retornar 429 RATE_LIMITED."""
    _clear_emails()
    _create_user(session, email="rl@ifam.edu.br")

    for _ in range(3):
        resp = client.post(
            "/auth/request-password-reset", json={"email": "rl@ifam.edu.br"}
        )
        assert resp.status_code == 200

    resp = client.post("/auth/request-password-reset", json={"email": "rl@ifam.edu.br"})
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "RATE_LIMITED"


def _captured_token(client: TestClient, email: str) -> str:
    """Dispara request-password-reset e extrai o token do email mockado."""
    _clear_emails()
    resp = client.post("/auth/request-password-reset", json={"email": email})
    assert resp.status_code == 200
    html = get_sent_emails()[0].html
    prefix = f"{settings.frontend_url}/reset-password?token="
    start = html.index(prefix) + len(prefix)
    end = html.index('"', start)
    return html[start:end]


def test_reset_com_token_valido_atualiza_senha(client: TestClient, session: Session):
    user = _create_user(session, email="ok@ifam.edu.br", password="senhaVelha123")
    token = _captured_token(client, user.email)

    resp = client.post(
        "/auth/reset-password",
        json={
            "token": token,
            "new_password": "senhaNova123",
            "new_password_confirmation": "senhaNova123",
        },
    )
    assert resp.status_code == 204

    session.refresh(user)
    assert verify_password("senhaNova123", user.password_hash)
    assert not verify_password("senhaVelha123", user.password_hash)
    # Token foi marcado como usado
    reset = session.exec(
        select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    ).first()
    assert reset is not None
    assert reset.used_at is not None


def test_reset_com_token_invalido_retorna_400(client: TestClient, session: Session):
    _create_user(session, email="x@ifam.edu.br")

    resp = client.post(
        "/auth/reset-password",
        json={
            "token": "token-que-nunca-existiu",
            "new_password": "senhaNova123",
            "new_password_confirmation": "senhaNova123",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_RESET_TOKEN"


def test_reset_com_token_expirado_retorna_400(client: TestClient, session: Session):
    user = _create_user(session, email="exp@ifam.edu.br", password="senhaVelha123")
    # Cria o token diretamente no banco com expires_at no passado.
    token = "token-plaintext-teste"
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    session.add(reset)
    session.commit()

    resp = client.post(
        "/auth/reset-password",
        json={
            "token": token,
            "new_password": "senhaNova123",
            "new_password_confirmation": "senhaNova123",
        },
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_RESET_TOKEN"
    # Senha NAO foi alterada
    session.refresh(user)
    assert verify_password("senhaVelha123", user.password_hash)


def test_reset_token_nao_pode_ser_usado_duas_vezes(
    client: TestClient, session: Session
):
    user = _create_user(session, email="dup@ifam.edu.br", password="senhaVelha123")
    token = _captured_token(client, user.email)

    # 1a vez: ok
    resp1 = client.post(
        "/auth/reset-password",
        json={
            "token": token,
            "new_password": "senhaNova123",
            "new_password_confirmation": "senhaNova123",
        },
    )
    assert resp1.status_code == 204

    # 2a vez: token ja usado
    resp2 = client.post(
        "/auth/reset-password",
        json={
            "token": token,
            "new_password": "outraSenha123",
            "new_password_confirmation": "outraSenha123",
        },
    )
    assert resp2.status_code == 400
    assert resp2.json()["error"]["code"] == "INVALID_RESET_TOKEN"

    # Senha continua a nova (primeiro reset), nao a segunda tentativa
    session.refresh(user)
    assert verify_password("senhaNova123", user.password_hash)
    assert not verify_password("outraSenha123", user.password_hash)


def test_reset_com_senhas_diferentes_retorna_422(client: TestClient, session: Session):
    """Validacao do schema Pydantic: senhas precisam bater."""
    user = _create_user(session, email="diff@ifam.edu.br")
    token = _captured_token(client, user.email)

    resp = client.post(
        "/auth/reset-password",
        json={
            "token": token,
            "new_password": "senhaNova123",
            "new_password_confirmation": "outraCoisa123",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_reset_com_senha_curta_retorna_422(client: TestClient, session: Session):
    user = _create_user(session, email="curta@ifam.edu.br")
    token = _captured_token(client, user.email)

    resp = client.post(
        "/auth/reset-password",
        json={
            "token": token,
            "new_password": "abc",
            "new_password_confirmation": "abc",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_login_funciona_com_senha_nova_apos_reset(client: TestClient, session: Session):
    """Smoke test do fluxo inteiro: request -> confirm -> login."""
    user = _create_user(session, email="fluxo@ifam.edu.br", password="senhaAntiga123")
    token = _captured_token(client, user.email)

    client.post(
        "/auth/reset-password",
        json={
            "token": token,
            "new_password": "senhaRenovada123",
            "new_password_confirmation": "senhaRenovada123",
        },
    )

    # Login com a senha antiga falha
    r_antiga = client.post(
        "/auth/login",
        json={"email": user.email, "password": "senhaAntiga123"},
    )
    assert r_antiga.status_code == 401

    # Login com a nova funciona
    r_nova = client.post(
        "/auth/login",
        json={"email": user.email, "password": "senhaRenovada123"},
    )
    assert r_nova.status_code == 200
    assert "access_token" in r_nova.json()
