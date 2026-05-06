# WIP — Edição de processos PUBLISHED

Documento de planejamento. **Todas as decisões fechadas** — execução em curso na
branch `feat/published-process-edit` (tasks F-27, B-30, F-28).

## Requisito do stakeholder

> Processos publicados podem ser editados pelo admin, e pelo usuário que criou,
> mas para o usuário, sua edição para subir deve ser aprovada por um admin.

Implicações:

- Admin editando PUBLISHED → aplica direto, sem revisão.
- USER autor editando PUBLISHED → muda passa por aprovação de admin antes de
  virar a versão visível ao público.
- Outros USERs (não-autores) não editam.

## Modelo escolhido — sombra-draft (opção A)

Quando o USER autor edita um processo PUBLISHED, o backend cria uma **proposta**:
um clone do processo em status DRAFT, com FK `proposed_change_for` apontando pro
original. O original fica intocado e visível ao público durante toda a revisão.

Fluxo:

```
PUBLISHED (original)
   │
   │  USER autor clica "Propor edição"
   ▼
DRAFT (proposta, proposed_change_for=original.id)
   │  USER edita metadados/steps/resources
   │  USER submete
   ▼
IN_REVIEW (proposta)
   │
   ├── admin aprova → conteúdo da proposta SUBSTITUI o original; proposta deletada
   │                  original continua PUBLISHED, com novos campos/etapas
   │
   └── admin rejeita (arquiva proposta) → original intocado, proposta sumiu
```

Alternativas descartadas:

- **(B) Toggle in-place + flag pendente:** o publicado sumiria da listagem
  pública durante a revisão. Ruim pra UX dos usuários finais.
- **(C) Versionamento real (`process_versions` table):** mais correto a longo
  prazo, mas exagero pra MVP do piloto.

## Decisões fechadas

1. **Opção A — sombra-draft.** Proposta é um clone DRAFT com FK
   `proposed_change_for` apontando pro original.
2. **Admin editando PUBLISHED é aplicado direto.** Backend já permite
   (`_assert_editable_status` em `process_service.py` não bloqueia PUBLISHED).
   Falta destravar a UI no `process-editor.tsx` — feito na task **F-27**.
3. **Apenas o autor original pode propor edição.** Outros USERs recebem 403
   `PROCESS_NOT_OWNED`.
4. **No máximo uma proposta pendente** (DRAFT ou IN_REVIEW) por processo
   original. Segunda chamada de "Propor edição" devolve a id da existente.
   Garantido por unique partial index em `processes.proposed_change_for`.
5. **Opção B — ID-preserving merge.** Migration adiciona
   `flow_steps.cloned_from_step_id` e `step_resources.cloned_from_resource_id`
   (sem FK constraint — são "best effort", populados no momento de criar a
   proposta). Ao aprovar, para cada step do original com correspondência na
   proposta → atualiza in-place (preserva id, progresso pessoal fica intacto);
   steps novos da proposta → insert; steps do original sem correspondência →
   delete. Mesma lógica pra resources. Justificativa: o piloto vai ter muitos
   servidores acompanhando e progresso preservado é parte do contrato com o
   stakeholder.
6. **Opção A — bloquear.** Backend rejeita `update_process` e `archive_process`
   no original com 409 `PROCESS_HAS_PENDING_PROPOSAL` enquanto existir proposta
   pendente. Admin precisa resolver a proposta primeiro: aprovar (merge) ou
   rejeitar (arquivar a proposta DRAFT, rota já existe). Frontend mostra botão
   "Rejeitar proposta" no editor admin como atalho para o `archive_process`
   da proposta.

### Decisões adicionais tomadas durante o refinamento

7. **`pending_proposal_id` é campo computado em `ProcessAdminView`** —
   evita round-trip extra no frontend pra descobrir se um original tem
   proposta apontando pra ele. Calculado via subquery no service que monta
   o schema.
8. **Hard-delete da proposta ao aprovar.** Como B-27 (logs estruturados) ainda
   não existe, não há trilha de auditoria rica de qualquer forma — manter a
   proposta como ARCHIVED só polui as listagens. Quando B-27 entrar, a
   trilha vai vir do log estruturado de `process_proposal_approved`.

## Plano de execução em milestones

### Milestone 2.1 — Admin edita PUBLISHED direto (task F-27)

Sem mudança de backend.

- `apps/frontend/src/pages/admin/process-editor.tsx`:
  - `editable = process?.status === "DRAFT" || (mode === "admin" && process?.status === "PUBLISHED")`
  - `lockMessageFor`: PUBLISHED + admin → null (sem aviso de bloqueio)
  - `editable` já era propagado para `StepsSection` e `disabled={!editable}`
    no `ProcessMetadataForm` — basta a expressão acima cobrir os 2 lugares.
- Adicionar teste de roteamento em `__tests__/app.test.tsx`: admin abre
  `/admin/processes/:id/edit` de um PUBLISHED → metadados editáveis e
  sem alerta "Edição bloqueada". Owner abre `/processes/:id/edit` de um
  PUBLISHED → mostra alerta de bloqueio (preserva comportamento atual; a
  CTA "Propor edição" entra em F-28).

### Milestone 2.2 — Fluxo de proposta de edição do USER autor

#### Backend (task B-30, 1 PR)

**Migration**

- Adiciona `processes.proposed_change_for UUID FK -> processes(id) ON DELETE CASCADE`
- Unique partial index `(proposed_change_for) WHERE proposed_change_for IS NOT NULL`
- Adiciona `flow_steps.cloned_from_step_id UUID NULL` e
  `step_resources.cloned_from_resource_id UUID NULL` (sem FK constraint —
  são "best effort", se o id sumir do original entre clonagem e merge,
  tratamos como step/resource novo).

**Models** ganham:
- `Process.proposed_change_for: UUID | None`
- `FlowStep.cloned_from_step_id: UUID | None`
- `StepResource.cloned_from_resource_id: UUID | None`

**Schema `ProcessAdminView`** expõe:
- `proposed_change_for` (id do processo original quando este registro é uma
  proposta; None caso contrário).
- `pending_proposal_id` (id da proposta pendente apontando pra este
  registro; None caso contrário).

**`process_service.py`**

- `start_edit_proposal(session, process_id, *, requester_id) -> Process`
  - Carrega original (404 se não achar).
  - 409 `PROCESS_NOT_PUBLISHED` se status != PUBLISHED.
  - 403 `PROCESS_NOT_OWNED` se `requester_id != original.created_by` (admin
    edita direto, não usa este endpoint).
  - Idempotente: se já existe proposta pendente com `proposed_change_for
    == process.id` → retorna ela.
  - Senão clona: novo Process DRAFT com `proposed_change_for=process.id`;
    metadados copiados; steps clonados com `cloned_from_step_id` apontando
    pro step original; resources idem.
- `approve_process` ganha branch quando `target.proposed_change_for is not None`:
  - Carrega original. Se original não está mais PUBLISHED → 409
    `PROPOSAL_BASE_NOT_PUBLISHED` (defesa em profundidade — bloqueio do
    item 6 já deveria ter prevenido).
  - Aplica merge ID-preserving (5B): ver detalhamento na seção "Merge
    ID-preserving" abaixo.
  - Hard-deleta a proposta (item 8).
  - Retorna o original atualizado, com novo `approved_by` e `updated_at`.
  - Senão: comportamento atual.
- `update_process` e `archive_process` checam se existe proposta pendente
  (DRAFT ou IN_REVIEW) com `proposed_change_for == process.id`. Se sim →
  409 `PROCESS_HAS_PENDING_PROPOSAL` com `details.proposal_id`.
- `submit_for_review`: se a proposta tem `proposed_change_for` e o processo
  apontado não é mais PUBLISHED → 409 `PROPOSAL_BASE_NOT_PUBLISHED`.

**Merge ID-preserving (no `approve_process` quando há `proposed_change_for`)**

1. Map `prop_step.cloned_from_step_id → prop_step` (ignora None).
2. Para cada `original.step`: se há prop_step em (1) com cloned_from
   apontando pra ela → update in-place (copia title, description,
   responsible, sector_id, order_index, estimated_time). Senão → delete
   (cascade resources).
3. Para cada prop_step sem match (cloned_from None ou apontando pra step
   inexistente do original) → insert novo step no original (gera novo id).
4. Para cada step preservado em (2): aplica mesma lógica para resources
   via `cloned_from_resource_id`.
5. Copia metadados do prop pro original (title, short_description,
   full_description, category, estimated_time, requirements).

**Router** `POST /processes/{id}/propose-edit` → 201 com a proposta.

**Testes** (`tests/test_process_proposal.py` novo)

- Ciclo feliz: USER autor cria proposta, edita metadados/step/resource,
  submete, admin aprova → original tem novo conteúdo, proposta sumiu, e o
  id do step preservado continua o mesmo (chave em `user_progress.
  step_statuses` ainda é válida).
- Não-autor (USER que não é dono) recebe 403 `PROCESS_NOT_OWNED`.
- Processo não-publicado (DRAFT/IN_REVIEW/ARCHIVED) recebe 409
  `PROCESS_NOT_PUBLISHED`.
- Segunda chamada de propose-edit devolve a mesma proposta (mesmo id).
- Admin tentando `update_process` no original com proposta pendente recebe
  409 `PROCESS_HAS_PENDING_PROPOSAL` com `details.proposal_id`.
- Admin tentando `archive_process` no original com proposta pendente recebe
  409 idem.
- Merge ID-preserving completo: criar proposta com 3 steps (1 atualizado,
  1 deletado da proposta, 1 novo na proposta) → após aprovação, original
  tem step preservado com id antigo, sem o deletado, com o novo (id
  diferente).
- Aprovação cuja base virou ARCHIVED entre criação e approve (force-set
  no banco para simular race) → 409 `PROPOSAL_BASE_NOT_PUBLISHED`.
- Submit de proposta cuja base não é mais PUBLISHED → 409
  `PROPOSAL_BASE_NOT_PUBLISHED`.
- Sem auth → 401.

#### Frontend (task F-28, 1 PR depois do B-30)

- Sync de tipos com `./scripts/sync-api-types.sh`.
- `process-editor.tsx`: botão "Propor edição" quando
  `mode === "owner" && process.status === "PUBLISHED"`. Click → POST /propose-edit
  → navega pra `/processes/{proposalId}/edit`.
- Banner no editor da proposta: "Esta é uma proposta de edição do processo
  publicado X. Ao submeter, um administrador analisará."
- "Meus processos" e fila admin: badge "edição em revisão" diferenciando
  propostas de submissões originais.
- Banner no editor admin do original quando `pending_proposal_id !== null`:
  "Existe proposta de edição em revisão. Resolva-a antes de editar este
  processo." + link "Ver proposta".
- Tratar 409 `PROCESS_HAS_PENDING_PROPOSAL` no `useUpdateProcess` e
  `useArchiveProcess`: toast + ação "Ver proposta".
- Botão "Rejeitar proposta" no editor admin de uma proposta pendente —
  wrapper em `useArchiveProcess` (proposta é DRAFT/IN_REVIEW; archive
  rota existe).
- Lista admin: badge "Proposta de edição" quando `proposed_change_for !== null`.
- Hook novo `useProposeEdit` em `use-processes-management.ts`.
- Testes de hooks novos + componentes alterados.
