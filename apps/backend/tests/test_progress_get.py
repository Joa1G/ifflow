"""Testes do endpoint GET /progress/{process_id} — B-23.

Cobertura obrigatoria (PR_CHECKLIST secao 5): happy path, 401, 404,
e o teste de isolamento (user A nao ve progresso de B).

Alem disso cobrimos:
- Primeira chamada CRIA o progresso com todos os steps em PENDING.
- Chamadas subsequentes retornam o mesmo progresso (mesmo id).
- Reconciliacao: novos steps aparecem como PENDING, steps removidos
  somem do dict, steps existentes preservam o status.
- Regra combinada com o time: se progresso JA existe, retorna mesmo
  com processo ARCHIVED; se NAO existe e o processo nao esta
  PUBLISHED, responde 404 (nao vaza rascunho).
"""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session, select

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
    title: str = "Processo",
) -> Process:
    process = Process(
        title=title,
        short_description="curta",
        full_description="longa",
        category=ProcessCategory.RH,
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


# ---------- happy path + criacao automatica ----------


def test_primeira_chamada_cria_progresso_com_tudo_em_pending(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a1@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u1@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)
    s2 = _add_step(session, process=process, sector=sector, order=2)
    s3 = _add_step(session, process=process, sector=sector, order=3)

    response = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["process_id"] == str(process.id)
    assert set(body["step_statuses"].keys()) == {str(s1.id), str(s2.id), str(s3.id)}
    assert all(v == StepStatus.PENDING.value for v in body["step_statuses"].values())
    assert body["id"] is not None
    assert body["last_updated"] is not None


def test_chamadas_subsequentes_retornam_mesmo_progresso(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a2@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u2@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    _add_step(session, process=process, sector=sector, order=1)

    r1 = client.get(f"/progress/{process.id}", headers=_auth_headers(user))
    r2 = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]

    # Uma unica linha de UserProgress existe no banco — nao criou duplicata.
    all_progress = session.exec(
        select(UserProgress).where(
            UserProgress.user_id == user.id,
            UserProgress.process_id == process.id,
        )
    ).all()
    assert len(all_progress) == 1


def test_processo_sem_steps_cria_progresso_com_dict_vazio(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a3@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u3@ifam.edu.br")
    process = _create_process(session, created_by=admin.id)

    response = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json()["step_statuses"] == {}


# ---------- reconciliacao ----------


def test_novos_steps_aparecem_como_pending_em_proxima_chamada(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a4@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u4@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)

    # Primeira chamada registra progresso com s1.
    r1 = client.get(f"/progress/{process.id}", headers=_auth_headers(user))
    assert r1.status_code == 200
    assert set(r1.json()["step_statuses"].keys()) == {str(s1.id)}

    # Admin adiciona uma etapa nova ao processo.
    s2 = _add_step(session, process=process, sector=sector, order=2, title="Nova")

    r2 = client.get(f"/progress/{process.id}", headers=_auth_headers(user))
    assert r2.status_code == 200
    statuses = r2.json()["step_statuses"]
    assert set(statuses.keys()) == {str(s1.id), str(s2.id)}
    assert statuses[str(s2.id)] == StepStatus.PENDING.value


def test_step_removido_do_processo_some_do_progresso(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a5@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u5@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)
    s2 = _add_step(session, process=process, sector=sector, order=2)

    r1 = client.get(f"/progress/{process.id}", headers=_auth_headers(user))
    assert r1.status_code == 200
    assert set(r1.json()["step_statuses"].keys()) == {str(s1.id), str(s2.id)}

    session.delete(s2)
    session.commit()

    r2 = client.get(f"/progress/{process.id}", headers=_auth_headers(user))
    assert r2.status_code == 200
    assert set(r2.json()["step_statuses"].keys()) == {str(s1.id)}


def test_reconciliacao_preserva_status_de_steps_ja_existentes(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a6@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u6@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)

    # Simula um status ja avancado para s1 no banco, sem passar por
    # PATCH (ainda nao existe no B-23) — exercita APENAS a reconciliacao.
    progress = UserProgress(
        user_id=user.id,
        process_id=process.id,
        step_statuses={str(s1.id): StepStatus.COMPLETED.value},
    )
    session.add(progress)
    session.commit()

    # Admin adiciona novo step depois que o user ja marcou s1 como completo.
    s2 = _add_step(session, process=process, sector=sector, order=2)

    response = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert response.status_code == 200
    statuses = response.json()["step_statuses"]
    assert statuses[str(s1.id)] == StepStatus.COMPLETED.value
    assert statuses[str(s2.id)] == StepStatus.PENDING.value


# ---------- auth ----------


def test_sem_token_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="a7@ifam.edu.br", role=UserRole.ADMIN)
    process = _create_process(session, created_by=admin.id)

    response = client.get(f"/progress/{process.id}")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_token_invalido_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="a8@ifam.edu.br", role=UserRole.ADMIN)
    process = _create_process(session, created_by=admin.id)

    response = client.get(
        f"/progress/{process.id}",
        headers={"Authorization": "Bearer token-invalido"},
    )

    assert response.status_code == 401


# ---------- processo inexistente / nao-PUBLISHED ----------


def test_processo_inexistente_retorna_404(client: TestClient, session: Session):
    user = _create_user(session, email="u9@ifam.edu.br")

    response = client.get(f"/progress/{uuid4()}", headers=_auth_headers(user))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_processo_draft_sem_progresso_existente_retorna_404(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a10@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u10@ifam.edu.br")
    process = _create_process(session, created_by=admin.id, status=ProcessStatus.DRAFT)

    response = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_processo_in_review_sem_progresso_existente_retorna_404(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a11@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u11@ifam.edu.br")
    process = _create_process(
        session, created_by=admin.id, status=ProcessStatus.IN_REVIEW
    )

    response = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert response.status_code == 404


def test_processo_archived_sem_progresso_existente_retorna_404(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a12@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u12@ifam.edu.br")
    process = _create_process(
        session, created_by=admin.id, status=ProcessStatus.ARCHIVED
    )

    response = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert response.status_code == 404


def test_progresso_existente_em_processo_archived_retorna_200(
    client: TestClient, session: Session
):
    """Regra combinada: ARCHIVED preserva historico — quem ja tinha
    progresso continua acessando mesmo depois do arquivamento."""
    admin = _create_user(session, email="a13@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u13@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)

    progress = UserProgress(
        user_id=user.id,
        process_id=process.id,
        step_statuses={str(s1.id): StepStatus.COMPLETED.value},
    )
    session.add(progress)
    session.commit()

    # Admin arquiva o processo apos o progresso existir.
    process.status = ProcessStatus.ARCHIVED
    session.add(process)
    session.commit()

    response = client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json()["step_statuses"][str(s1.id)] == StepStatus.COMPLETED.value


# ---------- isolamento entre usuarios ----------


def test_user_b_nao_ve_progresso_do_user_a(client: TestClient, session: Session):
    """User B pedindo progresso do mesmo processo ganha OUTRO progresso,
    proprio, com status zerados — nao enxerga o de A.
    """
    admin = _create_user(session, email="a14@ifam.edu.br", role=UserRole.ADMIN)
    user_a = _create_user(session, email="ua@ifam.edu.br")
    user_b = _create_user(session, email="ub@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)

    progress_a = UserProgress(
        user_id=user_a.id,
        process_id=process.id,
        step_statuses={str(s1.id): StepStatus.COMPLETED.value},
    )
    session.add(progress_a)
    session.commit()

    response_b = client.get(f"/progress/{process.id}", headers=_auth_headers(user_b))

    assert response_b.status_code == 200
    body_b = response_b.json()
    assert body_b["id"] != str(progress_a.id)
    assert body_b["step_statuses"][str(s1.id)] == StepStatus.PENDING.value
