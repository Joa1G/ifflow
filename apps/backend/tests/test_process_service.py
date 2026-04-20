"""Testes do process_service (B-15).

Cobre as 5 funcoes publicas do modulo (create/update/archive/list/get).

Foco:
- Regras de negocio do service, nao do router (router vem em B-16).
- Transicoes de estado barradas (editar ARCHIVED, arquivar duas vezes).
- created_by e sempre o argumento passado — nunca um valor "vazado" do schema.
- Listagem admin inclui DRAFT/IN_REVIEW/ARCHIVED (diferente da listagem
  publica de B-19, que filtra so PUBLISHED).
"""

from uuid import uuid4

import pytest
from sqlmodel import Session

from app.core.enums import ProcessCategory, ProcessStatus, UserRole, UserStatus
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.process import ProcessCreate, ProcessUpdate
from app.services import process_service


def _create_admin(session: Session, *, email: str = "admin.proc@ifam.edu.br") -> User:
    user = User(
        name="Admin Proc",
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


def _process_payload(**overrides) -> ProcessCreate:
    defaults = dict(
        title="Solicitacao de Capacitacao",
        short_description="Curta",
        full_description="Longa",
        category=ProcessCategory.RH,
        estimated_time="30 a 45 dias",
        requirements=["Ser servidor efetivo"],
    )
    defaults.update(overrides)
    return ProcessCreate(**defaults)


# ---------- create_process ----------


def test_create_process_nasce_em_draft(session: Session):
    admin = _create_admin(session)

    process = process_service.create_process(
        session, _process_payload(), created_by=admin.id
    )

    assert process.status == ProcessStatus.DRAFT
    assert process.access_count == 0
    assert process.created_by == admin.id
    assert process.approved_by is None
    assert process.requirements == ["Ser servidor efetivo"]


def test_create_process_persiste_requirements_vazios_por_default(session: Session):
    admin = _create_admin(session)
    payload = _process_payload(requirements=[])

    process = process_service.create_process(session, payload, created_by=admin.id)

    assert process.requirements == []


def test_create_process_created_by_nao_vem_do_schema(session: Session):
    """Defesa contra mass assignment: o schema nem tem o campo, o service ignora.

    Mesmo que o cliente consiga smuggler `created_by` via JSON arbitrario, o
    service so aceita o UUID passado como argumento — entao o router pode
    confiar em vir do JWT. Este teste documenta essa contratacao.
    """
    admin = _create_admin(session)
    payload = _process_payload()

    process = process_service.create_process(session, payload, created_by=admin.id)

    assert process.created_by == admin.id


# ---------- get_process_admin ----------


def test_get_process_admin_retorna_processo_existente(session: Session):
    admin = _create_admin(session)
    created = process_service.create_process(
        session, _process_payload(), created_by=admin.id
    )

    fetched = process_service.get_process_admin(session, created.id)

    assert fetched.id == created.id


def test_get_process_admin_levanta_not_found_se_inexistente(session: Session):
    with pytest.raises(NotFoundError) as exc:
        process_service.get_process_admin(session, uuid4())

    assert exc.value.code == "PROCESS_NOT_FOUND"


# ---------- list_processes_admin ----------


def test_list_processes_admin_inclui_todos_os_status(session: Session):
    admin = _create_admin(session)
    draft = process_service.create_process(
        session, _process_payload(title="Draft"), created_by=admin.id
    )
    archived_src = process_service.create_process(
        session, _process_payload(title="ArchivedSrc"), created_by=admin.id
    )
    archived = process_service.archive_process(session, archived_src.id)

    results = process_service.list_processes_admin(session)

    ids = {p.id for p in results}
    assert draft.id in ids
    assert archived.id in ids
    assert len(results) == 2


def test_list_processes_admin_filtra_por_status(session: Session):
    admin = _create_admin(session)
    process_service.create_process(
        session, _process_payload(title="A"), created_by=admin.id
    )
    second = process_service.create_process(
        session, _process_payload(title="B"), created_by=admin.id
    )
    process_service.archive_process(session, second.id)

    archived = process_service.list_processes_admin(
        session, status=ProcessStatus.ARCHIVED
    )

    assert len(archived) == 1
    assert archived[0].id == second.id


def test_list_processes_admin_filtra_por_categoria(session: Session):
    admin = _create_admin(session)
    process_service.create_process(
        session,
        _process_payload(title="RH", category=ProcessCategory.RH),
        created_by=admin.id,
    )
    process_service.create_process(
        session,
        _process_payload(title="TI", category=ProcessCategory.TECNOLOGIA),
        created_by=admin.id,
    )

    ti = process_service.list_processes_admin(
        session, category=ProcessCategory.TECNOLOGIA
    )

    assert len(ti) == 1
    assert ti[0].title == "TI"


# ---------- update_process ----------


def test_update_process_atualiza_campos_enviados(session: Session):
    admin = _create_admin(session)
    created = process_service.create_process(
        session, _process_payload(), created_by=admin.id
    )

    updated = process_service.update_process(
        session,
        created.id,
        ProcessUpdate(title="Novo titulo", estimated_time="10 dias"),
    )

    assert updated.title == "Novo titulo"
    assert updated.estimated_time == "10 dias"
    # Campos nao enviados nao sao alterados.
    assert updated.short_description == created.short_description
    assert updated.category == created.category


def test_update_process_bloqueia_se_archived(session: Session):
    admin = _create_admin(session)
    created = process_service.create_process(
        session, _process_payload(), created_by=admin.id
    )
    process_service.archive_process(session, created.id)

    with pytest.raises(ConflictError) as exc:
        process_service.update_process(
            session, created.id, ProcessUpdate(title="Tarde demais")
        )

    assert exc.value.code == "PROCESS_NOT_EDITABLE"


def test_update_process_not_found(session: Session):
    with pytest.raises(NotFoundError) as exc:
        process_service.update_process(session, uuid4(), ProcessUpdate(title="Foo"))

    assert exc.value.code == "PROCESS_NOT_FOUND"


def test_update_process_substitui_requirements_por_lista_enviada(session: Session):
    admin = _create_admin(session)
    created = process_service.create_process(
        session,
        _process_payload(requirements=["Requisito 1"]),
        created_by=admin.id,
    )

    updated = process_service.update_process(
        session,
        created.id,
        ProcessUpdate(requirements=["Requisito A", "Requisito B"]),
    )

    assert updated.requirements == ["Requisito A", "Requisito B"]


# ---------- archive_process ----------


def test_archive_process_muda_status_para_archived(session: Session):
    admin = _create_admin(session)
    created = process_service.create_process(
        session, _process_payload(), created_by=admin.id
    )

    archived = process_service.archive_process(session, created.id)

    assert archived.status == ProcessStatus.ARCHIVED


def test_archive_process_levanta_se_ja_arquivado(session: Session):
    admin = _create_admin(session)
    created = process_service.create_process(
        session, _process_payload(), created_by=admin.id
    )
    process_service.archive_process(session, created.id)

    with pytest.raises(ConflictError) as exc:
        process_service.archive_process(session, created.id)

    assert exc.value.code == "PROCESS_ALREADY_ARCHIVED"


def test_archive_process_not_found(session: Session):
    with pytest.raises(NotFoundError) as exc:
        process_service.archive_process(session, uuid4())

    assert exc.value.code == "PROCESS_NOT_FOUND"


# ---------- schema-level guards ----------


def test_process_create_rejeita_campos_extras_como_created_by(session: Session):
    """Garantia pydantic: mesmo que o cliente mande `created_by` no JSON, o
    schema filtra. Isso e complementar ao service, que ja ignora — mas
    validar aqui e o que protege no nivel do router.
    """
    # Pydantic por padrao ignora campos extras (Config.extra="ignore"), entao
    # a construcao nao levanta; o importante e que o objeto resultante NAO
    # carrega o campo smuggled.
    data = ProcessCreate.model_validate(
        {
            "title": "X",
            "short_description": "Y",
            "full_description": "Z",
            "category": "RH",
            "estimated_time": "1 dia",
            "requirements": [],
            "created_by": str(uuid4()),  # nao deveria aparecer no objeto
            "status": "PUBLISHED",  # idem
            "access_count": 999,  # idem
        }
    )

    assert not hasattr(data, "created_by")
    assert not hasattr(data, "status")
    assert not hasattr(data, "access_count")
