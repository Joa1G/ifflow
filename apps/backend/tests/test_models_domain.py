"""Testes dos models de dominio (B-14): Sector, Process, FlowStep, StepResource.

Cobrem CRUD basico, persistencia dos campos nao-triviais (enum, JSON array,
FKs) e cascade delete via ORM:

- Process deletado -> suas FlowSteps e StepResources sao apagadas.
- FlowStep deletada -> seus StepResources sao apagados.

Notas:
- Rodamos sobre SQLite in-memory (conftest.py). O ondelete=CASCADE do banco
  so atua em Postgres ou sob PRAGMA foreign_keys=ON em SQLite — aqui o
  cascade vem do `Relationship(cascade="all, delete-orphan")` configurado
  nos models, e isso e o que queremos validar.
- Unicidade de `acronym` em Sector e verificada expondo a IntegrityError.
"""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.enums import (
    ProcessCategory,
    ProcessStatus,
    ResourceType,
    UserRole,
    UserStatus,
)
from app.core.security import hash_password
from app.models.flow_step import FlowStep
from app.models.process import Process
from app.models.sector import Sector
from app.models.step_resource import StepResource
from app.models.user import User


def _create_admin(session: Session, *, email: str = "admin.models@ifam.edu.br") -> User:
    user = User(
        name="Admin Models",
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


def _create_sector(session: Session, *, acronym: str = "PROAD") -> Sector:
    sector = Sector(name=f"Setor {acronym}", acronym=acronym)
    session.add(sector)
    session.commit()
    session.refresh(sector)
    return sector


def _create_process(
    session: Session,
    *,
    title: str = "Solicitacao de Capacitacao",
    created_by: User,
    requirements: list[str] | None = None,
    status: ProcessStatus = ProcessStatus.DRAFT,
) -> Process:
    process = Process(
        title=title,
        short_description="Processo para pedido de afastamento para estudos.",
        full_description="Descricao longa do processo...",
        category=ProcessCategory.RH,
        estimated_time="30 a 45 dias",
        requirements=requirements if requirements is not None else [],
        status=status,
        created_by=created_by.id,
    )
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


# ---------- Sector ----------


def test_sector_crud_basico(session: Session):
    sector = _create_sector(session, acronym="DGP")

    found = session.get(Sector, sector.id)
    assert found is not None
    assert found.acronym == "DGP"
    assert found.name == "Setor DGP"


def test_sector_acronym_unique(session: Session):
    _create_sector(session, acronym="PROAD")

    duplicado = Sector(name="Outro PROAD", acronym="PROAD")
    session.add(duplicado)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


# ---------- Process ----------


def test_process_cria_com_defaults_corretos(session: Session):
    admin = _create_admin(session)
    process = _create_process(session, created_by=admin)

    found = session.get(Process, process.id)
    assert found is not None
    # Defaults do model — confirmamos que o DRAFT inicial + access_count zerado
    # + requirements vazia vieram da camada de model (valem pro service depois).
    assert found.status == ProcessStatus.DRAFT
    assert found.access_count == 0
    assert found.requirements == []
    assert found.approved_by is None
    assert found.category == ProcessCategory.RH
    assert found.created_by == admin.id


def test_process_persiste_requirements_como_lista_de_strings(session: Session):
    admin = _create_admin(session)
    process = _create_process(
        session,
        created_by=admin,
        requirements=[
            "Ser servidor efetivo",
            "Ter chefia imediata",
            "Possuir plano de trabalho aprovado",
        ],
    )

    # Forca novo round-trip no banco para garantir que o JSON foi deserializado
    # corretamente (e nao apenas cached em memoria pelo SQLAlchemy).
    session.expire_all()
    found = session.get(Process, process.id)
    assert found is not None
    assert found.requirements == [
        "Ser servidor efetivo",
        "Ter chefia imediata",
        "Possuir plano de trabalho aprovado",
    ]


def test_process_filtro_por_status_funciona(session: Session):
    admin = _create_admin(session)
    _create_process(session, title="Rascunho", created_by=admin)
    _create_process(
        session,
        title="Publicado",
        created_by=admin,
        status=ProcessStatus.PUBLISHED,
    )

    published = session.exec(
        select(Process).where(Process.status == ProcessStatus.PUBLISHED)
    ).all()

    assert len(published) == 1
    assert published[0].title == "Publicado"


# ---------- FlowStep ----------


def test_flow_step_cria_com_fks_e_ordering(session: Session):
    admin = _create_admin(session)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin)

    step1 = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=1,
        title="Preencher formulario",
        description="Detalhes da etapa 1",
        responsible="Solicitante",
        estimated_time="1 dia",
    )
    step2 = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=2,
        title="Aprovacao da chefia",
        description="Detalhes da etapa 2",
        responsible="Chefia",
        estimated_time="2 dias",
    )
    session.add_all([step1, step2])
    session.commit()

    session.refresh(process)
    assert len(process.steps) == 2
    ordered = sorted(process.steps, key=lambda s: s.order_index)
    assert [s.title for s in ordered] == ["Preencher formulario", "Aprovacao da chefia"]
    assert ordered[0].sector.acronym == "PROAD"


# ---------- StepResource ----------


def test_step_resource_aceita_url_ou_content(session: Session):
    admin = _create_admin(session)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin)
    step = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=1,
        title="Etapa com recursos",
        description="...",
        responsible="Solicitante",
        estimated_time="1 dia",
    )
    session.add(step)
    session.commit()
    session.refresh(step)

    # DOCUMENT so com URL (sem content).
    doc = StepResource(
        step_id=step.id,
        type=ResourceType.DOCUMENT,
        title="Formulario de Solicitacao",
        url="https://example.com/form.pdf",
    )
    # LEGAL_BASIS so com content (sem url).
    lei = StepResource(
        step_id=step.id,
        type=ResourceType.LEGAL_BASIS,
        title="Lei 8.112/1990, Art. 87",
        content="Art. 87. O servidor podera ausentar-se do servico...",
    )
    session.add_all([doc, lei])
    session.commit()

    session.refresh(step)
    types = {r.type for r in step.resources}
    assert types == {ResourceType.DOCUMENT, ResourceType.LEGAL_BASIS}

    fetched_doc = next(r for r in step.resources if r.type == ResourceType.DOCUMENT)
    assert fetched_doc.url == "https://example.com/form.pdf"
    assert fetched_doc.content is None

    fetched_lei = next(r for r in step.resources if r.type == ResourceType.LEGAL_BASIS)
    assert fetched_lei.url is None
    assert fetched_lei.content is not None
    assert "Art. 87" in fetched_lei.content


# ---------- Cascade delete ----------


def test_cascade_delete_process_remove_steps_e_resources(session: Session):
    admin = _create_admin(session)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin)

    step = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=1,
        title="Etapa",
        description="...",
        responsible="Solicitante",
        estimated_time="1 dia",
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    resource = StepResource(
        step_id=step.id,
        type=ResourceType.LINK,
        title="Link externo",
        url="https://example.com",
    )
    session.add(resource)
    session.commit()

    step_id = step.id
    resource_id = resource.id

    session.delete(process)
    session.commit()

    assert session.get(Process, process.id) is None
    assert session.get(FlowStep, step_id) is None
    assert session.get(StepResource, resource_id) is None


def test_cascade_delete_flow_step_remove_apenas_seus_resources(session: Session):
    admin = _create_admin(session)
    sector = _create_sector(session)
    process = _create_process(session, created_by=admin)

    step_a = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=1,
        title="A",
        description="...",
        responsible="X",
        estimated_time="1d",
    )
    step_b = FlowStep(
        process_id=process.id,
        sector_id=sector.id,
        order_index=2,
        title="B",
        description="...",
        responsible="Y",
        estimated_time="1d",
    )
    session.add_all([step_a, step_b])
    session.commit()
    session.refresh(step_a)
    session.refresh(step_b)

    resource_a = StepResource(
        step_id=step_a.id, type=ResourceType.LINK, title="A1", url="https://a.example"
    )
    resource_b = StepResource(
        step_id=step_b.id, type=ResourceType.LINK, title="B1", url="https://b.example"
    )
    session.add_all([resource_a, resource_b])
    session.commit()

    resource_a_id = resource_a.id
    resource_b_id = resource_b.id

    session.delete(step_a)
    session.commit()

    assert session.get(FlowStep, step_a.id) is None
    assert session.get(StepResource, resource_a_id) is None
    # step_b e seu resource devem continuar intactos.
    assert session.get(FlowStep, step_b.id) is not None
    assert session.get(StepResource, resource_b_id) is not None
    # E o processo pai tambem.
    assert session.get(Process, process.id) is not None


def test_process_created_by_e_nao_nulo_e_approved_by_e_nulavel():
    """Contrato de schema: created_by NOT NULL, approved_by NULLABLE.

    SQLModel com `table=True` pula a validacao Pydantic, entao nao da pra
    testar a rejeicao de None em tempo de construcao. O que realmente
    importa e o schema da tabela — validamos direto na coluna.
    """
    assert Process.__table__.columns["created_by"].nullable is False
    assert Process.__table__.columns["approved_by"].nullable is True
