"""Testes do service de registro — B-05.

Testa a logica de negocio isolada (sem HTTP). Usa SQLite in-memory.
"""

import pytest
from sqlalchemy import create_engine
from sqlmodel import Session, SQLModel

from app.core.enums import UserRole, UserStatus
from app.core.exceptions import ConflictError
from app.schemas.auth import RegisterRequest
from app.services.auth_service import register_user


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", echo=False)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _valid_register_data(**overrides) -> RegisterRequest:
    defaults = {
        "name": "Joao da Silva",
        "email": "joao.silva@ifam.edu.br",
        "siape": "1234567",
        "sector": "PROAD",
        "password": "senhasegura123",
        "password_confirmation": "senhasegura123",
    }
    defaults.update(overrides)
    return RegisterRequest(**defaults)


class TestRegisterUser:
    def test_creates_user_with_pending_status(self, session: Session):
        user = register_user(session, _valid_register_data())
        assert user.id is not None
        assert user.status == UserStatus.PENDING
        assert user.role == UserRole.USER

    def test_duplicate_email_raises_conflict(self, session: Session):
        register_user(session, _valid_register_data())
        with pytest.raises(ConflictError) as exc_info:
            register_user(session, _valid_register_data(
                name="Outro Nome",
                siape="9999999",
            ))
        assert exc_info.value.code == "EMAIL_ALREADY_EXISTS"

    def test_password_stored_as_hash(self, session: Session):
        user = register_user(session, _valid_register_data())
        assert user.password_hash != "senhasegura123"
        assert user.password_hash.startswith("$argon2")
