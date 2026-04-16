"""Testes do model User — B-03.

Usa o banco de teste real (SQLite in-memory) para validar que o model persiste,
busca e respeita constraints corretamente.
"""

import pytest
from sqlalchemy import create_engine
from sqlmodel import Session, SQLModel, select

from app.core.enums import UserRole, UserStatus
from app.models.user import User


@pytest.fixture()
def session():
    """Sessao em SQLite in-memory, isolada por teste."""
    engine = create_engine("sqlite://", echo=False)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _make_user(**overrides) -> User:
    defaults = {
        "name": "Joao da Silva",
        "email": "joao.silva@ifam.edu.br",
        "siape": "1234567",
        "sector": "PROAD",
        "password_hash": "$argon2id$fake-hash-for-test",
    }
    defaults.update(overrides)
    return User(**defaults)


class TestUserCreate:
    def test_create_user_with_defaults(self, session: Session):
        user = _make_user()
        session.add(user)
        session.commit()
        session.refresh(user)

        assert user.id is not None
        assert user.role == UserRole.USER
        assert user.status == UserStatus.PENDING
        assert user.created_at is not None
        assert user.updated_at is not None

    def test_password_hash_is_not_null(self, session: Session):
        """password_hash e NOT NULL — model exige o campo."""
        user = _make_user()
        session.add(user)
        session.commit()
        session.refresh(user)
        assert user.password_hash == "$argon2id$fake-hash-for-test"


class TestUserQuery:
    def test_find_by_email(self, session: Session):
        user = _make_user()
        session.add(user)
        session.commit()

        found = session.exec(
            select(User).where(User.email == "joao.silva@ifam.edu.br")
        ).first()
        assert found is not None
        assert found.id == user.id

    def test_find_by_email_not_found(self, session: Session):
        found = session.exec(
            select(User).where(User.email == "naoexiste@ifam.edu.br")
        ).first()
        assert found is None


class TestUserUniqueEmail:
    def test_duplicate_email_raises(self, session: Session):
        session.add(_make_user(email="dup@ifam.edu.br"))
        session.commit()

        session.add(_make_user(email="dup@ifam.edu.br", siape="9999999"))
        with pytest.raises(Exception):
            session.commit()
