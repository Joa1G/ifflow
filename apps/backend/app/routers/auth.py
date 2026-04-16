"""Router de autenticacao — endpoints /auth/*.

O router NAO contem logica de negocio. Recebe o schema, chama o service,
retorna a response no formato do CONTRACTS.md.
"""

from fastapi import APIRouter, Depends, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session

from app.core.dependencies import get_current_user
from app.database import get_session
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    LoginUserInfo,
    RegisterRequest,
    RegisterResponse,
)
from app.schemas.user import UserMe
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


@router.get("/me", response_model=UserMe)
def me(user: User = Depends(get_current_user)) -> UserMe:
    return UserMe(
        id=user.id,
        name=user.name,
        email=user.email,
        siape=user.siape,
        sector=user.sector,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
    )


@router.post("/logout", status_code=204, response_class=Response)
def logout(_user: User = Depends(get_current_user)) -> Response:
    # No MVP nao ha blacklist de JWT (ADR-002): o token continua valido ate
    # expirar. Logout e responsabilidade do frontend, que descarta o token
    # do storage. Esse endpoint existe para padronizar o fluxo e exigir
    # autenticacao — evita ruido de chamadas anonimas.
    return Response(status_code=204)
