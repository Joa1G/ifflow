"""Router de Sector — endpoint publico-dentro-do-portal /sectors.

Exige autenticacao mas nao restringe por role: qualquer USER+ pode listar.
A lista e usada pela UI (fluxograma, editor admin) e nao e considerada
sensivel — e informacao institucional visivel no organograma do IFAM.

A gestao do catalogo (inserir/editar/remover setores) e feita via seed
(`app.scripts.seed_sectors`), nao por endpoint — e por isso que aqui so
existe o GET.
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.dependencies import get_current_user_payload
from app.core.security import TokenPayload
from app.database import get_session
from app.schemas.sector import SectorRead, SectorsListResponse
from app.services import sector_service

router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("", response_model=SectorsListResponse)
def list_sectors(
    _auth: TokenPayload = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> SectorsListResponse:
    sectors = sector_service.list_sectors(session)
    return SectorsListResponse(
        sectors=[SectorRead(id=s.id, name=s.name, acronym=s.acronym) for s in sectors],
        total=len(sectors),
    )
