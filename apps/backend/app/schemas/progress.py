"""Schemas de UserProgress — B-23 e B-24.

O contrato de saida (UserProgressRead) espelha exatamente o formato do
CONTRACTS.md para o endpoint GET /progress/{process_id}. `user_id` NAO
aparece na resposta porque e sempre o do autenticado — o frontend ja sabe
quem esta logado, expor o id aqui seria redundante e so ajudaria um
eventual atacante a mapear progressos alheios.

`step_statuses` vai pro JSON como dict[str, StepStatus] — Pydantic
serializa os valores do enum como string, mantendo "PENDING"/
"IN_PROGRESS"/"COMPLETED" na resposta.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.enums import StepStatus


class UserProgressRead(BaseModel):
    """Retorno dos endpoints /progress/* (GET e PATCH)."""

    id: UUID
    process_id: UUID
    step_statuses: dict[str, StepStatus]
    last_updated: datetime


class StepStatusUpdate(BaseModel):
    """Body do PATCH /progress/{process_id}/steps/{step_id}.

    `extra="forbid"` impede que o cliente mande `user_id`, `process_id` ou
    outros campos tentando mass-assignment — o unico valor aceito e o
    proprio status novo.
    """

    model_config = ConfigDict(extra="forbid")

    status: StepStatus
