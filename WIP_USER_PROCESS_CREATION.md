# WIP — Permitir USER criar processos (admin aprova)

> **Documento temporário de continuidade.** Apagar antes de abrir o PR final.
> Branch: `feat/user-can-create-processes` (a partir de `main`).

## Contexto da regra de negócio

Antes desta branch: só ADMIN/SUPER_ADMIN cria/edita processos. USER comum só visualiza PUBLISHED.

Decisão: USER pode criar processos e seus fluxos; ADMIN segue como único aprovador. Mudança aprovada pelo Joao em 2026-04-25.

## Decisões resolvidas com o usuário

1. **Editar IN_REVIEW**: bloqueado direto. Autor precisa primeiro `POST /processes/{id}/withdraw` (IN_REVIEW→DRAFT), editar, e re-submeter. Endpoint `withdraw` é novo.
2. **Arquivar**: USER arquiva próprios DRAFT/IN_REVIEW; ADMIN arquiva qualquer (incluindo PUBLISHED).
3. **Listagem do USER**: USER vê só os próprios processos (`GET /processes/mine`); não vê DRAFT/IN_REVIEW de colegas.
4. **Branch**: `feat/user-can-create-processes` (cross-stack autorizado).
5. **Desenho** (Opção A — confirmar com user na primeira oportunidade): renomear endpoints — CRUD vai pra `/processes/*`, `/admin/processes/*` fica reduzido a moderação (lista admin + approve). Isso evita o path `/admin/` mentir sobre quem pode acessar.

## Modelo final de permissões

| Endpoint | Quem pode |
|---|---|
| `GET /processes` | público (PUBLISHED) — sem mudança |
| `GET /processes/{id}` | público (PUBLISHED) — sem mudança |
| `GET /processes/{id}/flow` | autenticado (admin vê não-PUBLISHED) — sem mudança |
| `POST /processes` | autenticado USER+ — cria DRAFT, `created_by` do JWT |
| `GET /processes/mine` | autenticado USER+ — só os próprios |
| `PATCH /processes/{id}` | autor (DRAFT) ou admin (qualquer status, exceto PUBLISHED?) — bloqueia se IN_REVIEW |
| `DELETE /processes/{id}` | autor (DRAFT/IN_REVIEW) ou admin (qualquer) |
| `POST /processes/{id}/steps` (e PATCH/DELETE) | autor (DRAFT) ou admin |
| `POST /processes/{id}/steps/{step_id}/resources` (e DELETE) | autor (DRAFT) ou admin |
| `POST /processes/{id}/submit-for-review` | autor (DRAFT→IN_REVIEW) |
| `POST /processes/{id}/withdraw` (NOVO) | autor (IN_REVIEW→DRAFT) |
| `GET /admin/processes` | admin (lista tudo) |
| `GET /admin/processes/{id}` | admin (qualquer status) |
| `POST /admin/processes/{id}/approve` | admin (IN_REVIEW→PUBLISHED) |

Códigos de erro novos: `PROCESS_NOT_OWNED` (403), `PROCESS_LOCKED_IN_REVIEW` (409 — precisa withdraw para editar).

## Plano (14 tasks na fila — ver TaskList)

### Backend
- [x] **B1** — refactor `process_service.py` com helpers `_assert_owner_or_admin` + `_assert_editable_status`, novo `withdraw_from_review`, `list_processes_for_owner`, bloqueio PATCH em IN_REVIEW. Mutações de step/resource agora exigem `requester_id` + `requester_role` (cascateado para `_ensure_process_editable`).
- [x] **B2** — CRUD movido para `routers/processes.py`. Endpoints novos: `POST /processes`, `GET /processes/mine`, `GET /processes/{id}/management`, `PATCH /processes/{id}`, `DELETE /processes/{id}`, `/steps` e `/resources`, `/submit-for-review`, `/withdraw`. `admin_processes.py` reduzido a `GET /admin/processes` + `POST /admin/processes/{id}/approve`. Schema `ProcessesManagementListResponse` (compartilhado). Service novo `get_process_for_management`.
- [x] **B3** — testes. `test_process_service.py` ganhou ownership/withdraw cases (31 unit). `test_admin_processes.py` reduzido a moderação (9 testes). Novo `test_processes_management.py` (32 testes — POST, GET /mine, GET /{id}/management, PATCH, DELETE, withdraw — incluindo todos os 403/409). `test_admin_steps_resources.py` URLs trocadas + 3 ownership cases. `test_process_approval.py` URL submit movida para /processes (approve segue em /admin). **350 passed total.** Bug encontrado e corrigido: `GET /processes/mine` precisa ser declarado antes de `GET /processes/{id}` no router.
- [x] **B4** — `apps/backend/docs/CONTRACTS.md` atualizado: nova seção "Gestão de Processos (autor + admin)" descrevendo `/processes/*`, seção "Moderação (admin)" reduzida a `/admin/processes` (lista + approve), tabela de códigos de erro completada com `PROCESS_NOT_OWNED`, `PROCESS_LOCKED_IN_REVIEW`, `PROCESS_ARCHIVE_REQUIRES_ADMIN`, e demais.
- [x] **B-CI** — ruff verde, format verde, alembic OK, pytest 350 passando, cobertura 98.23%. Pronto pra commitar.

### Frontend
- [ ] **F1** — `./scripts/sync-api-types.sh` para regenerar `src/types/api.ts`.
- [ ] **F2** — refatorar hooks (`use-processes-management.ts`, `use-my-processes.ts`, `useWithdrawProcess`).
- [ ] **F3** — rotas `/processes/new`, `/processes/mine`, `/processes/:id/edit` (autenticadas, sem `requiredRole`).
- [ ] **F4** — header com links "Criar processo" e "Meus processos" para autenticados.
- [ ] **F5** — página `/processes/mine`.
- [ ] **F6** — editor `/processes/new` e `/processes/:id/edit` com botões submit/withdraw/approve role-aware; bloqueio de edição em IN_REVIEW.
- [ ] **F7** — refocar `/admin/processes` em "Moderação" (default IN_REVIEW; sem botão "Novo processo").
- [ ] **F8** — atualizar `app.test.tsx` e demais testes de página.
- [ ] **F-CI** — type-check + lint + test:run + test:coverage. Commit.

## Como retomar a conversa em outra sessão

1. `git status && git log --oneline main..HEAD` — ver onde parei.
2. Ler este doc + `MEMORY.md` (auto-memory) + os 4 `.md` da raiz.
3. Rodar TaskList (a fila completa está lá).
4. Identificar a próxima task pendente, perguntar ao user se segue.

## Diário de progresso

- **2026-04-25 — B-CI done.** Backend pronto. Próxima sessão: F1→F-CI.
- **2026-04-25 — B4 done.** CONTRACTS.md atualizado.
- **2026-04-25 — B3 done.** 350 testes passando. Cobriu ownership, withdraw, transições, ARCHIVE_REQUIRES_ADMIN, PROCESS_LOCKED_IN_REVIEW. Bug de ordem de rota corrigido (mine antes de /{id}).
- **2026-04-25 — B2 done.** Routers refatorados. `routers/processes.py` ganhou todos os CRUD/transições com `Depends(get_current_user_payload)`; `routers/admin_processes.py` reduzido a moderação. Schema `ProcessesManagementListResponse` adicionado. Service novo `get_process_for_management` (combina get + assert ownership). App importa, ruff verde, mas testes de admin quebram (esperado — B3 reescreve).
- **2026-04-25 — B1 done.** `process_service.py` refatorado. Novas assinaturas (PATCH/DELETE/steps/resources/submit/withdraw/archive recebem `requester_id`+`requester_role`). Novo serviço `withdraw_from_review`. Novo serviço `list_processes_for_owner`. Helpers `_is_admin`, `_assert_owner_or_admin`, `_assert_editable_status`. Códigos novos de erro: `PROCESS_NOT_OWNED` (403), `PROCESS_LOCKED_IN_REVIEW` (409), `PROCESS_ARCHIVE_REQUIRES_ADMIN` (403). Os routers ainda chamam o service com a assinatura antiga — vai quebrar até a B2.
