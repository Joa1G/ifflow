"""Router de autenticacao — endpoints /auth/*.

O router NAO contem logica de negocio. Recebe o schema, chama o service,
retorna a response no formato do CONTRACTS.md.
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.schemas.auth import RegisterRequest, RegisterResponse
from app.services import auth_service

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
