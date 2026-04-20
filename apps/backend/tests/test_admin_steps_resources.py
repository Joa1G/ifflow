"""Testes de integracao dos endpoints admin de FlowStep e StepResource (B-17).

Foco em:
- Autorizacao: 401 sem token, 403 para USER comum (admin/super_admin passa).
- IDOR: step_id pertence a process_id, resource_id pertence a step_id. Mismatch
  retorna 404 (nao 403 — nao confirmar existencia do id em outro contexto).
- Processo ARCHIVED bloqueia TODAS as mutacoes de fluxo (PROCESS_NOT_EDITABLE).
- Reordenacao de steps via campo `order` no PATCH.
- Cascade: deletar step apaga resources associados.
- Validacao de sector inexistente (SECTOR_NOT_FOUND).
"""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import UserRole, UserStatus
from app.core.security import create_access_token, hash_password
from app.models.sector import Sector
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
        siape="5555555",
        sector="PROAD",
        password_hash=hash_password("senhaForte123"),
        role=role,
        status=UserStatus.APPROVED,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_sector(session: Session, *, acronym: str = "PROAD") -> Sector:
    sector = Sector(name=f"Setor {acronym}", acronym=acronym)
    session.add(sector)
    session.commit()
    session.refresh(sector)
    return sector


def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


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
    response = client.post("/admin/processes", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _step_payload(sector_id, **overrides) -> dict:
    base = {
        "sector_id": str(sector_id),
        "order": 1,
        "title": "Preencher formulario",
        "description": "Detalhes...",
        "responsible": "Solicitante",
        "estimated_time": "1 dia",
    }
    base.update(overrides)
    return base


# ---------- POST /admin/processes/{id}/steps ----------


def test_criar_step_como_admin_201(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.s@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["process_id"] == process["id"]
    assert body["order"] == 1
    assert body["sector_id"] == str(sector.id)
    assert body["title"] == "Preencher formulario"


def test_criar_step_sem_auth_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.sa@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
    )

    assert response.status_code == 401


def test_criar_step_como_user_comum_retorna_403(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.sb@ifam.edu.br")
    user = _create_user(session, email="u.sb@ifam.edu.br", role=UserRole.USER)
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(user),
    )

    assert response.status_code == 403


def test_criar_step_em_processo_archived_retorna_409(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.sar@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    client.delete(f"/admin/processes/{process['id']}", headers=_auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_NOT_EDITABLE"


def test_criar_step_em_processo_inexistente_retorna_404(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.sn@ifam.edu.br")
    sector = _create_sector(session)

    response = client.post(
        f"/admin/processes/{uuid4()}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_criar_step_com_sector_inexistente_retorna_404(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.ss@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(uuid4()),
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SECTOR_NOT_FOUND"


# ---------- PATCH /admin/processes/{id}/steps/{step_id} ----------


def test_editar_step_atualiza_campos(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.e@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.patch(
        f"/admin/processes/{process['id']}/steps/{step['id']}",
        json={"title": "Novo titulo", "order": 5},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Novo titulo"
    assert body["order"] == 5
    assert body["description"] == step["description"]


def test_editar_step_reordena_via_campo_order(client: TestClient, session: Session):
    """Regressao: validar que o rename schema `order` -> model `order_index`
    funciona no PATCH — bug facil de introduzir ao refatorar."""
    admin = _create_user(session, email="admin.o@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id, order=1),
        headers=_auth_headers(admin),
    ).json()

    response = client.patch(
        f"/admin/processes/{process['id']}/steps/{step['id']}",
        json={"order": 99},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.json()["order"] == 99


def test_editar_step_nao_pertencente_ao_processo_retorna_404_idor(
    client: TestClient, session: Session
):
    """IDOR: step existe, mas em OUTRO processo. Deve retornar 404 em vez
    de permitir edicao cross-processo."""
    admin = _create_user(session, email="admin.i@ifam.edu.br")
    sector = _create_sector(session)
    process_a = _create_process(client, _auth_headers(admin), title="A")
    process_b = _create_process(client, _auth_headers(admin), title="B")
    step_in_b = client.post(
        f"/admin/processes/{process_b['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    # Tenta editar via process_a (IDOR).
    response = client.patch(
        f"/admin/processes/{process_a['id']}/steps/{step_in_b['id']}",
        json={"title": "hacked"},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "STEP_NOT_FOUND"


def test_editar_step_em_processo_archived_retorna_409(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.ea@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()
    client.delete(f"/admin/processes/{process['id']}", headers=_auth_headers(admin))

    response = client.patch(
        f"/admin/processes/{process['id']}/steps/{step['id']}",
        json={"title": "late"},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_NOT_EDITABLE"


def test_editar_step_com_sector_inexistente_retorna_404(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.es@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.patch(
        f"/admin/processes/{process['id']}/steps/{step['id']}",
        json={"sector_id": str(uuid4())},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SECTOR_NOT_FOUND"


# ---------- DELETE /admin/processes/{id}/steps/{step_id} ----------


def test_deletar_step_204(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.d@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.delete(
        f"/admin/processes/{process['id']}/steps/{step['id']}",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 204


def test_deletar_step_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.dn@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.delete(
        f"/admin/processes/{process['id']}/steps/{uuid4()}",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "STEP_NOT_FOUND"


def test_deletar_step_cascata_remove_resources(client: TestClient, session: Session):
    """Cascade delete via ORM (B-14): deletar step apaga seus resources.

    Checamos indiretamente tentando deletar o resource depois — deve dar 404.
    """
    admin = _create_user(session, email="admin.dc@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()
    resource = client.post(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources",
        json={
            "type": "LINK",
            "title": "Link",
            "url": "https://example.com",
        },
        headers=_auth_headers(admin),
    ).json()

    client.delete(
        f"/admin/processes/{process['id']}/steps/{step['id']}",
        headers=_auth_headers(admin),
    )

    # Resource deveria ter sumido por cascade — mas como o step tambem sumiu,
    # o primeiro 404 e STEP_NOT_FOUND (a validacao de IDOR checa step antes
    # do resource).
    response = client.delete(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources/{resource['id']}",
        headers=_auth_headers(admin),
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "STEP_NOT_FOUND"


# ---------- POST /admin/processes/{id}/steps/{step_id}/resources ----------


def test_criar_resource_document_so_url(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.r@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.post(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources",
        json={
            "type": "DOCUMENT",
            "title": "Formulario",
            "url": "https://example.com/form.pdf",
        },
        headers=_auth_headers(admin),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "DOCUMENT"
    assert body["url"] == "https://example.com/form.pdf"
    assert body["content"] is None
    assert body["step_id"] == step["id"]


def test_criar_resource_legal_basis_so_content(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.rc@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.post(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources",
        json={
            "type": "LEGAL_BASIS",
            "title": "Lei 8.112/1990",
            "content": "Art. 87. O servidor podera...",
        },
        headers=_auth_headers(admin),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["url"] is None
    assert body["content"].startswith("Art. 87")


def test_criar_resource_step_em_outro_processo_retorna_404_idor(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.ri@ifam.edu.br")
    sector = _create_sector(session)
    process_a = _create_process(client, _auth_headers(admin), title="A")
    process_b = _create_process(client, _auth_headers(admin), title="B")
    step_b = client.post(
        f"/admin/processes/{process_b['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.post(
        f"/admin/processes/{process_a['id']}/steps/{step_b['id']}/resources",
        json={
            "type": "LINK",
            "title": "Link",
            "url": "https://example.com",
        },
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "STEP_NOT_FOUND"


def test_criar_resource_em_processo_archived_retorna_409(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.ra@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()
    client.delete(f"/admin/processes/{process['id']}", headers=_auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources",
        json={"type": "LINK", "title": "x", "url": "https://x"},
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROCESS_NOT_EDITABLE"


def test_criar_resource_como_user_comum_retorna_403(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.ru@ifam.edu.br")
    user = _create_user(session, email="u.ru@ifam.edu.br", role=UserRole.USER)
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.post(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources",
        json={"type": "LINK", "title": "x", "url": "https://x"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 403


# ---------- DELETE resource ----------


def test_deletar_resource_204(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.dr@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()
    resource = client.post(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources",
        json={
            "type": "LINK",
            "title": "Link",
            "url": "https://example.com",
        },
        headers=_auth_headers(admin),
    ).json()

    response = client.delete(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources/{resource['id']}",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 204


def test_deletar_resource_em_step_errado_retorna_404_idor(
    client: TestClient, session: Session
):
    """IDOR: resource existe, mas no step B. Tentar deletar via step A deve
    retornar 404 (nao revelar existencia cross-step)."""
    admin = _create_user(session, email="admin.drf@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step_a = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id, order=1),
        headers=_auth_headers(admin),
    ).json()
    step_b = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id, order=2),
        headers=_auth_headers(admin),
    ).json()
    resource_b = client.post(
        f"/admin/processes/{process['id']}/steps/{step_b['id']}/resources",
        json={"type": "LINK", "title": "B", "url": "https://b"},
        headers=_auth_headers(admin),
    ).json()

    response = client.delete(
        f"/admin/processes/{process['id']}/steps/{step_a['id']}/resources/{resource_b['id']}",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_deletar_resource_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.drn@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()

    response = client.delete(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources/{uuid4()}",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_deletar_resource_como_user_comum_retorna_403(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="admin.dru@ifam.edu.br")
    user = _create_user(session, email="u.dru@ifam.edu.br", role=UserRole.USER)
    sector = _create_sector(session)
    process = _create_process(client, _auth_headers(admin))
    step = client.post(
        f"/admin/processes/{process['id']}/steps",
        json=_step_payload(sector.id),
        headers=_auth_headers(admin),
    ).json()
    resource = client.post(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources",
        json={"type": "LINK", "title": "x", "url": "https://x"},
        headers=_auth_headers(admin),
    ).json()

    response = client.delete(
        f"/admin/processes/{process['id']}/steps/{step['id']}/resources/{resource['id']}",
        headers=_auth_headers(user),
    )

    assert response.status_code == 403
