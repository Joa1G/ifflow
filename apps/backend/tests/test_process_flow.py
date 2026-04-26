"""Testes do endpoint autenticado GET /processes/{id}/flow (B-21).

Foco:
- Autenticacao: 401 sem token.
- Processos PUBLISHED sao visiveis a qualquer autenticado.
- Processos nao publicados sao visiveis apenas ao autor ou admin.
- Ordenacao dos steps por order_index asc (criados fora de ordem).
- Envelope ProcessFullFlow com sector embutido e lista de resources por step.
"""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.enums import (
    ProcessCategory,
    ProcessStatus,
    ResourceType,
    UserRole,
    UserStatus,
)
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
    role: UserRole = UserRole.USER,
) -> User:
    user = User(
        name=f"User {email}",
        email=email,
        siape="7777777",
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
        short_description="Curta",
        full_description="Longa",
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
        description="Descricao",
        responsible="Servidor",
        estimated_time="1 dia",
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


def _add_resource(
    session: Session,
    *,
    step: FlowStep,
    type_: ResourceType = ResourceType.DOCUMENT,
    title: str = "Recurso",
    url: str | None = "https://exemplo.ifam.edu.br/doc.pdf",
    content: str | None = None,
) -> StepResource:
    resource = StepResource(
        step_id=step.id,
        type=type_,
        title=title,
        url=url,
        content=content,
    )
    session.add(resource)
    session.commit()
    session.refresh(resource)
    return resource


# ---------- caminho feliz ----------


def test_fluxo_completo_com_auth_retorna_200(client: TestClient, session: Session):
    admin = _create_user(session, email="a1@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u1@ifam.edu.br")
    sector = _create_sector(session, name="DGP")
    process = _create_process(
        session, created_by=admin.id, title="Solicitacao de Capacitacao"
    )
    step = _add_step(
        session, process=process, sector=sector, order=1, title="Preencher formulario"
    )
    _add_resource(
        session,
        step=step,
        type_=ResourceType.DOCUMENT,
        title="Formulario",
        url="https://ex/form.pdf",
    )

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 200
    body = response.json()
    assert body["process"] == {
        "id": str(process.id),
        "title": "Solicitacao de Capacitacao",
    }
    assert len(body["steps"]) == 1
    step_body = body["steps"][0]
    assert step_body["order"] == 1
    assert step_body["title"] == "Preencher formulario"
    assert step_body["sector"] == {
        "id": str(sector.id),
        "name": "DGP",
        "acronym": sector.acronym,
    }
    assert len(step_body["resources"]) == 1
    assert step_body["resources"][0]["type"] == "DOCUMENT"
    assert step_body["resources"][0]["title"] == "Formulario"


def test_user_comum_consegue_acessar_flow(client: TestClient, session: Session):
    """Endpoint e autenticado, nao restrito por role — USER basico passa."""
    admin = _create_user(session, email="a2@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u2@ifam.edu.br", role=UserRole.USER)
    process = _create_process(session, created_by=admin.id)

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 200


# ---------- ordenacao de steps ----------


def test_steps_retornam_ordenados_por_order_index(client: TestClient, session: Session):
    """Steps sao criados fora de ordem (3,1,2) mas devem voltar 1,2,3."""
    admin = _create_user(session, email="a3@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u3@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)

    _add_step(session, process=process, sector=sector, order=3, title="Terceira")
    _add_step(session, process=process, sector=sector, order=1, title="Primeira")
    _add_step(session, process=process, sector=sector, order=2, title="Segunda")

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 200
    steps = response.json()["steps"]
    assert [s["order"] for s in steps] == [1, 2, 3]
    assert [s["title"] for s in steps] == ["Primeira", "Segunda", "Terceira"]


# ---------- resources ----------


def test_resources_de_cada_step_aparecem(client: TestClient, session: Session):
    admin = _create_user(session, email="a4@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u4@ifam.edu.br")
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin.id)
    step1 = _add_step(session, process=process, sector=sector, order=1)
    step2 = _add_step(session, process=process, sector=sector, order=2)

    _add_resource(session, step=step1, title="Doc 1", url="https://ex/1.pdf")
    _add_resource(session, step=step1, title="Doc 2", url="https://ex/2.pdf")
    _add_resource(
        session,
        step=step2,
        type_=ResourceType.LEGAL_BASIS,
        title="Lei 8112",
        url=None,
        content="Art. 87...",
    )

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 200
    steps = response.json()["steps"]
    assert len(steps[0]["resources"]) == 2
    titles_step1 = {r["title"] for r in steps[0]["resources"]}
    assert titles_step1 == {"Doc 1", "Doc 2"}

    assert len(steps[1]["resources"]) == 1
    legal = steps[1]["resources"][0]
    assert legal["type"] == "LEGAL_BASIS"
    assert legal["url"] is None
    assert legal["content"] == "Art. 87..."


def test_processo_sem_steps_retorna_lista_vazia(client: TestClient, session: Session):
    admin = _create_user(session, email="a5@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u5@ifam.edu.br")
    process = _create_process(session, created_by=admin.id)

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json()["steps"] == []


# ---------- auth ----------


def test_sem_token_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="a6@ifam.edu.br", role=UserRole.ADMIN)
    process = _create_process(session, created_by=admin.id)

    response = client.get(f"/processes/{process.id}/flow")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_token_invalido_retorna_401(client: TestClient, session: Session):
    admin = _create_user(session, email="a7@ifam.edu.br", role=UserRole.ADMIN)
    process = _create_process(session, created_by=admin.id)

    response = client.get(
        f"/processes/{process.id}/flow",
        headers={"Authorization": "Bearer token-invalido"},
    )

    assert response.status_code == 401


# ---------- acesso por status / ownership ----------

def test_autor_consegue_ver_flow_do_proprio_draft(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a8@ifam.edu.br", role=UserRole.ADMIN)
    process = _create_process(session, created_by=admin.id, status=ProcessStatus.DRAFT)

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(admin))

    assert response.status_code == 200
    assert response.json()["process"]["id"] == str(process.id)


def test_terceiro_recebe_404_no_flow_de_draft(client: TestClient, session: Session):
    admin = _create_user(session, email="a8b@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u8@ifam.edu.br")
    process = _create_process(session, created_by=admin.id, status=ProcessStatus.DRAFT)

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"


def test_autor_consegue_ver_flow_do_proprio_in_review(
    client: TestClient, session: Session
):
    user = _create_user(session, email="u9@ifam.edu.br")
    process = _create_process(
        session, created_by=user.id, status=ProcessStatus.IN_REVIEW
    )

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 200
    assert response.json()["process"]["id"] == str(process.id)


def test_terceiro_recebe_404_no_flow_de_in_review(
    client: TestClient, session: Session
):
    admin = _create_user(session, email="a9@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u9b@ifam.edu.br")
    process = _create_process(
        session, created_by=admin.id, status=ProcessStatus.IN_REVIEW
    )

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 404


def test_flow_de_archived_retorna_404(client: TestClient, session: Session):
    admin = _create_user(session, email="a10@ifam.edu.br", role=UserRole.ADMIN)
    user = _create_user(session, email="u10@ifam.edu.br")
    process = _create_process(
        session, created_by=admin.id, status=ProcessStatus.ARCHIVED
    )

    response = client.get(f"/processes/{process.id}/flow", headers=_auth_headers(user))

    assert response.status_code == 404


def test_flow_de_id_inexistente_retorna_404(client: TestClient, session: Session):
    user = _create_user(session, email="u11@ifam.edu.br")

    response = client.get(f"/processes/{uuid4()}/flow", headers=_auth_headers(user))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROCESS_NOT_FOUND"
