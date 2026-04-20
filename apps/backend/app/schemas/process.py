"""Schemas de Process, FlowStep e StepResource.

Separacao intencional entre "input", "admin view" e "public view":
- Input (`ProcessCreate`, `ProcessUpdate`) nao aceita `created_by`, `approved_by`,
  `access_count`, nem `status`. Esses campos sao escritos pelo service com base
  no usuario autenticado e nas transicoes de estado, nunca confiando no body —
  defesa contra mass assignment (ADR-005).
- Admin view (`ProcessAdminView`) expoe tudo, incluindo DRAFT/IN_REVIEW/ARCHIVED
  e metadados de auditoria (created_by/approved_by/updated_at).
- Public view (`ProcessPublicList`, `ProcessPublicDetail`, `ProcessFullFlow`)
  mostra apenas o que um servidor comum precisa ver — sem status, sem quem
  criou, sem tempos de moderacao.

`step_count` e um campo computado — nao existe no model, e calculado pelo
service ao serializar para a listagem publica.

`requirements` tem default `[]` para permitir criar processos sem pre-requisitos
listados (e eles podem ser adicionados depois via PATCH).
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.enums import ProcessCategory, ProcessStatus, ResourceType


class ProcessCreate(BaseModel):
    """Input de criacao — admin preenche manualmente no editor.

    `status` nao aceita valor do cliente: todo processo novo comeca em DRAFT
    (decidido pelo service). O mesmo vale para `access_count` (sempre 0) e para
    `created_by`/`approved_by` (gerenciados pelo service a partir do JWT).
    """

    title: str = Field(min_length=1, max_length=255)
    short_description: str = Field(min_length=1, max_length=500)
    full_description: str = Field(min_length=1)
    category: ProcessCategory
    estimated_time: str = Field(min_length=1, max_length=100)
    requirements: list[str] = Field(default_factory=list)


class ProcessUpdate(BaseModel):
    """Input de edicao — todos os campos opcionais (PATCH semantics).

    Mesmas regras de seguranca do Create: status e IDs de auditoria nao sao
    editaveis aqui (existem endpoints dedicados de submit-for-review/approve
    para transicionar o status).
    """

    title: str | None = Field(default=None, min_length=1, max_length=255)
    short_description: str | None = Field(default=None, min_length=1, max_length=500)
    full_description: str | None = Field(default=None, min_length=1)
    category: ProcessCategory | None = None
    estimated_time: str | None = Field(default=None, min_length=1, max_length=100)
    requirements: list[str] | None = None


class ProcessAdminView(BaseModel):
    """Visao admin — usada nos endpoints /admin/processes e derivados."""

    id: UUID
    title: str
    short_description: str
    full_description: str
    category: ProcessCategory
    estimated_time: str
    requirements: list[str]
    status: ProcessStatus
    access_count: int
    created_by: UUID
    approved_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProcessPublicList(BaseModel):
    """Item de lista no GET /processes publico.

    Nao expoe full_description (evita payload grande na listagem) nem
    requirements. step_count e computado a partir do relacionamento.
    """

    id: UUID
    title: str
    short_description: str
    category: ProcessCategory
    estimated_time: str
    step_count: int
    access_count: int


class ProcessPublicDetail(BaseModel):
    """Detalhe basico publico — GET /processes/{id}, SEM o fluxo.

    O fluxo completo vem em /processes/{id}/flow e exige autenticacao (ADR).
    """

    id: UUID
    title: str
    short_description: str
    full_description: str
    category: ProcessCategory
    estimated_time: str
    requirements: list[str]
    step_count: int
    access_count: int


class SectorRef(BaseModel):
    """Referencia embutida de Sector dentro do fluxo publico."""

    id: UUID
    name: str
    acronym: str


class StepResourceRead(BaseModel):
    """Recurso anexado a uma etapa. `url` e `content` sao mutuamente opcionais
    — ver regras no model StepResource."""

    id: UUID
    type: ResourceType
    title: str
    url: str | None
    content: str | None


class FlowStepRead(BaseModel):
    """Etapa do fluxo ja com recursos embutidos, no formato do CONTRACTS.md.

    Note que o campo e `order` (nome de dominio) embora no model seja
    `order_index` — o rename acontece na serializacao do service. Manter `order`
    no contrato publico reduz churn no frontend.
    """

    id: UUID
    order: int
    sector: SectorRef
    title: str
    description: str
    responsible: str
    estimated_time: str
    resources: list[StepResourceRead]


class ProcessRef(BaseModel):
    """Cabecalho resumido do processo no envelope do fluxo."""

    id: UUID
    title: str


class ProcessFullFlow(BaseModel):
    """Envelope de GET /processes/{id}/flow — exige auth (ADR-006)."""

    process: ProcessRef
    steps: list[FlowStepRead]


# ---------- FlowStep (admin CRUD — B-17) ----------


class FlowStepCreate(BaseModel):
    """Input de criacao de etapa.

    Usa `order` (campo publico) em vez de `order_index` (nome no model). O
    service faz o rename — assim o contrato exposto ao cliente nao vaza o
    detalhe de nome reservado SQL.
    """

    sector_id: UUID
    order: int
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    responsible: str = Field(min_length=1, max_length=255)
    estimated_time: str = Field(min_length=1, max_length=100)


class FlowStepUpdate(BaseModel):
    """PATCH de etapa — todos opcionais. `order` permite reordenacao."""

    sector_id: UUID | None = None
    order: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1)
    responsible: str | None = Field(default=None, min_length=1, max_length=255)
    estimated_time: str | None = Field(default=None, min_length=1, max_length=100)


class FlowStepAdminView(BaseModel):
    """Retorno admin de uma etapa — inclui process_id para referencia cruzada.

    Nao inclui os resources (sao gerenciados por endpoints separados). Para
    ver etapas + resources juntos, o admin usa o GET /admin/processes/{id}
    (B-15) ou o GET /flow publico (B-21).
    """

    id: UUID
    process_id: UUID
    sector_id: UUID
    order: int
    title: str
    description: str
    responsible: str
    estimated_time: str


# ---------- StepResource (admin CRUD — B-17) ----------


class StepResourceCreate(BaseModel):
    """Input de criacao de recurso.

    `url` e `content` sao ambos opcionais — a combinacao valida depende do
    `type` mas a regra nao esta sendo enforcada aqui no MVP (admins cuidam
    disso manualmente). Se virar problema, promovemos para validator.
    """

    type: ResourceType
    title: str = Field(min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=2048)
    content: str | None = None


class StepResourceAdminView(BaseModel):
    """Retorno admin de um recurso — inclui step_id para referencia cruzada."""

    id: UUID
    step_id: UUID
    type: ResourceType
    title: str
    url: str | None
    content: str | None
