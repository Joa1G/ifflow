"""Router de autenticacao — endpoints /auth/*.

O router NAO contem logica de negocio. Recebe o schema, chama o service,
retorna a response no formato do CONTRACTS.md.
"""

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session

from app.database import get_session
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LoginUserInfo,
    RegisterRequest,
    RegisterResponse,
)
from app.services import auth_service

# Limiter compartilhado: definido no router (onde e usado via decorator) e
# registrado em app.state no main.py para que SlowAPIMiddleware o encontre.
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=201)
def register(
    data: RegisterRequest,
    session: Session = Depends(get_session),
) -> RegisterResponse:
    user = auth_service.register_user(session, data)
    return RegisterResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        status=user.status,
        message="Cadastro recebido. Aguarde aprovacao do administrador.",
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(
    request: Request,  # noqa: ARG001 — exigido pelo decorator @limiter.limit
    data: LoginRequest,
    session: Session = Depends(get_session),
) -> LoginResponse:
    result = auth_service.authenticate_user(session, data.email, data.password)
    return LoginResponse(
        access_token=result.access_token,
        expires_in=result.expires_in,
        user=LoginUserInfo(
            id=result.user.id,
            name=result.user.name,
            email=result.user.email,
            role=result.user.role,
            sector=result.user.sector,
        ),
    )
