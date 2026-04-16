"""Service de autenticacao — logica de negocio para registro e login.

Services NAO conhecem FastAPI (sem HTTPException, Depends). Levantam excecoes
de app.core.exceptions que os routers traduzem para HTTP.
"""

from sqlmodel import Session, select

from app.core.enums import UserRole, UserStatus
from app.core.exceptions import ConflictError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.auth import RegisterRequest


def register_user(session: Session, data: RegisterRequest) -> User:
    """Cria usuario em status PENDING. Nao faz login automatico."""
    existing = session.exec(
        select(User).where(User.email == data.email)
    ).first()
    if existing:
        raise ConflictError(
            "Este email ja esta cadastrado.",
            code="EMAIL_ALREADY_EXISTS",
        )

    user = User(
        name=data.name,
        email=data.email,
        siape=data.siape,
        sector=data.sector,
        password_hash=hash_password(data.password),
        role=UserRole.USER,
        status=UserStatus.PENDING,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
