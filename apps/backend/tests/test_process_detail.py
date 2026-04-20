"""Testes do endpoint publico GET /processes/{id} (B-20).

Foco:
- Detalhes publicos de um processo PUBLISHED, sem auth.
- Incremento atomico de access_count (UPDATE direto, sem race).
- DRAFT/IN_REVIEW/ARCHIVED nao sao retornados (404 PROCESS_NOT_FOUND),
  mesmo tratamento de id inexistente (nao vaza existencia de rascunhos).
- Status nao-publicado NAO tem access_count incrementado.
"""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import ProcessCategory, ProcessStatus, UserRole, UserStatus
from app.core.security import hash_password
from app.models.flow_step import FlowStep
from app.models.process import Process
from app.models.sector import Sector
from app.models.user import User


def _create_admin(session: Session, *, email: str = "admin@ifam.edu.br") -> User:
    user = User(
        name="Admin",
        email=email,
        siape="2222222",
        sector="PROAD",
        password_hash=hash_password("senhaForte123"),
        role=UserRole.ADMIN,
        status=UserStatus.APPROVED,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_sector(session: Session) -> Sector:
    sector = Sector(name="PROAD", acronym=f"S-{uuid4().hex[:6]}")
    session.add(sector)
    session.commit()
    session.refresh(sector)
    return sector


def _create_process(
    session: Session,
    *,
    created_by,
    title: str = "Processo X",
    status: ProcessStatus = ProcessStatus.PUBLISHED,
    access_count: int = 0,
    requirements: list[str] | None = None,
) -> Process:
    process = Process(
        title=title,
        short_description="Curta",
        full_description="Longa e detalhada",
        category=ProcessCategory.RH,
        estimated_time="30 dias",
        requirements=requirements if requirements is not None else [],
        status=status,
        access_count=access_count,
        created_by=created_by,
    )
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


def _add_step(session: Session, process: Process, sector: Sector, order: int) -> None:
    step = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=order,
        title=f"Etapa {order}",
        description="Desc",
        responsible="Servidor",
        estimated_time="1 dia",
    )
    session.add(step)
    session.commit()


# ---------- caminho feliz ----------


def test_detalhe_de_processo_published_retorna_200(
    client: TestClient, session: Session
):
    admin = _create_admin(session)
    process = _create_process(
        session,
        created_by=admin.id,
        title="Capacitacao",
        requirements=["Ser servidor efetivo", "Chefia imediata"],
    )

    response = client.get(f"/processes/{process.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(process.id)
    assert body["title"] == "Capacitacao"
    assert body["full_description"] == "Longa e detalhada"
    assert body["requirements"] == ["Ser servidor efetivo", "Chefia imediata"]
    assert body["category"] == "RH"
    assert body["step_count"] == 0
    # access_count ja reflete o incremento desta chamada.
    assert body["access_count"] == 1


def test_detalhe_inclui_step_count_correto(client: TestClient, session: Session):
    admin = _create_admin(session)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    _add_step(session, process, sector, 1)
    _add_step(session, process, sector, 2)

    response = client.get(f"/processes/{process.id}")

    assert response.status_code == 200
    assert response.json()["step_count"] == 2


def test_detalhe_nao_exige_auth(client: TestClient, session: Session):
    admin = _create_admin(session)
    process = _create_process(session, created_by=admin.id)

    response = client.get(f"/processes/{process.id}")

    assert response.status_code == 200


# ---------- incremento atomico ----------


def test_access_count_incrementa_a_cada_chamada(client: TestClient, session: Session):
    admin = _create_admin(session)
    process = _create_process(session, created_by=admin.id, access_count=10)

    r1 = client.get(f"/processes/{process.id}")
    r2 = client.get(f"/processes/{process.id}")
    r3 = client.get(f"/processes/{process.id}")

    assert r1.json()["access_count"] == 11
    assert r2.json()["access_count"] == 12
    assert r3.json()["access_count"] == 13


def test_access_count_persiste_no_banco(client: TestClient, session: Session):
    """Sanity check: o UPDATE efetivamente persiste, nao e so o retorno que muda."""
    admin = _create_admin(session)
    process = _create_process(session, created_by=admin.id, access_count=5)

    client.get(f"/processes/{process.id}")
    client.get(f"/processes/{process.id}")

    session.expire_all()
    refreshed = session.get(Process, process.id)
    assert refreshed is not None
    assert refreshed.access_count == 7


# ---------- 404 (DRAFT / IN_REVIEW / ARCHIVED / inexistente) ----------


def test_detalhe_de_draft_retorna_404(client: TestClient, session: Session):
    admin = _create_admin(session)
    process = _create_process(session, created_by=admin.id, status=ProcessStatus.DRAFT)

    response = client.get(f"/processes/{process.id}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_detalhe_de_in_review_retorna_404(client: TestClient, session: Session):
    admin = _create_admin(session)
    process = _create_process(
        session, created_by=admin.id, status=ProcessStatus.IN_REVIEW
    )

    response = client.get(f"/processes/{process.id}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_detalhe_de_archived_retorna_404(client: TestClient, session: Session):
    admin = _create_admin(session)
    process = _create_process(
        session, created_by=admin.id, status=ProcessStatus.ARCHIVED
    )

    response = client.get(f"/processes/{process.id}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_detalhe_de_id_inexistente_retorna_404(client: TestClient):
    response = client.get(f"/processes/{uuid4()}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_access_count_nao_incrementa_em_nao_publicado(
    client: TestClient, session: Session
):
    """Seguranca: o UPDATE ja tem WHERE status=PUBLISHED, entao tentar acessar
    um DRAFT nao deve incrementar nada (confirma que o filtro esta no UPDATE,
    nao depois)."""
    admin = _create_admin(session)
    process = _create_process(
        session,
        created_by=admin.id,
        status=ProcessStatus.DRAFT,
        access_count=3,
    )

    client.get(f"/processes/{process.id}")

    session.expire_all()
    refreshed = session.get(Process, process.id)
    assert refreshed is not None
    assert refreshed.access_count == 3
