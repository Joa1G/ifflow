"""Seed do super_admin inicial.

Executar como:  python -m app.scripts.seed_super_admin

Le credenciais das variaveis de ambiente SEED_SUPER_ADMIN_*.
Idempotente: se o email ja existir no banco, loga e sai sem erro.
NUNCA e chamado automaticamente no startup da aplicacao.
"""

import logging
import os
import sys

from sqlmodel import Session, select

from app.core.enums import UserRole, UserStatus
from app.core.security import hash_password
from app.database import engine
from app.models.user import User

logger = logging.getLogger(__name__)


def _env_or_exit(var: str) -> str:
    value = os.environ.get(var, "").strip()
    if not value:
        logger.error("Variavel de ambiente %s nao definida ou vazia.", var)
        sys.exit(1)
    return value


def seed_super_admin() -> None:
    email = _env_or_exit("SEED_SUPER_ADMIN_EMAIL")
    password = _env_or_exit("SEED_SUPER_ADMIN_PASSWORD")
    name = _env_or_exit("SEED_SUPER_ADMIN_NAME")
    siape = _env_or_exit("SEED_SUPER_ADMIN_SIAPE")

    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == email)).first()

        if existing is not None:
            logger.info("super_admin ja existe (%s). Nenhuma acao tomada.", email)
            return

        user = User(
            name=name,
            email=email,
            siape=siape,
            sector="PROAD",
            password_hash=hash_password(password),
            role=UserRole.SUPER_ADMIN,
            status=UserStatus.APPROVED,
        )
        session.add(user)
        session.commit()
        logger.info("super_admin criado com sucesso (%s).", email)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    seed_super_admin()
