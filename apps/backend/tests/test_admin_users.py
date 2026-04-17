"""Testes de integracao dos endpoints de moderacao de usuarios (B-12).

Cobrem os tres endpoints (GET /admin/users/pending, POST approve, POST
reject) e os criterios do checklist:
- Auth: 401 sem token, 403 para USER comum, 200 para ADMIN/SUPER_ADMIN.
- Moderacao: 404 para id inexistente, 409 para user ja APPROVED ou
  REJECTED, 403 para auto-moderacao (CANNOT_MODERATE_SELF).
- Efeitos colaterais: status muda no banco, email e enfileirado no mock.
- Reject aceita reason ausente, None e string vazia (degradam para email
  generico, sem quebrar).
"""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import UserRole, UserStatus
from app.core.security import create_access_token, hash_password
from app.email.client import clear_sent_emails, get_sent_emails
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str,
    status: UserStatus = UserStatus.PENDING,
    role: UserRole = UserRole.USER,
    name: str = "Usuario Teste",
) -> User:
    user = User(
        name=name,
        email=email,
        siape="3333333",
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


# ---------- GET /admin/users/pending ----------


def test_listar_pendentes_sem_auth_retorna_401(client: TestClient):
    response = client.get("/admin/users/pending")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_listar_pendentes_como_user_comum_retorna_403(
    client: TestClient, session: Session
):
    user = _create_user(
        session,
        email="comum@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.USER,
    )

    response = client.get("/admin/users/pending", headers=_auth_headers(user))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_listar_pendentes_como_admin_retorna_apenas_pending_em_ordem(
    client: TestClient, session: Session
):
    admin = _create_user(
        session,
        email="admin@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    # Alguns PENDING, um APPROVED e um REJECTED para garantir que so PENDING aparece.
    pending_a = _create_user(session, email="a.pend@ifam.edu.br", name="Alice")
    pending_b = _create_user(session, email="b.pend@ifam.edu.br", name="Bruno")
    _create_user(
        session,
        email="ja.aprovado@ifam.edu.br",
        status=UserStatus.APPROVED,
    )
    _create_user(
        session,
        email="ja.rejeitado@ifam.edu.br",
        status=UserStatus.REJECTED,
    )

    response = client.get("/admin/users/pending", headers=_auth_headers(admin))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    ids = [u["id"] for u in body["users"]]
    assert str(pending_a.id) in ids
    assert str(pending_b.id) in ids
    # Ordem por created_at asc — mais antigo primeiro. Como foram criados
    # nessa sequencia, Alice vem antes de Bruno.
    assert ids.index(str(pending_a.id)) < ids.index(str(pending_b.id))

    first = body["users"][0]
    assert set(first.keys()) == {"id", "name", "email", "siape", "sector", "created_at"}


def test_listar_pendentes_como_super_admin_tambem_funciona(
    client: TestClient, session: Session
):
    super_admin = _create_user(
        session,
        email="super@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.SUPER_ADMIN,
    )
    _create_user(session, email="pendente@ifam.edu.br")

    response = client.get("/admin/users/pending", headers=_auth_headers(super_admin))

    assert response.status_code == 200
    assert response.json()["total"] == 1


# ---------- POST /admin/users/{id}/approve ----------


def test_approve_como_admin_muda_status_e_envia_email(
    client: TestClient, session: Session
):
    clear_sent_emails()
    admin = _create_user(
        session,
        email="admin.approve@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    target = _create_user(session, email="alvo@ifam.edu.br", name="Carla")

    response = client.post(
        f"/admin/users/{target.id}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(target.id)
    assert body["status"] == UserStatus.APPROVED.value

    session.refresh(target)
    assert target.status == UserStatus.APPROVED

    emails = get_sent_emails()
    assert len(emails) == 1
    assert emails[0].to == "alvo@ifam.edu.br"
    assert "aprovado" in emails[0].subject.lower()
    assert "Carla" in emails[0].html


def test_approve_user_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(
        session,
        email="admin.404@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )

    response = client.post(
        f"/admin/users/{uuid4()}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "USER_NOT_FOUND"


def test_approve_user_ja_approved_retorna_409(client: TestClient, session: Session):
    admin = _create_user(
        session,
        email="admin.409a@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    already = _create_user(
        session,
        email="ja.ok@ifam.edu.br",
        status=UserStatus.APPROVED,
    )

    response = client.post(
        f"/admin/users/{already.id}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "USER_NOT_PENDING"
    assert body["error"]["details"]["current_status"] == UserStatus.APPROVED.value


def test_approve_user_ja_rejected_retorna_409(client: TestClient, session: Session):
    admin = _create_user(
        session,
        email="admin.409r@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    rejected = _create_user(
        session,
        email="ja.rejeitado2@ifam.edu.br",
        status=UserStatus.REJECTED,
    )

    response = client.post(
        f"/admin/users/{rejected.id}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "USER_NOT_PENDING"
    assert body["error"]["details"]["current_status"] == UserStatus.REJECTED.value


def test_approve_self_retorna_403(client: TestClient, session: Session):
    # Admin em status PENDING e artificial (nao acontece pelo seed), mas a
    # checagem do service precisa responder ANTES de qualquer acesso ao
    # banco. Criamos o admin com status APPROVED — o self-check dispara
    # pelo id do token, sem sequer olhar o status.
    admin = _create_user(
        session,
        email="admin.self@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )

    response = client.post(
        f"/admin/users/{admin.id}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CANNOT_MODERATE_SELF"


def test_approve_sem_auth_retorna_401(client: TestClient, session: Session):
    target = _create_user(session, email="alvo2@ifam.edu.br")

    response = client.post(f"/admin/users/{target.id}/approve")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_approve_como_user_comum_retorna_403(client: TestClient, session: Session):
    comum = _create_user(
        session,
        email="comum2@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.USER,
    )
    target = _create_user(session, email="alvo3@ifam.edu.br")

    response = client.post(
        f"/admin/users/{target.id}/approve",
        headers=_auth_headers(comum),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


# ---------- POST /admin/users/{id}/reject ----------


def test_reject_com_reason_muda_status_e_envia_email_com_motivo(
    client: TestClient, session: Session
):
    clear_sent_emails()
    admin = _create_user(
        session,
        email="admin.rej@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    target = _create_user(session, email="alvo.rej@ifam.edu.br", name="Diego")

    response = client.post(
        f"/admin/users/{target.id}/reject",
        headers=_auth_headers(admin),
        json={"reason": "SIAPE nao confere com registros da DGP."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(target.id)
    assert body["status"] == UserStatus.REJECTED.value

    session.refresh(target)
    assert target.status == UserStatus.REJECTED

    emails = get_sent_emails()
    assert len(emails) == 1
    assert emails[0].to == "alvo.rej@ifam.edu.br"
    assert "SIAPE nao confere" in emails[0].html


def test_reject_sem_body_funciona(client: TestClient, session: Session):
    """Reject sem body e valido (motivo ausente -> email generico)."""
    clear_sent_emails()
    admin = _create_user(
        session,
        email="admin.rej2@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    target = _create_user(session, email="alvo.rej2@ifam.edu.br")

    response = client.post(
        f"/admin/users/{target.id}/reject",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 200
    session.refresh(target)
    assert target.status == UserStatus.REJECTED
    emails = get_sent_emails()
    assert len(emails) == 1
    # Email generico nao carrega bloco "Motivo:"
    assert "Motivo:" not in emails[0].html


def test_reject_com_reason_vazio_equivale_a_sem_reason(
    client: TestClient, session: Session
):
    clear_sent_emails()
    admin = _create_user(
        session,
        email="admin.rej3@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    target = _create_user(session, email="alvo.rej3@ifam.edu.br")

    response = client.post(
        f"/admin/users/{target.id}/reject",
        headers=_auth_headers(admin),
        json={"reason": "   "},
    )

    assert response.status_code == 200
    emails = get_sent_emails()
    assert len(emails) == 1
    assert "Motivo:" not in emails[0].html


def test_reject_user_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(
        session,
        email="admin.rej404@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )

    response = client.post(
        f"/admin/users/{uuid4()}/reject",
        headers=_auth_headers(admin),
        json={"reason": "qualquer"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "USER_NOT_FOUND"


def test_reject_user_ja_moderado_retorna_409(client: TestClient, session: Session):
    admin = _create_user(
        session,
        email="admin.rej409@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )
    ja = _create_user(
        session,
        email="ja.aprov@ifam.edu.br",
        status=UserStatus.APPROVED,
    )

    response = client.post(
        f"/admin/users/{ja.id}/reject",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "USER_NOT_PENDING"


def test_reject_self_retorna_403(client: TestClient, session: Session):
    admin = _create_user(
        session,
        email="admin.selfrej@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.ADMIN,
    )

    response = client.post(
        f"/admin/users/{admin.id}/reject",
        headers=_auth_headers(admin),
        json={"reason": "tentando se demitir"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CANNOT_MODERATE_SELF"


def test_reject_sem_auth_retorna_401(client: TestClient, session: Session):
    target = _create_user(session, email="alvo.rej4@ifam.edu.br")

    response = client.post(f"/admin/users/{target.id}/reject")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_reject_como_user_comum_retorna_403(client: TestClient, session: Session):
    comum = _create_user(
        session,
        email="comum3@ifam.edu.br",
        status=UserStatus.APPROVED,
        role=UserRole.USER,
    )
    target = _create_user(session, email="alvo.rej5@ifam.edu.br")

    response = client.post(
        f"/admin/users/{target.id}/reject",
        headers=_auth_headers(comum),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
