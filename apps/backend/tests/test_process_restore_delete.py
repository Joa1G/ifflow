"""Testes do fluxo de restore + hard delete de processos arquivados.

Cobre:
- POST /processes/{id}/restore  — admin volta ARCHIVED -> DRAFT
- DELETE /processes/{id}/permanently — admin apaga em definitivo um ARCHIVED

Regras testadas:
- Apenas admin/super_admin (USER comum recebe 403 mesmo sendo autor).
- Restore so funciona em ARCHIVED (outros estados: 409).
- Hard delete so funciona em ARCHIVED (outros estados: 409
  PROCESS_NOT_DELETABLE — forca o admin a passar por arquivar antes).
- Cascade do hard delete: FlowSteps e StepResources do processo somem junto
  (ORM cascade). UserProgress nao e checado aqui — em SQLite o ON DELETE
  CASCADE so atua com PRAGMA foreign_keys=ON; em Postgres a integridade e
  garantida pelo banco.
"""

from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import UserRole, UserStatus
from app.core.security import create_access_token, hash_password
from app.models.flow_step import FlowStep
from app.models.process import Process
from app.models.sector import Sector
from app.models.step_resource import StepResource
from app.models.user import User


def _create_user(
    session: Session,
    *,
    email: str,
    role: UserRole = UserRole.ADMIN,
) -> User:
    user = User(
        name=f"User {email}",
        email=email,
        siape="9999999",
        sector="PROAD",
        password_hash=hash_password("senhaForte123"),
        role=role,
        status=UserStatus.APPROVED,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role)}"}


def _create_sector(session: Session, *, acronym: str = "PROAD") -> Sector:
    sector = Sector(name=f"Setor {acronym}", acronym=acronym)
    session.add(sector)
    session.commit()
    session.refresh(sector)
    return sector


def _create_process(client: TestClient, headers: dict, **overrides) -> dict:
    payload = {
        "title": "Processo",
        "short_description": "Curta",
        "full_description": "Longa",
        "category": "RH",
        "estimated_time": "30 dias",
        "requirements": [],
    }
    payload.update(overrides)
    response = client.post("/processes", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _archive(client: TestClient, process_id: str, headers: dict) -> None:
    response = client.delete(f"/processes/{process_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "ARCHIVED"


# ---------- POST /processes/{id}/restore ----------


def test_restore_admin_volta_archived_para_draft(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.r1@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    _archive(client, process["id"], _auth_headers(admin))

    response = client.post(
        f"/processes/{process['id']}/restore", headers=_auth_headers(admin)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "DRAFT"
    assert body["id"] == process["id"]


def test_restore_super_admin_tambem_pode(client: TestClient, session: Session):
    super_admin = _create_user(
        session, email="sa.r@ifam.edu.br", role=UserRole.SUPER_ADMIN
    )
    process = _create_process(client, _auth_headers(super_admin))
    _archive(client, process["id"], _auth_headers(super_admin))

    response = client.post(
        f"/processes/{process['id']}/restore",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "DRAFT"


def test_restore_user_comum_retorna_403_mesmo_sendo_autor(
    client: TestClient, session: Session
):
    """USER autor nao pode restaurar — restore e privilegio de admin."""
    admin = _create_user(session, email="admin.r2@ifam.edu.br")
    user = _create_user(session, email="u.r2@ifam.edu.br", role=UserRole.USER)
    process = _create_process(client, _auth_headers(user))
    _archive(client, process["id"], _auth_headers(admin))

    response = client.post(
        f"/processes/{process['id']}/restore", headers=_auth_headers(user)
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_restore_em_draft_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.r3@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/processes/{process['id']}/restore", headers=_auth_headers(admin)
    )

    assert response.status_code == 409
    body = response.json()["error"]
    assert body["code"] == "INVALID_STATE_TRANSITION"
    assert body["details"]["current_status"] == "DRAFT"


def test_restore_em_published_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.r4@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )
    client.post(
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(admin),
    )

    response = client.post(
        f"/processes/{process['id']}/restore", headers=_auth_headers(admin)
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


def test_restore_em_in_review_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.r5@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    response = client.post(
        f"/processes/{process['id']}/restore", headers=_auth_headers(admin)
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


def test_restore_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.r6@ifam.edu.br")

    response = client.post(
        f"/processes/{uuid4()}/restore", headers=_auth_headers(admin)
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_restore_sem_auth_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.r7@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    _archive(client, process["id"], _auth_headers(admin))

    response = client.post(f"/processes/{process['id']}/restore")

    assert response.status_code == 401


def test_restore_preserva_approved_by_anterior(client: TestClient, session: Session):
    """Restore nao apaga `approved_by` — mantem o historico de quem aprovou
    a publicacao anterior. Se o admin re-publicar, sera sobrescrito no
    approve seguinte.
    """
    admin = _create_user(session, email="admin.r8@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )
    client.post(
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(admin),
    )
    _archive(client, process["id"], _auth_headers(admin))

    response = client.post(
        f"/processes/{process['id']}/restore", headers=_auth_headers(admin)
    )

    assert response.status_code == 200
    assert response.json()["approved_by"] == str(admin.id)


# ---------- DELETE /processes/{id}/permanently ----------


def test_delete_permanently_admin_apaga_archived(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.d1@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    _archive(client, process["id"], _auth_headers(admin))

    response = client.delete(
        f"/processes/{process['id']}/permanently",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 204
    # Linha sumiu de verdade do banco — get_process_admin levantaria 404.
    assert session.get(Process, UUID(process["id"])) is None


def test_delete_permanently_super_admin_tambem_pode(
    client: TestClient, session: Session
):
    super_admin = _create_user(
        session, email="sa.d@ifam.edu.br", role=UserRole.SUPER_ADMIN
    )
    process = _create_process(client, _auth_headers(super_admin))
    _archive(client, process["id"], _auth_headers(super_admin))

    response = client.delete(
        f"/processes/{process['id']}/permanently",
        headers=_auth_headers(super_admin),
    )

    assert response.status_code == 204


def test_delete_permanently_cascada_steps_e_resources(
    client: TestClient, session: Session
):
    """Steps + resources do processo somem via ORM cascade."""
    admin = _create_user(session, email="admin.d2@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))

    step_resp = client.post(
        f"/processes/{process['id']}/steps",
        json={
            "sector_id": str(sector.id),
            "order": 1,
            "title": "Etapa A",
            "description": "Detalhes",
            "responsible": "Solicitante",
            "estimated_time": "1 dia",
        },
        headers=_auth_headers(admin),
    )
    assert step_resp.status_code == 201, step_resp.text
    step_id = step_resp.json()["id"]

    resource_resp = client.post(
        f"/processes/{process['id']}/steps/{step_id}/resources",
        json={
            "type": "DOCUMENT",
            "title": "Formulario",
            "url": "https://example.com/form.pdf",
            "content": None,
        },
        headers=_auth_headers(admin),
    )
    assert resource_resp.status_code == 201, resource_resp.text
    resource_id = resource_resp.json()["id"]

    _archive(client, process["id"], _auth_headers(admin))

    response = client.delete(
        f"/processes/{process['id']}/permanently",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 204
    assert session.get(Process, UUID(process["id"])) is None
    assert session.get(FlowStep, UUID(step_id)) is None
    assert session.get(StepResource, UUID(resource_id)) is None


def test_delete_permanently_user_comum_retorna_403_mesmo_sendo_autor(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.d3@ifam.edu.br")
    user = _create_user(session, email="u.d3@ifam.edu.br", role=UserRole.USER)
    process = _create_process(client, _auth_headers(user))
    _archive(client, process["id"], _auth_headers(admin))

    response = client.delete(
        f"/processes/{process['id']}/permanently",
        headers=_auth_headers(user),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"
    assert session.get(Process, UUID(process["id"])) is not None


def test_delete_permanently_em_draft_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.d4@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.delete(
        f"/processes/{process['id']}/permanently",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    body = response.json()["error"]
    assert body["code"] == "PROCESS_NOT_DELETABLE"
    assert body["details"]["current_status"] == "DRAFT"


def test_delete_permanently_em_published_retorna_409(
    client: TestClient, session: Session
):
    """Forca passar por arquivar antes — protecao contra perda acidental."""
    admin = _create_user(session, email="admin.d5@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )
    client.post(
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(admin),
    )

    response = client.delete(
        f"/processes/{process['id']}/permanently",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_NOT_DELETABLE"
    assert session.get(Process, UUID(process["id"])) is not None


def test_delete_permanently_em_in_review_retorna_409(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.d6@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    response = client.delete(
        f"/processes/{process['id']}/permanently",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_NOT_DELETABLE"


def test_delete_permanently_inexistente_retorna_404(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.d7@ifam.edu.br")

    response = client.delete(
        f"/processes/{uuid4()}/permanently", headers=_auth_headers(admin)
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_delete_permanently_sem_auth_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.d8@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    _archive(client, process["id"], _auth_headers(admin))

    response = client.delete(f"/processes/{process['id']}/permanently")

    assert response.status_code == 401
