"""Testes do endpoint PATCH /progress/{process_id}/steps/{step_id} — B-24.

Cobertura obrigatoria (PR_CHECKLIST secao 5):
- 200 happy path.
- 400/422 para status invalido (enum Pydantic gera 422).
- 401 sem auth.
- Isolamento: user A nao atualiza progresso de user B mesmo mandando
  o user_id de B em algum lugar (nao existe esse lugar — o backend so
  le o id do JWT — mas testamos que um PATCH autenticado por A nao
  toca na linha de B).

Alem disso cobrimos:
- IDOR: step pertence a outro processo -> 404 STEP_NOT_FOUND.
- PATCH em processo DRAFT/IN_REVIEW/ARCHIVED -> 404 (regra combinada:
  so PUBLISHED aceita modificacoes, inclusive ARCHIVED pra nao
  permitir mexer em historico congelado).
- PATCH cria progresso se nao existia (usuario pode abrir tela e
  clicar em "concluida" sem ter feito GET antes).
- Sem sobrescrita do dict: status de outras etapas e preservado entre
  PATCHs sucessivos (regra do PR_CHECKLIST contra "sobrescrever o dict
  inteiro com apenas uma chave").
"""

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


def _create_sector(session: Session) -> Sector:
    sector = Sector(name="Setor", acronym=f"S-{uuid4().hex[:6]}")
    session.add(sector)
    session.commit()
    session.refresh(sector)
    return sector


def _create_process(
    session: Session,
    *,
    created_by,
    status: ProcessStatus = ProcessStatus.PUBLISHED,
) -> Process:
    process = Process(
        title="Processo",
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
    session: Session, *, process: Process, sector: Sector, order: int
) -> FlowStep:
    step = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=order,
        title="Etapa",
        description="desc",
        responsible="Resp",
        estimated_time="1 dia",
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


# ---------- happy path ----------


def test_patch_atualiza_status_para_completed(client: TestClient, session: Session):
    admin = _create_user(session, email="a1@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u1@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    # Garante progresso inicializado antes do PATCH.
    client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["step_statuses"][str(step.id)] == StepStatus.COMPLETED.value
    assert body["process_id"] == str(process.id)


def test_patch_atualiza_status_para_in_progress(client: TestClient, session: Session):
    admin = _create_user(session, email="a2@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u2@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "IN_PROGRESS"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 200
    assert (
        response.json()["step_statuses"][str(step.id)] == StepStatus.IN_PROGRESS.value
    )


def test_patch_cria_progresso_se_nao_existir(client: TestClient, session: Session):
    """Usuario pode mandar PATCH sem ter feito GET antes. Nesse caso o
    backend deve criar a linha do UserProgress com todos os steps em
    PENDING e aplicar o novo status em cima."""
    admin = _create_user(session, email="a3@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u3@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 200
    assert response.json()["step_statuses"][str(step.id)] == StepStatus.COMPLETED.value


def test_patch_preserva_status_de_outras_etapas(client: TestClient, session: Session):
    """Dois PATCHs em etapas diferentes devem acumular — nao sobrescrever."""
    admin = _create_user(session, email="a4@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u4@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    s1 = _add_step(session, process=process, sector=sector, order=1)
    s2 = _add_step(session, process=process, sector=sector, order=2)

    r1 = client.patch(
        f"/progress/{process.id}/steps/{s1.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )
    r2 = client.patch(
        f"/progress/{process.id}/steps/{s2.id}",
        json={"status": "IN_PROGRESS"},
        headers=_auth_headers(user),
    )

    assert r1.status_code == 200
    assert r2.status_code == 200
    statuses = r2.json()["step_statuses"]
    assert statuses[str(s1.id)] == StepStatus.COMPLETED.value
    assert statuses[str(s2.id)] == StepStatus.IN_PROGRESS.value


def test_patch_atualiza_last_updated(client: TestClient, session: Session):
    admin = _create_user(session, email="a5@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u5@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    before = client.get(f"/progress/{process.id}", headers=_auth_headers(user))
    before_last = before.json()["last_updated"]

    after = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )
    assert after.status_code == 200
    assert after.json()["last_updated"] >= before_last  # ISO-8601 compara por string


# ---------- status invalido ----------


def test_status_invalido_retorna_422(client: TestClient, session: Session):
    admin = _create_user(session, email="a6@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u6@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "DONE"},  # nao e um StepStatus
        headers=_auth_headers(user),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_body_sem_status_retorna_422(client: TestClient, session: Session):
    admin = _create_user(session, email="a7@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u7@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={},
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


def test_body_com_campo_extra_retorna_422(client: TestClient, session: Session):
    """Mass assignment: body nao pode carregar user_id/process_id/step_id
    — o schema tem extra='forbid'."""
    admin = _create_user(session, email="a8@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u8@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED", "user_id": str(uuid4())},
        headers=_auth_headers(user),
    )

    assert response.status_code == 422


# ---------- auth ----------


def test_sem_token_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="a9@ifam.edu.br", role=UserRole.ADMIN)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_token_invalido_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="a10@ifam.edu.br", role=UserRole.ADMIN)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers={"Authorization": "Bearer token-invalido"},
    )

    assert response.status_code == 401


# ---------- IDOR: step fora do processo ----------


def test_step_de_outro_processo_retorna_404(client: TestClient, session: Session):
    """URL junta process A e step B (que pertence ao processo C). O
    backend tem que recusar com 404 STEP_NOT_FOUND — nao confirmar
    que o step existe em outro processo."""
    admin = _create_user(session, email="a11@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u11@ifam.edu.br")
    sector = _create_sector(session)
    process_a = _create_process(session, created_by=admin.id)
    process_c = _create_process(session, created_by=admin.id)
    step_do_c = _add_step(session, process=process_c, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process_a.id}/steps/{step_do_c.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "STEP_NOT_FOUND"


def test_step_inexistente_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="a12@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u12@ifam.edu.br")
    process = _create_process(session, created_by=admin.id)

    response = client.patch(
        f"/progress/{process.id}/steps/{uuid4()}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "STEP_NOT_FOUND"


def test_processo_inexistente_retorna_404(client: TestClient, session: Session):
    user = _create_user(session, email="u13@ifam.edu.br")

    response = client.patch(
        f"/progress/{uuid4()}/steps/{uuid4()}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


# ---------- processo nao-PUBLISHED bloqueia PATCH ----------


def test_patch_em_processo_draft_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="a14@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u14@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id, status=ProcessStatus.DRAFT)
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_patch_em_processo_archived_retorna_404(client: TestClient, session: Session):
    """Mesmo com progresso existente (read-only em ARCHIVED), o PATCH
    tem que recusar — processo arquivado e historico congelado."""
    admin = _create_user(session, email="a15@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u15@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    # Cria progresso enquanto PUBLISHED.
    client.get(f"/progress/{process.id}", headers=_auth_headers(user))

    # Arquiva depois.
    process.status = ProcessStatus.ARCHIVED
    session.add(process)
    session.commit()

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 404


def test_patch_em_processo_in_review_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="a16@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u16@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(
        session, created_by=admin.id, status=ProcessStatus.IN_REVIEW
    )
    step = _add_step(session, process=process, sector=sector, order=1)

    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user),
    )

    assert response.status_code == 404


# ---------- isolamento entre usuarios ----------


def test_user_a_nao_pode_atualizar_progresso_de_user_b(
    client: TestClient, session: Session
):
    """O backend so le user_id do JWT. Quando A autentica e manda
    PATCH, o update acontece no progresso DO A — nao no de B. O
    progresso original de B nao pode ser alterado."""
    admin = _create_user(session, email="a17@ifam.edu.br", role=UserRole.ADMIN)
    user_a = _create_user(session, email="ua@ifam.edu.br")
    user_b = _create_user(session, email="ub@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step = _add_step(session, process=process, sector=sector, order=1)

    # B tem progresso com a etapa em PENDING.
    progress_b = UserProgress(
        user_id=user_b.id,
        process_id=process.id,
        step_statuses={str(step.id): StepStatus.PENDING.value},
    )
    session.add(progress_b)
    session.commit()
    progress_b_id = progress_b.id

    # A autentica e manda PATCH no mesmo processo/step.
    response = client.patch(
        f"/progress/{process.id}/steps/{step.id}",
        json={"status": "COMPLETED"},
        headers=_auth_headers(user_a),
    )

    assert response.status_code == 200
    body_a = response.json()
    # Foi criado um NOVO progresso para A, nao alterado o de B.
    assert body_a["id"] != str(progress_b_id)
    assert body_a["step_statuses"][str(step.id)] == StepStatus.COMPLETED.value

    # Progresso de B continua intacto no banco.
    session.expire_all()
    progress_b_reloaded = session.get(UserProgress, progress_b_id)
    assert progress_b_reloaded is not None
    assert progress_b_reloaded.step_statuses[str(step.id)] == StepStatus.PENDING.value
