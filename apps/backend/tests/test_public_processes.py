"""Testes do endpoint publico GET /processes (B-19).

Foco:
- Acesso sem auth (endpoint publico).
- Filtro rigoroso por PUBLISHED — DRAFT/IN_REVIEW/ARCHIVED nao podem vazar
  (checklist de seguranca da task).
- Busca case-insensitive em title, short_description e category.
- Filtro por category (enum validado pelo FastAPI: invalido -> 422).
- Ordenacao default por access_count desc.
- step_count vem do JOIN/COUNT no service.
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
        siape="1111111",
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
    short_description: str = "Curta",
    category: ProcessCategory = ProcessCategory.RH,
    status: ProcessStatus = ProcessStatus.PUBLISHED,
    access_count: int = 0,
) -> Process:
    process = Process(
        title=title,
        short_description=short_description,
        full_description="Longa",
        category=category,
        estimated_time="30 dias",
        requirements=[],
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


# ---------- acesso e filtragem por status ----------


def test_lista_processos_sem_auth_retorna_200(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(session, created_by=admin.id, title="Publicado")

    response = client.get("/processes")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["processes"][0]["title"] == "Publicado"


def test_lista_vazia_quando_nao_ha_publicados(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(
        session, created_by=admin.id, title="Rascunho", status=ProcessStatus.DRAFT
    )

    response = client.get("/processes")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["processes"] == []


def test_draft_in_review_archived_nao_aparecem(client: TestClient, session: Session):
    """Checklist de seguranca: so PUBLISHED pode vazar por aqui."""
    admin = _create_admin(session)
    _create_process(
        session, created_by=admin.id, title="Rascunho", status=ProcessStatus.DRAFT
    )
    _create_process(
        session,
        created_by=admin.id,
        title="Em revisao",
        status=ProcessStatus.IN_REVIEW,
    )
    _create_process(
        session,
        created_by=admin.id,
        title="Arquivado",
        status=ProcessStatus.ARCHIVED,
    )
    _create_process(session, created_by=admin.id, title="Publicado")

    response = client.get("/processes")

    assert response.status_code == 200
    body = response.json()
    titles = [p["title"] for p in body["processes"]]
    assert titles == ["Publicado"]
    assert body["total"] == 1


# ---------- busca ----------


def test_busca_por_titulo(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(session, created_by=admin.id, title="Solicitacao de capacitacao")
    _create_process(session, created_by=admin.id, title="Requisicao de material")

    response = client.get("/processes", params={"search": "capacitacao"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["processes"][0]["title"] == "Solicitacao de capacitacao"


def test_busca_case_insensitive(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(session, created_by=admin.id, title="Solicitacao de Capacitacao")

    response = client.get("/processes", params={"search": "CAPACITACAO"})

    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_busca_em_short_description(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(
        session,
        created_by=admin.id,
        title="Processo A",
        short_description="Inscricao em curso",
    )
    _create_process(
        session, created_by=admin.id, title="Processo B", short_description="Outro"
    )

    response = client.get("/processes", params={"search": "inscricao"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["processes"][0]["title"] == "Processo A"


def test_busca_em_categoria(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(
        session,
        created_by=admin.id,
        title="Financeiro",
        category=ProcessCategory.FINANCEIRO,
    )
    _create_process(
        session, created_by=admin.id, title="RH", category=ProcessCategory.RH
    )

    response = client.get("/processes", params={"search": "financeiro"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["processes"][0]["title"] == "Financeiro"


def test_busca_sem_resultado_retorna_lista_vazia(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(session, created_by=admin.id, title="Capacitacao")

    response = client.get("/processes", params={"search": "inexistente"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["processes"] == []


# ---------- filtro por categoria ----------


def test_filtro_por_categoria(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(
        session, created_by=admin.id, title="RH-1", category=ProcessCategory.RH
    )
    _create_process(
        session, created_by=admin.id, title="RH-2", category=ProcessCategory.RH
    )
    _create_process(
        session,
        created_by=admin.id,
        title="Fin",
        category=ProcessCategory.FINANCEIRO,
    )

    response = client.get("/processes", params={"category": "RH"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    titles = {p["title"] for p in body["processes"]}
    assert titles == {"RH-1", "RH-2"}


def test_filtro_por_categoria_invalida_retorna_422(client: TestClient):
    """FastAPI valida o enum automaticamente — o handler global em main.py
    devolve VALIDATION_ERROR."""
    response = client.get("/processes", params={"category": "INEXISTENTE"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_combinacao_search_e_category(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(
        session,
        created_by=admin.id,
        title="Capacitacao RH",
        category=ProcessCategory.RH,
    )
    _create_process(
        session,
        created_by=admin.id,
        title="Capacitacao Fin",
        category=ProcessCategory.FINANCEIRO,
    )
    _create_process(
        session, created_by=admin.id, title="Outro", category=ProcessCategory.RH
    )

    response = client.get(
        "/processes", params={"search": "capacitacao", "category": "RH"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["processes"][0]["title"] == "Capacitacao RH"


# ---------- ordenacao e step_count ----------


def test_ordenacao_por_access_count_desc(client: TestClient, session: Session):
    admin = _create_admin(session)
    _create_process(
        session, created_by=admin.id, title="Menos acessado", access_count=2
    )
    _create_process(
        session, created_by=admin.id, title="Mais acessado", access_count=50
    )
    _create_process(session, created_by=admin.id, title="Medio", access_count=10)

    response = client.get("/processes")

    assert response.status_code == 200
    titles = [p["title"] for p in response.json()["processes"]]
    assert titles == ["Mais acessado", "Medio", "Menos acessado"]


def test_step_count_reflete_etapas_criadas(client: TestClient, session: Session):
    admin = _create_admin(session)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id, title="Com 3 etapas")
    _add_step(session, process, sector, 1)
    _add_step(session, process, sector, 2)
    _add_step(session, process, sector, 3)

    _create_process(session, created_by=admin.id, title="Sem etapas")

    response = client.get("/processes")

    assert response.status_code == 200
    by_title = {p["title"]: p for p in response.json()["processes"]}
    assert by_title["Com 3 etapas"]["step_count"] == 3
    assert by_title["Sem etapas"]["step_count"] == 0
