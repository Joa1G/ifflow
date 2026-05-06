"""Testes do endpoint GET /progress/mine — feature "Processos que acompanho".

Cobertura obrigatoria do PR_CHECKLIST: happy path, 401, e o teste de
isolamento (user A so ve os proprios progressos).

Alem disso cobrimos:
- Lista vazia retorna {"following": []}.
- Contadores `completed_steps`/`total_steps` refletem as etapas atuais
  do processo (e nao chaves orfas no JSONB step_statuses).
- Processo ARCHIVED com progresso pre-existente continua aparecendo.
- Ordem decrescente por `last_updated`.
- "mine" e roteado para a listagem e nao para GET /progress/{process_id}.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import (
    ProcessCategory,
    ProcessStatus,
    StepStatus,
    UserRole,
    UserStatus,
)
from app.core.security import create_access_token, hash_password
from app.models.flow_step import FlowStep
from app.models.process import Process
from app.models.sector import Sector
from app.models.user import User
from app.models.user_progress import UserProgress

# ---------- helpers ----------


def _create_user(
    session: Session,
    *,
    email: str,
    role: UserRole = UserRole.USER,
) -> User:
    user = User(
        name=f"User {email}",
        email=email,
        siape="1234567",
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


def _create_sector(session: Session, *, name: str = "PROAD") -> Sector:
    sector = Sector(name=name, acronym=f"S-{uuid4().hex[:6]}")
    session.add(sector)
    session.commit()
    session.refresh(sector)
    return sector


def _create_process(
    session: Session,
    *,
    created_by,
    status: ProcessStatus = ProcessStatus.PUBLISHED,
    category: ProcessCategory = ProcessCategory.RH,
    title: str = "Processo",
    short_description: str = "curta",
) -> Process:
    process = Process(
        title=title,
        short_description=short_description,
        full_description="longa",
        category=category,
        estimated_time="30 dias",
        requirements=[],
        status=status,
        access_count=0,
        created_by=created_by,
    )
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


def _add_step(
    session: Session,
    *,
    process: Process,
    sector: Sector,
    order: int,
    title: str = "Etapa",
) -> FlowStep:
    step = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=order,
        title=title,
        description="desc",
        responsible="Resp",
        estimated_time="1 dia",
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


def _add_progress(
    session: Session,
    *,
    user: User,
    process: Process,
    step_statuses: dict[str, str],
    last_updated: datetime | None = None,
) -> UserProgress:
    progress = UserProgress(
        user_id=user.id,
        process_id=process.id,
        step_statuses=step_statuses,
        last_updated=last_updated or datetime.now(timezone.utc),
    )
    session.add(progress)
    session.commit()
    session.refresh(progress)
    return progress


# ---------- happy path / lista vazia ----------


def test_lista_vazia_retorna_following_vazio(client: TestClient, session: Session):
    user = _create_user(session, email="empty@ifam.edu.br")

    response = client.get("/progress/mine", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json() == {"following": []}


def test_caminho_feliz_lista_progressos_com_contadores(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="adm1@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="happy@ifam.edu.br")
    sector = _create_sector(session)

    # Processo A: 3 etapas, 1 concluida.
    p_a = _create_process(
        session,
        created_by=admin.id,
        title="Capacitacao",
        category=ProcessCategory.RH,
    )
    a1 = _add_step(session, process=p_a, sector=sector, order=1)
    a2 = _add_step(session, process=p_a, sector=sector, order=2)
    a3 = _add_step(session, process=p_a, sector=sector, order=3)
    _add_progress(
        session,
        user=user,
        process=p_a,
        step_statuses={
            str(a1.id): StepStatus.COMPLETED.value,
            str(a2.id): StepStatus.IN_PROGRESS.value,
            str(a3.id): StepStatus.PENDING.value,
        },
    )

    # Processo B: 2 etapas, 2 concluidas.
    p_b = _create_process(
        session,
        created_by=admin.id,
        title="Diaria",
        category=ProcessCategory.FINANCEIRO,
    )
    b1 = _add_step(session, process=p_b, sector=sector, order=1)
    b2 = _add_step(session, process=p_b, sector=sector, order=2)
    _add_progress(
        session,
        user=user,
        process=p_b,
        step_statuses={
            str(b1.id): StepStatus.COMPLETED.value,
            str(b2.id): StepStatus.COMPLETED.value,
        },
    )

    response = client.get("/progress/mine", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    items = body["following"]
    assert len(items) == 2

    by_id = {item["process_id"]: item for item in items}
    item_a = by_id[str(p_a.id)]
    assert item_a["process_title"] == "Capacitacao"
    assert item_a["process_category"] == "RH"
    assert item_a["process_status"] == "PUBLISHED"
    assert item_a["completed_steps"] == 1
    assert item_a["total_steps"] == 3

    item_b = by_id[str(p_b.id)]
    assert item_b["process_title"] == "Diaria"
    assert item_b["process_category"] == "FINANCEIRO"
    assert item_b["completed_steps"] == 2
    assert item_b["total_steps"] == 2


# ---------- contadores resilientes a reconciliacao ----------


def test_chaves_orfas_nao_inflacionam_contadores(client: TestClient, session: Session):
    """Se o admin removeu um step apos o ultimo GET/PATCH do user, o
    JSONB ainda tem a chave antiga. A listagem deve ignorar essa chave
    e reportar contadores baseados nos steps atuais."""
    admin = _create_user(session, email="adm2@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="orfas@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)

    orphan_step_id = str(uuid4())
    _add_progress(
        session,
        user=user,
        process=process,
        step_statuses={
            str(s1.id): StepStatus.COMPLETED.value,
            # chave orfa: aponta para um step_id que nao existe mais
            orphan_step_id: StepStatus.COMPLETED.value,
        },
    )

    response = client.get("/progress/mine", headers=_auth_headers(user))

    assert response.status_code == 200
    item = response.json()["following"][0]
    assert item["total_steps"] == 1
    assert item["completed_steps"] == 1


def test_processo_sem_steps_reporta_contadores_zerados(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="adm3@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="zero@ifam.edu.br")
    process = _create_process(session, created_by=admin.id)
    _add_progress(session, user=user, process=process, step_statuses={})

    response = client.get("/progress/mine", headers=_auth_headers(user))

    assert response.status_code == 200
    item = response.json()["following"][0]
    assert item["total_steps"] == 0
    assert item["completed_steps"] == 0


# ---------- archived continua aparecendo ----------


def test_processo_archived_com_progresso_aparece_na_lista(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="adm4@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="arch@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)
    _add_progress(
        session,
        user=user,
        process=process,
        step_statuses={str(s1.id): StepStatus.COMPLETED.value},
    )

    # Admin arquiva apos o user ja ter progresso.
    process.status = ProcessStatus.ARCHIVED
    session.add(process)
    session.commit()

    response = client.get("/progress/mine", headers=_auth_headers(user))

    assert response.status_code == 200
    items = response.json()["following"]
    assert len(items) == 1
    assert items[0]["process_status"] == "ARCHIVED"


# ---------- ordenacao ----------


def test_resultado_ordenado_por_last_updated_desc(client: TestClient, session: Session):
    admin = _create_user(session, email="adm5@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="ord@ifam.edu.br")
    p_old = _create_process(session, created_by=admin.id, title="Velho")
    p_new = _create_process(session, created_by=admin.id, title="Novo")

    now = datetime.now(timezone.utc)
    _add_progress(
        session,
        user=user,
        process=p_old,
        step_statuses={},
        last_updated=now - timedelta(days=2),
    )
    _add_progress(
        session,
        user=user,
        process=p_new,
        step_statuses={},
        last_updated=now,
    )

    response = client.get("/progress/mine", headers=_auth_headers(user))

    assert response.status_code == 200
    titles = [item["process_title"] for item in response.json()["following"]]
    assert titles == ["Novo", "Velho"]


# ---------- isolamento entre usuarios ----------


def test_user_b_nao_ve_progressos_do_user_a(client: TestClient, session: Session):
    admin = _create_user(session, email="adm6@ifam.edu.br", role=UserRole.ADMIN)
    user_a = _create_user(session, email="iso-a@ifam.edu.br")
    user_b = _create_user(session, email="iso-b@ifam.edu.br")
    process = _create_process(session, created_by=admin.id)

    _add_progress(session, user=user_a, process=process, step_statuses={})

    response = client.get("/progress/mine", headers=_auth_headers(user_b))

    assert response.status_code == 200
    assert response.json() == {"following": []}


# ---------- auth ----------


def test_sem_token_retorna_401(client: TestClient, session: Session):
    response = client.get("/progress/mine")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_token_invalido_retorna_401(client: TestClient, session: Session):
    response = client.get(
        "/progress/mine",
        headers={"Authorization": "Bearer token-invalido"},
    )

    assert response.status_code == 401


# ---------- ordem dos handlers no router ----------


def test_mine_nao_e_interpretado_como_uuid_no_get_por_id(
    client: TestClient, session: Session
):
    """Defesa contra regressao: se alguem reordenar o router e o
    `GET /{process_id}` ficar antes do `GET /mine`, "mine" cairia no
    handler de detalhe, falharia o parse de UUID e retornaria 422.
    Aqui exigimos 200 — ou seja, o roteamento esta correto."""
    user = _create_user(session, email="route@ifam.edu.br")

    response = client.get("/progress/mine", headers=_auth_headers(user))

    assert response.status_code == 200
