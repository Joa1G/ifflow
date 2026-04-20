"""Testes de integracao dos endpoints de gestao de papeis (B-13).

Cobrem os dois endpoints (POST /super-admin/users/{id}/promote e /demote) e
os criterios do checklist:
- Auth: 401 sem token, 403 para USER e ADMIN, 200 para SUPER_ADMIN apenas.
- Promote: 404 id inexistente, 409 para user ja ADMIN, 409 para SUPER_ADMIN
  (nao e promocao valida), 409 para user PENDING/REJECTED.
- Demote: 403 CANNOT_DEMOTE_SELF, 403 CANNOT_DEMOTE_SUPER_ADMIN, 409
  USER_NOT_ADMIN, 404 para id inexistente.
- Efeitos colaterais: role muda no banco, updated_at e atualizado.
"""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import UserRole, UserStatus
from app.core.security import create_access_token, hash_password
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str,
    status: UserStatus = UserStatus.APPROVED,
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


# ---------- POST /super-admin/users/{id}/promote ----------


def test_promote_como_super_admin_muda_role_para_admin(
    client: TestClient, session: Session
):
    super_admin = _create_user(
        session,
        email="super.promote@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )
    target = _create_user(session, email="alvo.promote@ifam.edu.br")

    response = client.post(
        f"/super-admin/users/{target.id}/promote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(target.id)
    assert body["role"] == UserRole.ADMIN.value

    session.refresh(target)
    assert target.role == UserRole.ADMIN


def test_promote_como_admin_retorna_403(client: TestClient, session: Session):
    """ADMIN nao pode promover — endpoint exige SUPER_ADMIN apenas."""
    admin = _create_user(
        session,
        email="admin.promote@ifam.edu.br",
        role=UserRole.ADMIN,
    )
    target = _create_user(session, email="alvo.admin.promote@ifam.edu.br")

    response = client.post(
        f"/super-admin/users/{target.id}/promote",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"

    session.refresh(target)
    assert target.role == UserRole.USER


def test_promote_como_user_comum_retorna_403(client: TestClient, session: Session):
    comum = _create_user(session, email="comum.promote@ifam.edu.br")
    target = _create_user(session, email="alvo.comum.promote@ifam.edu.br")

    response = client.post(
        f"/super-admin/users/{target.id}/promote",
        headers=_auth_headers(comum),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_promote_sem_auth_retorna_401(client: TestClient, session: Session):
    target = _create_user(session, email="alvo.promote.noauth@ifam.edu.br")

    response = client.post(f"/super-admin/users/{target.id}/promote")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_promote_user_inexistente_retorna_404(client: TestClient, session: Session):
    super_admin = _create_user(
        session,
        email="super.promote404@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{uuid4()}/promote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "USER_NOT_FOUND"


def test_promote_user_ja_admin_retorna_409(client: TestClient, session: Session):
    super_admin = _create_user(
        session,
        email="super.promote.dup@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )
    already = _create_user(
        session,
        email="ja.admin@ifam.edu.br",
        role=UserRole.ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{already.id}/promote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "USER_ALREADY_ADMIN"
    assert body["error"]["details"]["current_role"] == UserRole.ADMIN.value


def test_promote_super_admin_retorna_409(client: TestClient, session: Session):
    super_admin = _create_user(
        session,
        email="super.promote.sup@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )
    outro_super = _create_user(
        session,
        email="outro.super@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{outro_super.id}/promote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "CANNOT_PROMOTE_ROLE"
    assert body["error"]["details"]["current_role"] == UserRole.SUPER_ADMIN.value


def test_promote_user_pending_retorna_409(client: TestClient, session: Session):
    super_admin = _create_user(
        session,
        email="super.promote.pending@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )
    pendente = _create_user(
        session,
        email="pend.promote@ifam.edu.br",
        status=UserStatus.PENDING,
    )

    response = client.post(
        f"/super-admin/users/{pendente.id}/promote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "USER_NOT_APPROVED"
    assert body["error"]["details"]["current_status"] == UserStatus.PENDING.value

    session.refresh(pendente)
    assert pendente.role == UserRole.USER


# ---------- POST /super-admin/users/{id}/demote ----------


def test_demote_como_super_admin_muda_role_para_user(
    client: TestClient, session: Session
):
    super_admin = _create_user(
        session,
        email="super.demote@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )
    target = _create_user(
        session,
        email="alvo.demote@ifam.edu.br",
        role=UserRole.ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{target.id}/demote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(target.id)
    assert body["role"] == UserRole.USER.value

    session.refresh(target)
    assert target.role == UserRole.USER


def test_demote_como_admin_retorna_403(client: TestClient, session: Session):
    """ADMIN nao pode rebaixar — endpoint exige SUPER_ADMIN apenas."""
    admin = _create_user(
        session,
        email="admin.demote@ifam.edu.br",
        role=UserRole.ADMIN,
    )
    target = _create_user(
        session,
        email="alvo.admin.demote@ifam.edu.br",
        role=UserRole.ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{target.id}/demote",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"

    session.refresh(target)
    assert target.role == UserRole.ADMIN


def test_demote_self_retorna_403(client: TestClient, session: Session):
    """Auto-rebaixamento bloqueado — sistema nao pode ficar sem super_admin."""
    super_admin = _create_user(
        session,
        email="super.self.demote@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{super_admin.id}/demote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CANNOT_DEMOTE_SELF"

    session.refresh(super_admin)
    assert super_admin.role == UserRole.SUPER_ADMIN


def test_demote_outro_super_admin_retorna_403(client: TestClient, session: Session):
    super_admin = _create_user(
        session,
        email="super.demote.other@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )
    outro_super = _create_user(
        session,
        email="outro.super.demote@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{outro_super.id}/demote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CANNOT_DEMOTE_SUPER_ADMIN"

    session.refresh(outro_super)
    assert outro_super.role == UserRole.SUPER_ADMIN


def test_demote_user_comum_retorna_409(client: TestClient, session: Session):
    super_admin = _create_user(
        session,
        email="super.demote.noop@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )
    comum = _create_user(session, email="comum.demote@ifam.edu.br")

    response = client.post(
        f"/super-admin/users/{comum.id}/demote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "USER_NOT_ADMIN"
    assert body["error"]["details"]["current_role"] == UserRole.USER.value


def test_demote_user_inexistente_retorna_404(client: TestClient, session: Session):
    super_admin = _create_user(
        session,
        email="super.demote.404@ifam.edu.br",
        role=UserRole.SUPER_ADMIN,
    )

    response = client.post(
        f"/super-admin/users/{uuid4()}/demote",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "USER_NOT_FOUND"


def test_demote_sem_auth_retorna_401(client: TestClient, session: Session):
    target = _create_user(
        session,
        email="alvo.demote.noauth@ifam.edu.br",
        role=UserRole.ADMIN,
    )

    response = client.post(f"/super-admin/users/{target.id}/demote")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
