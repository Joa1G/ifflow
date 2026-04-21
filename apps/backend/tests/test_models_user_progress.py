"""Testes do model UserProgress — B-22.

Rodam sobre o SQLite in-memory da fixture `session` (conftest.py). O JSONB
do Postgres degrada para JSON em SQLite via `with_variant`, entao
persistencia e leitura do dict funcionam normalmente na suite.

Dois pontos do banco NAO sao testados aqui e sao intencionais:

1. Cascade delete real (ON DELETE CASCADE) exige PRAGMA foreign_keys=ON
   em SQLite ou rodar contra Postgres. Em vez disso, validamos o schema
   da coluna — `foreign_keys[0].ondelete == "CASCADE"` garante que a
   DDL emitida para o Postgres em producao tem o cascade certo.

2. Unique constraint SIM e testada: IntegrityError no commit e o mesmo
   comportamento em SQLite e Postgres.
"""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app.core.enums import ProcessCategory, ProcessStatus, UserRole, UserStatus
from app.core.security import hash_password
from app.models.process import Process
from app.models.user import User
from app.models.user_progress import UserProgress


def _create_user(session: Session, *, email: str = "user.progress@ifam.edu.br") -> User:
    user = User(
        name="Usuario Progresso",
        email=email,
        siape="2222222",
        sector="PROAD",
        password_hash=hash_password("senhaForte123"),
        role=UserRole.USER,
        status=UserStatus.APPROVED,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_process(
    session: Session, *, created_by: User, title: str = "Processo Piloto"
) -> Process:
    process = Process(
        title=title,
        short_description="descricao curta",
        full_description="descricao longa",
        category=ProcessCategory.RH,
        estimated_time="30 dias",
        requirements=[],
        status=ProcessStatus.PUBLISHED,
        created_by=created_by.id,
    )
    session.add(process)
    session.commit()
    session.refresh(process)
    return process


# ---------- Defaults e roundtrip ----------


def test_user_progress_cria_com_defaults(session: Session):
    user = _create_user(session)
    process = _create_process(session, created_by=user)

    progress = UserProgress(user_id=user.id, process_id=process.id)
    session.add(progress)
    session.commit()
    session.refresh(progress)

    assert progress.id is not None
    assert progress.step_statuses == {}
    assert progress.last_updated is not None
    assert progress.user_id == user.id
    assert progress.process_id == process.id


def test_user_progress_persiste_step_statuses_como_dict(session: Session):
    user = _create_user(session)
    process = _create_process(session, created_by=user)

    progress = UserProgress(
        user_id=user.id,
        process_id=process.id,
        step_statuses={
            "11111111-1111-1111-1111-111111111111": "COMPLETED",
            "22222222-2222-2222-2222-222222222222": "IN_PROGRESS",
            "33333333-3333-3333-3333-333333333333": "PENDING",
        },
    )
    session.add(progress)
    session.commit()

    # Forca roundtrip real no banco em vez de ler do cache em memoria —
    # e o que valida que o JSON/JSONB foi serializado e deserializado
    # corretamente (chaves UUID como string, valores como string).
    session.expire_all()
    found = session.get(UserProgress, progress.id)
    assert found is not None
    assert found.step_statuses == {
        "11111111-1111-1111-1111-111111111111": "COMPLETED",
        "22222222-2222-2222-2222-222222222222": "IN_PROGRESS",
        "33333333-3333-3333-3333-333333333333": "PENDING",
    }


def test_user_progress_atualiza_dict_e_persiste(session: Session):
    user = _create_user(session)
    process = _create_process(session, created_by=user)

    progress = UserProgress(
        user_id=user.id,
        process_id=process.id,
        step_statuses={"step-a": "PENDING"},
    )
    session.add(progress)
    session.commit()
    progress_id = progress.id

    # Substitui o dict inteiro (e o padrao que a B-24 vai usar — atualizar
    # uma chave, reatribuir, commitar; evita depender de mutation tracking
    # de JSONB no SQLAlchemy).
    progress.step_statuses = {"step-a": "COMPLETED", "step-b": "IN_PROGRESS"}
    session.add(progress)
    session.commit()

    session.expire_all()
    found = session.get(UserProgress, progress_id)
    assert found is not None
    assert found.step_statuses == {
        "step-a": "COMPLETED",
        "step-b": "IN_PROGRESS",
    }


# ---------- Unique constraint ----------


def test_user_progress_unique_user_process_bloqueia_duplicata(session: Session):
    user = _create_user(session)
    process = _create_process(session, created_by=user)

    session.add(UserProgress(user_id=user.id, process_id=process.id))
    session.commit()

    duplicado = UserProgress(user_id=user.id, process_id=process.id)
    session.add(duplicado)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_user_progress_permite_varios_usuarios_no_mesmo_processo(session: Session):
    user_a = _create_user(session, email="a@ifam.edu.br")
    user_b = _create_user(session, email="b@ifam.edu.br")
    process = _create_process(session, created_by=user_a)

    session.add(UserProgress(user_id=user_a.id, process_id=process.id))
    session.add(UserProgress(user_id=user_b.id, process_id=process.id))
    session.commit()  # nao deve levantar — tuplas (user, process) distintas


def test_user_progress_permite_mesmo_usuario_em_varios_processos(session: Session):
    user = _create_user(session)
    p1 = _create_process(session, created_by=user, title="Processo 1")
    p2 = _create_process(session, created_by=user, title="Processo 2")

    session.add(UserProgress(user_id=user.id, process_id=p1.id))
    session.add(UserProgress(user_id=user.id, process_id=p2.id))
    session.commit()


# ---------- Schema da tabela (checklist de segurança) ----------


def test_user_progress_fks_configuradas_com_cascade():
    """FK contract: user_id e process_id precisam emitir ON DELETE CASCADE.

    Checamos na DDL da coluna porque o SQLite dos testes ignora o cascade
    sem PRAGMA foreign_keys=ON — a integridade real acontece no Postgres.
    """
    user_fk = next(iter(UserProgress.__table__.columns["user_id"].foreign_keys))
    assert user_fk.ondelete == "CASCADE"

    process_fk = next(iter(UserProgress.__table__.columns["process_id"].foreign_keys))
    assert process_fk.ondelete == "CASCADE"


def test_user_progress_colunas_obrigatorias_sao_not_null():
    columns = UserProgress.__table__.columns
    assert columns["user_id"].nullable is False
    assert columns["process_id"].nullable is False
    assert columns["step_statuses"].nullable is False
    assert columns["last_updated"].nullable is False
