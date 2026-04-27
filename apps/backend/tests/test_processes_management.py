"""Testes do router /processes/* (gestao por autor + admin).

Cobre os endpoints introduzidos em `feat/user-can-create-processes`:
- POST /processes (USER+)
- GET /processes/mine (USER+)
- GET /processes/{id}/management (autor ou admin)
- PATCH /processes/{id} (autor ou admin)
- DELETE /processes/{id} (autor DRAFT/IN_REVIEW; admin qualquer)
- POST /processes/{id}/withdraw (autor ou admin)

Os endpoints publicos (GET /processes, GET /processes/{id}, GET /flow)
continuam em test_public_processes.py / test_process_detail.py / test_process_flow.py.
Submit-for-review e approve ficam em test_process_approval.py.

Padrao de seguranca testado:
- Mass assignment (created_by, status, etc no body) ignorado pelo schema.
- Ownership: USER nao pode tocar processo de outro USER.
- Admin override: admin pode editar/arquivar processo de qualquer autor.
- IN_REVIEW e locked para PATCH (precisa withdraw antes).
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
    role: UserRole = UserRole.USER,
    status: UserStatus = UserStatus.APPROVED,
) -> User:
    user = User(
        name=f"User {email}",
        email=email,
        siape="7777777",
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
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _valid_payload(**overrides) -> dict:
    base = {
        "title": "Solicitacao de Capacitacao",
        "short_description": "Curta",
        "full_description": "Longa",
        "category": "RH",
        "estimated_time": "30 dias",
        "requirements": ["Ser servidor efetivo"],
    }
    base.update(overrides)
    return base


def _create_process(client: TestClient, headers: dict, **overrides) -> dict:
    response = client.post(
        "/processes", json=_valid_payload(**overrides), headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------- POST /processes ----------


def test_post_processes_sem_auth_retorna_401(client: TestClient):
    response = client.post("/processes", json=_valid_payload())

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_post_processes_user_comum_cria_draft(client: TestClient, session: Session):
    user = _create_user(session, email="user.create@ifam.edu.br")

    response = client.post(
        "/processes", json=_valid_payload(), headers=_auth_headers(user)
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "DRAFT"
    assert body["access_count"] == 0
    assert body["created_by"] == str(user.id)
    assert body["approved_by"] is None


def test_post_processes_admin_tambem_cria(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.create@ifam.edu.br", role=UserRole.ADMIN)

    response = client.post(
        "/processes", json=_valid_payload(), headers=_auth_headers(admin)
    )

    assert response.status_code == 201
    assert response.json()["created_by"] == str(admin.id)


def test_post_processes_payload_invalido_retorna_422(
    client: TestClient, session: Session
):
    user = _create_user(session, email="user.422@ifam.edu.br")

    response = client.post(
        "/processes",
        json={"title": "", "short_description": "x"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_post_processes_ignora_campos_smuggled_no_body(
    client: TestClient, session: Session
):
    """Mass assignment: status/created_by/access_count no body sao ignorados."""
    user = _create_user(session, email="user.smug@ifam.edu.br")
    other = uuid4()

    payload = _valid_payload()
    payload.update(
        {
            "status": "PUBLISHED",
            "access_count": 999,
            "created_by": str(other),
            "approved_by": str(other),
        }
    )

    response = client.post("/processes", json=payload, headers=_auth_headers(user))

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "DRAFT"
    assert body["access_count"] == 0
    assert body["created_by"] == str(user.id)
    assert body["approved_by"] is None


# ---------- GET /processes/mine ----------


def test_get_mine_sem_auth_retorna_401(client: TestClient):
    response = client.get("/processes/mine")

    assert response.status_code == 401


def test_get_mine_so_retorna_processos_do_dono(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.mine@ifam.edu.br")
    other = _create_user(session, email="other.mine@ifam.edu.br")
    meu = _create_process(client, _auth_headers(owner), title="Meu rascunho")
    _create_process(client, _auth_headers(other), title="Alheio")

    response = client.get("/processes/mine", headers=_auth_headers(owner))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["processes"][0]["id"] == meu["id"]


def test_get_mine_vazio(client: TestClient, session: Session):
    user = _create_user(session, email="user.mine.empty@ifam.edu.br")

    response = client.get("/processes/mine", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json() == {"processes": [], "total": 0}


# ---------- GET /processes/{id}/management ----------


def test_get_management_sem_auth_retorna_401(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.mgmt401@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.get(f"/processes/{proc['id']}/management")

    assert response.status_code == 401


def test_get_management_owner_ve(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.mgmt@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.get(
        f"/processes/{proc['id']}/management", headers=_auth_headers(owner)
    )

    assert response.status_code == 200
    assert response.json()["id"] == proc["id"]


def test_get_management_outro_user_recebe_403(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.mgmtout@ifam.edu.br")
    other = _create_user(session, email="other.mgmtout@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.get(
        f"/processes/{proc['id']}/management", headers=_auth_headers(other)
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROCESS_NOT_OWNED"


def test_get_management_admin_ve_processo_de_user(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.mgmtadm@ifam.edu.br")
    admin = _create_user(session, email="admin.mgmt@ifam.edu.br", role=UserRole.ADMIN)
    proc = _create_process(client, _auth_headers(owner))

    response = client.get(
        f"/processes/{proc['id']}/management", headers=_auth_headers(admin)
    )

    assert response.status_code == 200


def test_get_management_inexistente_retorna_404(client: TestClient, session: Session):
    user = _create_user(session, email="user.mgmt404@ifam.edu.br")

    response = client.get(
        f"/processes/{uuid4()}/management", headers=_auth_headers(user)
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


# ---------- PATCH /processes/{id} ----------


def test_patch_owner_atualiza(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.patch@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.patch(
        f"/processes/{proc['id']}",
        json={"title": "Novo titulo"},
        headers=_auth_headers(owner),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Novo titulo"
    assert body["short_description"] == proc["short_description"]


def test_patch_outro_user_recebe_403(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.patchout@ifam.edu.br")
    other = _create_user(session, email="other.patchout@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.patch(
        f"/processes/{proc['id']}",
        json={"title": "Hack"},
        headers=_auth_headers(other),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROCESS_NOT_OWNED"


def test_patch_admin_pode_editar_processo_de_user(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.patchadm@ifam.edu.br")
    admin = _create_user(session, email="admin.patch@ifam.edu.br", role=UserRole.ADMIN)
    proc = _create_process(client, _auth_headers(owner))

    response = client.patch(
        f"/processes/{proc['id']}",
        json={"title": "Ajuste de admin"},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Ajuste de admin"


def test_patch_em_in_review_retorna_409(client: TestClient, session: Session):
    """Bloqueio: precisa withdraw antes de editar IN_REVIEW."""
    owner = _create_user(session, email="owner.patchir@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )

    response = client.patch(
        f"/processes/{proc['id']}",
        json={"title": "Editando em revisao"},
        headers=_auth_headers(owner),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_LOCKED_IN_REVIEW"


def test_patch_em_archived_retorna_409(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.patcharc@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))
    client.delete(f"/processes/{proc['id']}", headers=_auth_headers(owner))

    response = client.patch(
        f"/processes/{proc['id']}",
        json={"title": "Tarde"},
        headers=_auth_headers(owner),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_NOT_EDITABLE"


def test_patch_inexistente_retorna_404(client: TestClient, session: Session):
    user = _create_user(session, email="user.patch404@ifam.edu.br")

    response = client.patch(
        f"/processes/{uuid4()}",
        json={"title": "x"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


# ---------- DELETE /processes/{id} (archive) ----------


def test_delete_owner_arquiva_proprio_draft(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.del@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.delete(f"/processes/{proc['id']}", headers=_auth_headers(owner))

    assert response.status_code == 200
    assert response.json()["status"] == "ARCHIVED"


def test_delete_owner_arquiva_proprio_in_review(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.delir@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )

    response = client.delete(f"/processes/{proc['id']}", headers=_auth_headers(owner))

    assert response.status_code == 200
    assert response.json()["status"] == "ARCHIVED"


def test_delete_owner_published_recebe_403(client: TestClient, session: Session):
    """USER nao pode arquivar PUBLISHED — precisa de admin."""
    owner = _create_user(session, email="owner.delpub@ifam.edu.br")
    admin = _create_user(session, email="admin.delpub@ifam.edu.br", role=UserRole.ADMIN)
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )
    client.post(f"/admin/processes/{proc['id']}/approve", headers=_auth_headers(admin))

    response = client.delete(f"/processes/{proc['id']}", headers=_auth_headers(owner))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROCESS_ARCHIVE_REQUIRES_ADMIN"


def test_delete_admin_pode_arquivar_published(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.delpubadm@ifam.edu.br")
    admin = _create_user(
        session, email="admin.delpubok@ifam.edu.br", role=UserRole.ADMIN
    )
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )
    client.post(f"/admin/processes/{proc['id']}/approve", headers=_auth_headers(admin))

    response = client.delete(f"/processes/{proc['id']}", headers=_auth_headers(admin))

    assert response.status_code == 200
    assert response.json()["status"] == "ARCHIVED"


def test_delete_outro_user_recebe_403(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.delout@ifam.edu.br")
    other = _create_user(session, email="other.delout@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.delete(f"/processes/{proc['id']}", headers=_auth_headers(other))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROCESS_NOT_OWNED"


def test_delete_ja_arquivado_retorna_409(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.del409@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))
    client.delete(f"/processes/{proc['id']}", headers=_auth_headers(owner))

    response = client.delete(f"/processes/{proc['id']}", headers=_auth_headers(owner))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_ALREADY_ARCHIVED"


# ---------- POST /processes/{id}/withdraw ----------


def test_withdraw_owner_volta_para_draft(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.wd@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )

    response = client.post(
        f"/processes/{proc['id']}/withdraw", headers=_auth_headers(owner)
    )

    assert response.status_code == 200
    assert response.json()["status"] == "DRAFT"


def test_withdraw_seguido_de_patch_funciona(client: TestClient, session: Session):
    """Regressao do fluxo combinado: USER editando processo em revisao."""
    owner = _create_user(session, email="owner.wdpatch@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )

    client.post(f"/processes/{proc['id']}/withdraw", headers=_auth_headers(owner))
    response = client.patch(
        f"/processes/{proc['id']}",
        json={"title": "Versao 2"},
        headers=_auth_headers(owner),
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Versao 2"


def test_withdraw_em_draft_retorna_409(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.wddraft@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.post(
        f"/processes/{proc['id']}/withdraw", headers=_auth_headers(owner)
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


def test_withdraw_outro_user_recebe_403(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.wdout@ifam.edu.br")
    other = _create_user(session, email="other.wdout@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )

    response = client.post(
        f"/processes/{proc['id']}/withdraw", headers=_auth_headers(other)
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PROCESS_NOT_OWNED"


def test_withdraw_admin_pode_em_processo_alheio(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.wdadm@ifam.edu.br")
    admin = _create_user(session, email="admin.wd@ifam.edu.br", role=UserRole.ADMIN)
    proc = _create_process(client, _auth_headers(owner))
    client.post(
        f"/processes/{proc['id']}/submit-for-review", headers=_auth_headers(owner)
    )

    response = client.post(
        f"/processes/{proc['id']}/withdraw", headers=_auth_headers(admin)
    )

    assert response.status_code == 200
    assert response.json()["status"] == "DRAFT"


def test_withdraw_sem_auth_retorna_401(client: TestClient, session: Session):
    owner = _create_user(session, email="owner.wd401@ifam.edu.br")
    proc = _create_process(client, _auth_headers(owner))

    response = client.post(f"/processes/{proc['id']}/withdraw")

    assert response.status_code == 401
