"""Testes do script de seed do super_admin (B-11)."""

from unittest.mock import patch

from sqlmodel import Session, select

from app.core.enums import UserRole, UserStatus
from app.core.security import verify_password
from app.models.user import User

_SEED_ENV = {
    "SEED_SUPER_ADMIN_EMAIL": "superadmin@ifam.edu.br",
    "SEED_SUPER_ADMIN_PASSWORD": "senhaForte123",
    "SEED_SUPER_ADMIN_NAME": "Super Admin",
    "SEED_SUPER_ADMIN_SIAPE": "9999999",
}


def _run_seed(session: Session) -> None:
    from app.scripts.seed_super_admin import seed_super_admin

    with patch("app.scripts.seed_super_admin.engine", session.get_bind()):
        seed_super_admin()


def test_seed_cria_super_admin(session: Session):
    with patch.dict("os.environ", _SEED_ENV):
        _run_seed(session)

    user = session.exec(
        select(User).where(User.email == _SEED_ENV["SEED_SUPER_ADMIN_EMAIL"])
    ).first()

    assert user is not None
    assert user.name == _SEED_ENV["SEED_SUPER_ADMIN_NAME"]
    assert user.siape == _SEED_ENV["SEED_SUPER_ADMIN_SIAPE"]
    assert user.role == UserRole.SUPER_ADMIN
    assert user.status == UserStatus.APPROVED
    assert verify_password(_SEED_ENV["SEED_SUPER_ADMIN_PASSWORD"], user.password_hash)


def test_seed_idempotente_nao_duplica(session: Session):
    with patch.dict("os.environ", _SEED_ENV):
        _run_seed(session)
        _run_seed(session)

    users = session.exec(
        select(User).where(User.email == _SEED_ENV["SEED_SUPER_ADMIN_EMAIL"])
    ).all()

    assert len(users) == 1
