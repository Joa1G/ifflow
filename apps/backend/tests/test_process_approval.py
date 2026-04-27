"""Testes do fluxo de aprovacao de processos (B-18).

Foco:
- Transicoes validas: DRAFT -> IN_REVIEW (submit) e IN_REVIEW -> PUBLISHED
  (approve, seta approved_by do JWT).
- Transicoes invalidas: 409 INVALID_STATE_TRANSITION em qualquer caminho
  fora do permitido (ex: DRAFT -> PUBLISHED direto, PUBLISHED -> IN_REVIEW,
  ARCHIVED -> qualquer coisa).
- Autorizacao: 401 sem token, 403 para USER comum.
- Auto-aprovacao: permitida no MVP mas registrada em log WARNING (ate B-25
  trazer logging estruturado).
"""

import logging
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
    role: UserRole = UserRole.ADMIN,
) -> User:
    user = User(
        name=f"User {email}",
        email=email,
        siape="6666666",
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
    response = client.post("/processes", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()


# ---------- submit-for-review ----------


def test_submit_draft_para_in_review(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.s@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "IN_REVIEW"


def test_submit_processo_ja_in_review_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.sr@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    response = client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "INVALID_STATE_TRANSITION"
    assert body["error"]["details"]["current_status"] == "IN_REVIEW"


def test_submit_processo_published_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.sp@ifam.edu.br")
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
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


def test_submit_processo_archived_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.sar@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.delete(f"/processes/{process['id']}", headers=_auth_headers(admin))

    response = client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


def test_submit_sem_auth_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.sna@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.post(f"/processes/{process['id']}/submit-for-review")

    assert response.status_code == 401


def test_submit_como_user_comum_retorna_403(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.su@ifam.edu.br")
    user = _create_user(session, email="u.su@ifam.edu.br", role=UserRole.USER)
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(user),
    )

    assert response.status_code == 403


def test_submit_processo_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.sn@ifam.edu.br")

    response = client.post(
        f"/processes/{uuid4()}/submit-for-review",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


# ---------- approve ----------


def test_approve_in_review_publica_e_seta_approved_by(
    client: TestClient, session: Session
):
    """approved_by vem do JWT do aprovador — nunca do body."""
    creator = _create_user(session, email="admin.c@ifam.edu.br")
    approver = _create_user(session, email="admin.a@ifam.edu.br")
    process = _create_process(client, _auth_headers(creator))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(creator),
    )

    response = client.post(
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(approver),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PUBLISHED"
    assert body["approved_by"] == str(approver.id)
    assert body["created_by"] == str(creator.id)


def test_approve_draft_direto_retorna_409(client: TestClient, session: Session):
    """Pulo de estado DRAFT -> PUBLISHED nao e permitido."""
    admin = _create_user(session, email="admin.ad@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    body = response.json()
    assert body["error"]["code"] == "INVALID_STATE_TRANSITION"
    assert body["error"]["details"]["current_status"] == "DRAFT"
    assert body["error"]["details"]["required_status"] == "IN_REVIEW"


def test_approve_ja_published_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.ap@ifam.edu.br")
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
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATE_TRANSITION"


def test_approve_archived_retorna_409(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.aa@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.delete(f"/processes/{process['id']}", headers=_auth_headers(admin))

    response = client.post(
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(admin),
    )

    assert response.status_code == 409


def test_approve_sem_auth_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.aa401@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))

    response = client.post(f"/admin/processes/{process['id']}/approve")

    assert response.status_code == 401


def test_approve_como_user_comum_retorna_403(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.au@ifam.edu.br")
    user = _create_user(session, email="u.au@ifam.edu.br", role=UserRole.USER)
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    response = client.post(
        f"/admin/processes/{process['id']}/approve",
        headers=_auth_headers(user),
    )

    assert response.status_code == 403


def test_approve_processo_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="admin.a404@ifam.edu.br")

    response = client.post(
        f"/admin/processes/{uuid4()}/approve", headers=_auth_headers(admin)
    )

    assert response.status_code == 404


def test_approve_ignora_approved_by_do_body(client: TestClient, session: Session):
    """Garantia de que um body smuggle approved_by nao afeta o recurso — o
    endpoint nem aceita body, e mesmo se aceitasse o service pega do JWT."""
    creator = _create_user(session, email="admin.bs@ifam.edu.br")
    approver = _create_user(session, email="admin.bs2@ifam.edu.br")
    process = _create_process(client, _auth_headers(creator))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(creator),
    )

    # Tenta smuggle: body com approved_by apontando para outro usuario.
    response = client.post(
        f"/admin/processes/{process['id']}/approve",
        json={"approved_by": str(uuid4())},
        headers=_auth_headers(approver),
    )

    assert response.status_code == 200
    assert response.json()["approved_by"] == str(approver.id)


# ---------- auto-aprovacao (auditoria) ----------


def test_auto_aprovacao_permitida_mas_registrada_em_log(
    client: TestClient,
    session: Session,
    caplog,
):
    """MVP permite que o autor aprove o proprio processo — decisao da equipe
    (ver CONTRACTS.md). Mas registramos WARNING no log para auditoria ate
    B-25 trazer logging estruturado.
    """
    admin = _create_user(session, email="admin.self@ifam.edu.br")
    process = _create_process(client, _auth_headers(admin))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(admin),
    )

    with caplog.at_level(logging.WARNING, logger="app.services.process_service"):
        response = client.post(
            f"/admin/processes/{process['id']}/approve",
            headers=_auth_headers(admin),
        )

    assert response.status_code == 200
    assert response.json()["status"] == "PUBLISHED"
    assert any("process_self_approval" in r.message for r in caplog.records)


def test_aprovacao_por_terceiro_nao_emite_warning(
    client: TestClient,
    session: Session,
    caplog,
):
    """Caminho feliz (autor != aprovador) NAO deve emitir o warning de
    auto-aprovacao — garantimos que o log nao e ruidoso em prod."""
    creator = _create_user(session, email="admin.n1@ifam.edu.br")
    approver = _create_user(session, email="admin.n2@ifam.edu.br")
    process = _create_process(client, _auth_headers(creator))
    client.post(
        f"/processes/{process['id']}/submit-for-review",
        headers=_auth_headers(creator),
    )

    with caplog.at_level(logging.WARNING, logger="app.services.process_service"):
        client.post(
            f"/admin/processes/{process['id']}/approve",
            headers=_auth_headers(approver),
        )

    assert not any("process_self_approval" in r.message for r in caplog.records)
