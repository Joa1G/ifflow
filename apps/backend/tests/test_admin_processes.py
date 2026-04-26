"""Testes do router /admin/processes/* (moderacao).

Apos a refatoracao `feat/user-can-create-processes`, este router so cuida
de moderacao — listagem global (admin ve tudo, qualquer autor) e aprovacao
final. CRUD vive em /processes/* (cobertura em test_processes_management.py)
e fluxo de aprovacao continua dividido com test_process_approval.py.

Foco aqui:
- Autorizacao da listagem: 401 sem token, 403 USER, 200 admin/super_admin.
- Filtros (status, category) e ordenacao por created_at desc.
- Listagem cobre processos de qualquer autor (nao so do admin que esta
  consultando).
"""

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import ProcessStatus, UserRole, UserStatus
from app.core.security import create_access_token, hash_password
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str,
    role: UserRole = UserRole.ADMIN,
    status: UserStatus = UserStatus.APPROVED,
) -> User:
    user = User(
        name=f"User {email}",
        email=email,
        siape="4444444",
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


def _valid_payload(**overrides) -> dict:
    base = {
        "title": "Solicitacao de Capacitacao",
        "short_description": "Curta",
        "full_description": "Longa descricao",
        "category": "RH",
        "estimated_time": "30 a 45 dias",
        "requirements": ["Ser servidor efetivo"],
    }
    base.update(overrides)
    return base


def _create_process_via_api(client: TestClient, headers: dict, **overrides) -> dict:
    response = client.post(
        "/processes", json=_valid_payload(**overrides), headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------- GET /admin/processes ----------


def test_listar_admin_sem_auth_retorna_401(client: TestClient):
    response = client.get("/admin/processes")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_listar_admin_como_user_comum_retorna_403(client: TestClient, session: Session):
    user = _create_user(session, email="u.adm@ifam.edu.br", role=UserRole.USER)

    response = client.get("/admin/processes", headers=_auth_headers(user))

    assert response.status_code == 403


def test_listar_admin_vazio(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.empty@ifam.edu.br")

    response = client.get("/admin/processes", headers=_auth_headers(admin))

    assert response.status_code == 200
    assert response.json() == {"processes": [], "total": 0}


def test_listar_admin_inclui_todos_os_status(client: TestClient, session: Session):
    """Mostra DRAFT + ARCHIVED de QUALQUER autor — chave da moderacao."""
    admin = _create_user(session, email="admin.all@ifam.edu.br")
    user = _create_user(session, email="u.all@ifam.edu.br", role=UserRole.USER)

    user_draft = _create_process_via_api(
        client, _auth_headers(user), title="Draft do user"
    )
    admin_draft = _create_process_via_api(
        client, _auth_headers(admin), title="Draft do admin"
    )
    client.delete(f"/processes/{admin_draft['id']}", headers=_auth_headers(admin))

    response = client.get("/admin/processes", headers=_auth_headers(admin))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    statuses = {p["status"] for p in body["processes"]}
    assert statuses == {"DRAFT", "ARCHIVED"}
    ids = {p["id"] for p in body["processes"]}
    assert user_draft["id"] in ids
    assert admin_draft["id"] in ids


def test_listar_admin_filtra_por_status(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.fst@ifam.edu.br")
    _create_process_via_api(client, _auth_headers(admin), title="D1")
    target = _create_process_via_api(client, _auth_headers(admin), title="D2")
    client.delete(f"/processes/{target['id']}", headers=_auth_headers(admin))

    response = client.get(
        "/admin/processes?status=ARCHIVED", headers=_auth_headers(admin)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["processes"][0]["status"] == "ARCHIVED"


def test_listar_admin_filtra_draft_exclui_archived(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.draft@ifam.edu.br")
    draft = _create_process_via_api(client, _auth_headers(admin), title="D")
    arc = _create_process_via_api(client, _auth_headers(admin), title="A")
    client.delete(f"/processes/{arc['id']}", headers=_auth_headers(admin))

    response = client.get(
        f"/admin/processes?status={ProcessStatus.DRAFT.value}",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["processes"][0]["id"] == draft["id"]


def test_listar_admin_status_query_invalido_retorna_422(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.422@ifam.edu.br")

    response = client.get(
        "/admin/processes?status=NAO_EXISTE", headers=_auth_headers(admin)
    )

    assert response.status_code == 422


def test_listar_admin_ordenado_por_created_at_desc(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.ord@ifam.edu.br")
    first = _create_process_via_api(client, _auth_headers(admin), title="Primeiro")
    second = _create_process_via_api(client, _auth_headers(admin), title="Segundo")

    response = client.get("/admin/processes", headers=_auth_headers(admin))

    ids = [p["id"] for p in response.json()["processes"]]
    assert ids[0] == second["id"]
    assert ids[1] == first["id"]


def test_listar_admin_como_super_admin_funciona(client: TestClient, session: Session):
    super_admin = _create_user(
        session, email="sa.adm@ifam.edu.br", role=UserRole.SUPER_ADMIN
    )

    response = client.get("/admin/processes", headers=_auth_headers(super_admin))

    assert response.status_code == 200
