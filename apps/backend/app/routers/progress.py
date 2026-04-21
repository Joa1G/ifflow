"""Router de UserProgress — endpoints /progress/*.

Ambos os endpoints exigem autenticacao e usam `user_id` SEMPRE do JWT
(via `get_current_user_payload`). Nao ha forma de um cliente especificar
user_id no body/query — e isso, combinado com o unique constraint
(user_id, process_id) na tabela, que garante o isolamento entre usuarios
(checklist de seguranca de IDOR do CONTRACTS.md).
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.dependencies import get_current_user_payload
from app.core.security import TokenPayload
from app.database import get_session
from app.schemas.progress import StepStatusUpdate, UserProgressRead
from app.services import progress_service

router = APIRouter(prefix="/progress", tags=["progress"])


def _to_read(progress) -> UserProgressRead:
    """Adapta o model UserProgress para o schema de saida."""
    return UserProgressRead(
        id=progress.id,
        process_id=progress.process_id,
        step_statuses=progress.step_statuses,
        last_updated=progress.last_updated,
    )


@router.get("/{process_id}", response_model=UserProgressRead)
def get_progress(
    process_id: UUID,
    session: Session = Depends(get_session),
    auth: TokenPayload = Depends(get_current_user_payload),
) -> UserProgressRead:
    """Retorna (ou cria) o progresso do usuario autenticado no processo."""
    progress = progress_service.get_or_create_progress(
        session, user_id=auth.user_id, process_id=process_id
    )
    return _to_read(progress)


@router.patch("/{process_id}/steps/{step_id}", response_model=UserProgressRead)
def update_progress_step(
    process_id: UUID,
    step_id: UUID,
    body: StepStatusUpdate,
    session: Session = Depends(get_session),
    auth: TokenPayload = Depends(get_current_user_payload),
) -> UserProgressRead:
    """Atualiza o status de uma etapa no progresso pessoal."""
    progress = progress_service.update_step_status(
        session,
        user_id=auth.user_id,
        process_id=process_id,
        step_id=step_id,
        status=body.status,
    )
    return _to_read(progress)
