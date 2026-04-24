# TASKS.md — apps/backend

Cada task tem um ID no formato `B-XX`. Cumpra as tasks na ordem dos prefixos numéricos — tasks com menor número vêm primeiro, e dependências são explícitas.

**Em monorepo**: ao terminar uma task que adiciona ou modifica um endpoint, é boa prática (não obrigatória por este TASKS.md, mas recomendada) rodar `./scripts/sync-api-types.sh` da raiz para deixar os tipos do frontend atualizados. Isso evita que o próximo colega do frontend pegue uma task e descubra que os tipos estão desatualizados. Ver regras completas no `CLAUDE.md` da raiz.

## Legenda de campos

- **Status**: `TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`
- **Assignee**: quem está fazendo
- **Depende de**: outras tasks que precisam estar DONE
- **Objetivo**: uma frase
- **Critério de pronto**: lista verificável — quando tudo marcado, a task está pronta
- **Arquivos permitidos**: padrão glob dos arquivos que podem ser criados/modificados nesta task
- **Testes obrigatórios**: mínimo de testes que precisam existir
- **Checklist de segurança**: itens que o revisor confere
- **REQ mapeados**: IDs dos requisitos da planilha MoSCoW

---

## Sprint 0 — Fundação

### B-00 — Setup do repositório e estrutura de pastas
Status: TODO
Depende de: —
REQ mapeados: REQ-080, REQ-081

**Objetivo:** Criar o esqueleto do repo com estrutura de pastas, pyproject, docker-compose e pipeline de CI hello-world.

**Critério de pronto:**
- [ ] Repo `ifflow-backend` criado no GitHub com branch protection no `main` (exige PR + 1 aprovação)
- [ ] Estrutura de pastas conforme `CLAUDE.md` criada (pastas vazias com `__init__.py`)
- [ ] `pyproject.toml` com dependências da stack (FastAPI, SQLModel, alembic, passlib[argon2], pyjwt, pytest, httpx, python-dotenv, slowapi, resend)
- [ ] `Dockerfile` multi-stage para Python 3.12
- [ ] `docker-compose.yml` subindo Postgres 16 + API
- [ ] `.env.example` com todas as variáveis necessárias (DATABASE_URL, JWT_SECRET, RESEND_API_KEY, FRONTEND_URL, ENVIRONMENT)
- [ ] `.gitignore` cobrindo `.env`, `__pycache__`, `.pytest_cache`, `.venv`
- [ ] `app/main.py` com FastAPI app que responde `GET /health` → `{"status": "ok"}`
- [ ] `.github/workflows/ci.yml` rodando `pytest` e falhando se houver erro
- [ ] README do repo com instruções de setup

**Arquivos permitidos:** todo o repo (task fundacional)

**Testes obrigatórios:**
- `test_health.py` testando `GET /health` retorna 200 e o corpo correto

**Checklist de segurança:**
- [ ] `.env` está no `.gitignore`
- [ ] `.env.example` não contém valores reais de secret
- [ ] `JWT_SECRET` no `.env.example` é placeholder óbvio (`change-me-to-a-32-byte-random-string`)

---

### B-01 — Configuração, database e sessão
Status: TODO
Depende de: B-00
REQ mapeados: REQ-080

**Objetivo:** Configurar pydantic-settings, engine do SQLModel, e a dependency `get_session`.

**Critério de pronto:**
- [ ] `app/config.py` com classe `Settings` lendo do `.env` via pydantic-settings
- [ ] `app/database.py` com engine criado a partir de `settings.database_url`
- [ ] Dependency `get_session()` que yield uma sessão SQLModel
- [ ] Sessões são fechadas corretamente (context manager)
- [ ] `app/main.py` importa a config e falha no startup se variáveis obrigatórias estiverem faltando
- [ ] `alembic init alembic` executado e `env.py` configurado para ler a URL do config

**Arquivos permitidos:** `app/config.py`, `app/database.py`, `app/main.py`, `alembic/env.py`, `alembic.ini`

**Testes obrigatórios:**
- `test_config.py`: carrega settings com env vars de teste

**Checklist de segurança:**
- [ ] Settings nunca loga valores de secret
- [ ] Não há fallback de `JWT_SECRET` para string fixa em código

---

### B-02 — Core de segurança (hash, JWT, dependencies)
Status: TODO
Depende de: B-01
REQ mapeados: REQ-070, REQ-072, REQ-073

**Objetivo:** Implementar as funções de segurança e as dependencies de autenticação/autorização. Nada mais.

**Critério de pronto:**
- [ ] `app/core/security.py` com funções:
  - `hash_password(plain: str) -> str` usando passlib com argon2
  - `verify_password(plain: str, hashed: str) -> bool`
  - `create_access_token(user_id: UUID, role: UserRole) -> str` (JWT HS256, exp 24h)
  - `decode_access_token(token: str) -> TokenPayload` (levanta exceção customizada se inválido)
- [ ] `app/core/exceptions.py` com exceções customizadas: `UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`
- [ ] `app/core/dependencies.py` com:
  - `get_current_user(session, token)` que retorna o User ou levanta `UnauthenticatedError`
  - `require_role(*roles)` como dependency factory
- [ ] Exception handlers em `app/main.py` que traduzem as exceções customizadas para o formato de erro padrão do `CONTRACTS.md`

**Arquivos permitidos:** `app/core/**`, `app/main.py`

**Testes obrigatórios:**
- `test_security.py`: hash/verify roundtrip, JWT encode/decode, JWT expirado, JWT malformado, JWT com assinatura errada
- Teste de cada exception handler retornando o formato correto

**Checklist de segurança:**
- [ ] Argon2 com parâmetros padrão do passlib (não desabilitar memory_cost)
- [ ] JWT_SECRET carregado do config, nunca hardcoded
- [ ] `decode_access_token` valida `exp`, `iat`, assinatura
- [ ] Exceções de segurança NÃO expõem detalhes internos (stack trace, SQL, etc)
- [ ] Não há logs de senhas ou tokens em plaintext

---

## Sprint 1 — Autenticação completa

### B-03 — Model User e migration inicial
Status: TODO
Depende de: B-01
REQ mapeados: REQ-001, REQ-005, REQ-007, REQ-103

**Objetivo:** Criar o model `User` com todos os campos definidos no `CLAUDE.md` e a primeira migration.

**Critério de pronto:**
- [ ] `app/models/user.py` com SQLModel `User` contendo todos os campos:
  - `id: UUID primary_key default_factory=uuid4`
  - `name: str`
  - `email: str unique index`
  - `siape: str`
  - `sector: str`
  - `password_hash: str`
  - `role: UserRole` (enum USER/ADMIN/SUPER_ADMIN, default USER)
  - `status: UserStatus` (enum PENDING/APPROVED/REJECTED, default PENDING)
  - `created_at`, `updated_at`
- [ ] Enums `UserRole` e `UserStatus` em `app/models/user.py`
- [ ] Migration criada via `alembic revision --autogenerate -m "create_users_table"`
- [ ] Migration aplica limpo (`alembic upgrade head` e `alembic downgrade base`)
- [ ] Index único em `email`

**Arquivos permitidos:** `app/models/user.py`, `app/models/__init__.py`, `alembic/versions/*.py`

**Testes obrigatórios:**
- `test_models_user.py`: criar, salvar, buscar por email, unicidade de email gera erro

**Checklist de segurança:**
- [ ] `password_hash` é string normal, não campo opcional (NOT NULL no banco)
- [ ] Email é único no banco (índice unique), não apenas no código

---

### B-04 — Schemas Pydantic de User e Auth
Status: TODO
Depende de: B-03
REQ mapeados: REQ-053, REQ-103

**Objetivo:** Criar os schemas de entrada e saída (NÃO tabelas) conforme `CONTRACTS.md`.

**Critério de pronto:**
- [ ] `app/schemas/auth.py` com: `RegisterRequest`, `RegisterResponse`, `LoginRequest`, `LoginResponse`, `PasswordResetRequest`, `PasswordResetConfirm`
- [ ] `app/schemas/user.py` com: `UserPublic`, `UserMe`, `UserAdminView`
- [ ] Validadores:
  - Email termina em `@ifam.edu.br` → senão levanta `ValidationError` com code `INVALID_EMAIL_DOMAIN`
  - Senha mínimo 8 caracteres → code `WEAK_PASSWORD`
  - `password == password_confirmation` → code `VALIDATION_ERROR`
- [ ] Nenhum schema de entrada inclui `role`, `status`, `id`, `password_hash` (prevenção de mass assignment)

**Arquivos permitidos:** `app/schemas/**`

**Testes obrigatórios:**
- `test_schemas_auth.py`:
  - RegisterRequest aceita input válido
  - RegisterRequest rejeita email sem @ifam.edu.br
  - RegisterRequest rejeita senhas diferentes
  - RegisterRequest rejeita senha curta
  - Tentativa de passar `role=ADMIN` no RegisterRequest é ignorada ou rejeitada

**Checklist de segurança:**
- [ ] Schemas de entrada usam `model_config = ConfigDict(extra="forbid")` OU listam campos explicitamente sem `**kwargs`
- [ ] Nenhum schema de resposta expõe `password_hash`

---

### B-05 — Service de auth: registro
Status: TODO
Depende de: B-04, B-02
REQ mapeados: REQ-001, REQ-006b, REQ-103, REQ-070

**Objetivo:** Implementar a lógica de cadastro (cria usuário em status PENDING, sem login automático).

**Critério de pronto:**
- [ ] `app/services/auth_service.py` com função `register_user(session, data: RegisterRequest) -> User`
- [ ] Verifica se email já existe → levanta `ConflictError("EMAIL_ALREADY_EXISTS")`
- [ ] Hash da senha via `hash_password`
- [ ] Cria User com `status=PENDING`, `role=USER`
- [ ] Persiste e retorna o User

**Arquivos permitidos:** `app/services/auth_service.py`, `app/services/__init__.py`

**Testes obrigatórios:**
- `test_auth_service_register.py`:
  - Registro com dados válidos cria user PENDING
  - Registro com email duplicado levanta ConflictError
  - Senha é armazenada como hash (nunca plaintext)

**Checklist de segurança:**
- [ ] Senha nunca chega ao banco em plaintext
- [ ] `role` e `status` são setados pelo service, nunca vindos do request

---

### B-06 — Endpoint POST /auth/register
Status: TODO
Depende de: B-05
REQ mapeados: REQ-001, REQ-006b

**Objetivo:** Expor o endpoint de cadastro seguindo o `CONTRACTS.md`.

**Critério de pronto:**
- [ ] `app/routers/auth.py` com `POST /auth/register`
- [ ] Router NÃO contém lógica de negócio, só orquestra: recebe schema, chama service, retorna response
- [ ] Response segue exatamente o formato do `CONTRACTS.md` (`RegisterResponse`)
- [ ] Erros seguem o formato padrão

**Arquivos permitidos:** `app/routers/auth.py`, `app/routers/__init__.py`, `app/main.py` (para incluir o router)

**Testes obrigatórios:**
- `test_auth_register.py` (testes de integração via TestClient):
  - 201: cadastro válido retorna formato correto com status PENDING
  - 400: email sem @ifam.edu.br → `INVALID_EMAIL_DOMAIN`
  - 400: senha curta → `WEAK_PASSWORD`
  - 400: senhas não coincidem → `VALIDATION_ERROR`
  - 409: email duplicado → `EMAIL_ALREADY_EXISTS`
  - 422: campo obrigatório faltando → erro Pydantic padrão

**Checklist de segurança:**
- [ ] Response nunca inclui `password_hash`
- [ ] Mensagens de erro não revelam detalhes internos
- [ ] Endpoint não retorna token (cadastro NÃO loga automaticamente)

---

### B-07 — Service e endpoint de login
Status: TODO
Depende de: B-05, B-02
REQ mapeados: REQ-002, REQ-006b, REQ-070, REQ-072

**Objetivo:** Implementar login que bloqueia usuários pendentes e rejeitados.

**Critério de pronto:**
- [ ] `app/services/auth_service.py` ganha função `authenticate_user(session, email, password) -> LoginResult`
- [ ] Se email não existe → `UnauthenticatedError("INVALID_CREDENTIALS")` (mesma mensagem para não vazar existência)
- [ ] Se senha errada → `UnauthenticatedError("INVALID_CREDENTIALS")`
- [ ] Se status=PENDING → `ForbiddenError("ACCOUNT_PENDING")`
- [ ] Se status=REJECTED → `ForbiddenError("ACCOUNT_REJECTED")`
- [ ] Se tudo ok → cria JWT e retorna com dados do user
- [ ] Endpoint `POST /auth/login` em `app/routers/auth.py`
- [ ] Rate limit de 5 tentativas/min por IP via slowapi

**Arquivos permitidos:** `app/services/auth_service.py`, `app/routers/auth.py`, `app/main.py` (setup slowapi)

**Testes obrigatórios:**
- `test_auth_login.py`:
  - 200: login válido retorna token e user
  - 401: email inexistente → `INVALID_CREDENTIALS`
  - 401: senha errada → `INVALID_CREDENTIALS` (mesma mensagem que acima!)
  - 403: user PENDING → `ACCOUNT_PENDING`
  - 403: user REJECTED → `ACCOUNT_REJECTED`
  - 429: após 5 tentativas → `RATE_LIMITED`

**Checklist de segurança:**
- [ ] Mensagem de erro para email inexistente e senha errada é IDÊNTICA
- [ ] Tempo de resposta não permite enumeração (verify_password roda mesmo para email inexistente — usar dummy hash para comparar)
- [ ] Rate limit está efetivamente ativo no endpoint
- [ ] Token expira em 24h

---

### B-08 — Endpoints GET /auth/me e POST /auth/logout
Status: TODO
Depende de: B-07
REQ mapeados: REQ-002, REQ-003

**Objetivo:** Endpoints auxiliares de sessão.

**Critério de pronto:**
- [ ] `GET /auth/me` retorna `UserMe` do usuário autenticado
- [ ] `POST /auth/logout` retorna 204 sem corpo (frontend descarta o token)
- [ ] Ambos exigem autenticação via `get_current_user`

**Arquivos permitidos:** `app/routers/auth.py`

**Testes obrigatórios:**
- `test_auth_me_logout.py`:
  - GET /auth/me: 200 com token válido, 401 sem token, 401 com token inválido, 401 com token expirado
  - POST /auth/logout: 204 com token válido, 401 sem token

**Checklist de segurança:**
- [ ] GET /auth/me nunca retorna `password_hash`
- [ ] Comentário no router de logout explicando que o token continua válido até expirar (decisão do MVP)

---

### B-09 — Integração com Resend para envio de email
Status: TODO
Depende de: B-01
REQ mapeados: REQ-004

**Objetivo:** Wrapper simples para envio de email via Resend. Nenhum endpoint ainda, só a peça de infra.

**Critério de pronto:**
- [ ] `app/email/client.py` com função `send_email(to: str, subject: str, html: str) -> None`
- [ ] `app/email/templates.py` com funções que retornam HTML para:
  - `password_reset_email(name, reset_url)`
  - `account_approved_email(name)`
  - `account_rejected_email(name, reason)`
- [ ] Em ambiente de teste (`ENVIRONMENT=test`), o envio é mockado e grava em memória para verificação
- [ ] Em dev/prod, chama a API real do Resend

**Arquivos permitidos:** `app/email/**`, `app/config.py` (adicionar variáveis)

**Testes obrigatórios:**
- `test_email_client.py`: em modo test, emails são capturados corretamente

**Checklist de segurança:**
- [ ] API key do Resend vem do config, nunca hardcoded
- [ ] Email nunca inclui senha em plaintext
- [ ] Template de reset inclui link com token, não a nova senha

---

### B-10 — Recuperação de senha (request + confirm)
Status: TODO
Depende de: B-09, B-05
REQ mapeados: REQ-004

**Objetivo:** Fluxo completo de reset de senha.

**Critério de pronto:**
- [ ] Model `PasswordResetToken` em `app/models/password_reset.py`:
  - `id: UUID`
  - `user_id: FK User`
  - `token_hash: str` (armazenar hash do token, não o token)
  - `expires_at: datetime`
  - `used_at: datetime | None`
- [ ] Migration criada e aplicada
- [ ] Service `request_password_reset(email)`:
  - Se user existe e APPROVED: gera token random (secrets.token_urlsafe(32)), grava hash, envia email
  - Se não existe ou não APPROVED: não faz nada (mas não levanta erro)
- [ ] Service `confirm_password_reset(token, new_password, confirmation)`:
  - Busca token_hash no banco
  - Valida que não expirou e não foi usado
  - Valida confirmação de senha
  - Atualiza password_hash do user
  - Marca `used_at` do token
- [ ] Endpoints `POST /auth/request-password-reset` e `POST /auth/reset-password`
- [ ] Rate limit de 3/hora no request

**Arquivos permitidos:** `app/models/password_reset.py`, `app/models/__init__.py`, `alembic/versions/*.py`, `app/services/auth_service.py`, `app/routers/auth.py`, `app/schemas/auth.py`

**Testes obrigatórios:**
- `test_password_reset.py`:
  - Request com email válido cria token e envia email (mockado)
  - Request com email inexistente retorna 200 sem criar token (não vazar)
  - Confirm com token válido atualiza a senha
  - Confirm com token expirado → erro
  - Confirm com token já usado → erro
  - Confirm com senhas que não coincidem → erro
  - Token antigo não funciona após usado

**Checklist de segurança:**
- [ ] Token é gerado com `secrets.token_urlsafe(32)` (criptograficamente seguro)
- [ ] Apenas hash do token é armazenado (SHA256 é ok aqui porque já é aleatório)
- [ ] Token expira em 1h
- [ ] Token só pode ser usado uma vez (`used_at`)
- [ ] Rate limit ativo
- [ ] Email não revela se conta existe

---

### B-11 — Seed do super_admin inicial
Status: TODO
Depende de: B-03, B-02
REQ mapeados: REQ-007

**Objetivo:** Script para criar o super_admin inicial ao bootstrap do sistema.

**Critério de pronto:**
- [ ] `app/scripts/seed_super_admin.py` executável como `python -m app.scripts.seed_super_admin`
- [ ] Lê credenciais de variáveis de ambiente `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD`, `SEED_SUPER_ADMIN_NAME`, `SEED_SUPER_ADMIN_SIAPE`
- [ ] Cria user com `role=SUPER_ADMIN`, `status=APPROVED`
- [ ] Se o user já existir, não faz nada e loga "super_admin já existe"
- [ ] **Decisão**: super_admin herda todas as permissões de admin (ver REQ-007 atualizado). Portanto ele já pode aprovar cadastros e fluxos desde o dia zero.

**Arquivos permitidos:** `app/scripts/seed_super_admin.py`, `app/scripts/__init__.py`, `.env.example`

**Testes obrigatórios:**
- `test_seed_super_admin.py`: rodar o script cria o user; rodar de novo não duplica

**Checklist de segurança:**
- [ ] Senha do seed vem de env var, nunca hardcoded
- [ ] `.env.example` documenta as variáveis mas com valores placeholder
- [ ] Script NUNCA é chamado automaticamente no startup — apenas manualmente

---

## Sprint 2 — Aprovação de usuários e modelo de processos

### B-12 — Endpoints admin: listar pendentes, aprovar, rejeitar
Status: TODO
Depende de: B-08, B-09
REQ mapeados: REQ-005, REQ-006b

**Objetivo:** Admin gerencia cadastros pendentes.

**Critério de pronto:**
- [ ] `app/services/user_service.py` com `list_pending_users`, `approve_user`, `reject_user`
- [ ] `approve_user` muda status para APPROVED e dispara email de aprovação
- [ ] `reject_user` muda status para REJECTED e dispara email de rejeição (com motivo opcional)
- [ ] Router `app/routers/admin_users.py` com os 3 endpoints do `CONTRACTS.md`
- [ ] Todos exigem `require_role(ADMIN, SUPER_ADMIN)`
- [ ] SUPER_ADMIN tem as mesmas permissões de ADMIN aqui (por herança)

**Arquivos permitidos:** `app/services/user_service.py`, `app/routers/admin_users.py`, `app/main.py`

**Testes obrigatórios:**
- `test_admin_users.py`:
  - 200: admin lista pendentes
  - 403: user comum tenta listar pendentes
  - 401: sem auth
  - 200: admin aprova pendente, status muda, email enviado
  - 200: admin rejeita pendente, email enviado
  - 404: aprovar user inexistente
  - 409: aprovar user já APPROVED

**Checklist de segurança:**
- [ ] Endpoints exigem role ADMIN ou SUPER_ADMIN
- [ ] Não é possível aprovar a si mesmo via este endpoint (isso é papel do seed)
- [ ] Reject não deleta o user, apenas muda status (LGPD: permite auditoria)

---

### B-13 — Endpoints super_admin: promover e rebaixar
Status: TODO
Depende de: B-12
REQ mapeados: REQ-007

**Objetivo:** Super_admin gerencia papéis.

**Critério de pronto:**
- [ ] Service `promote_to_admin(session, user_id, requester)` e `demote_to_user(session, user_id, requester)`
- [ ] `promote_to_admin` só aceita users com role USER e status APPROVED
- [ ] `demote_to_user` não permite rebaixar a si mesmo (levanta ForbiddenError)
- [ ] `demote_to_user` não permite rebaixar outro SUPER_ADMIN
- [ ] Router `app/routers/super_admin_users.py`
- [ ] Endpoints exigem `require_role(SUPER_ADMIN)` APENAS (admin não pode fazer isso)

**Arquivos permitidos:** `app/services/user_service.py`, `app/routers/super_admin_users.py`, `app/main.py`

**Testes obrigatórios:**
- `test_super_admin_users.py`:
  - 200: super_admin promove user para admin
  - 403: admin tenta promover → negado (só super_admin pode)
  - 403: super_admin tenta rebaixar a si mesmo → negado
  - 403: super_admin tenta rebaixar outro super_admin → negado
  - 409: promover user já ADMIN

**Checklist de segurança:**
- [ ] Apenas SUPER_ADMIN (não ADMIN) pode acessar estes endpoints
- [ ] Proteção contra auto-rebaixamento (senão o sistema pode ficar sem super_admin)
- [ ] Log de auditoria: quem promoveu/rebaixou quem e quando

---

### B-14 — Models Sector, Process, FlowStep, StepResource
Status: TODO
Depende de: B-03
REQ mapeados: REQ-040, REQ-101, REQ-104, REQ-018

**Objetivo:** Criar todos os models de domínio de processos de uma vez, com suas migrations.

**Critério de pronto:**
- [ ] `app/models/sector.py` com Sector
- [ ] `app/models/process.py` com Process (inclui campo `access_count: int default 0` conforme REQ-020)
- [ ] `app/models/flow_step.py` com FlowStep (FK para Process e Sector)
- [ ] `app/models/step_resource.py` com StepResource (FK para FlowStep)
- [ ] Enums: `ProcessCategory`, `ProcessStatus`, `ResourceType`
- [ ] Migration única criando todas as tabelas
- [ ] Foreign keys com `ondelete="CASCADE"` apropriado
- [ ] Índices em FKs e em colunas de busca (`process.title`, `process.category`)

**Arquivos permitidos:** `app/models/**`, `alembic/versions/*.py`

**Testes obrigatórios:**
- `test_models_domain.py`: CRUD básico de cada model, cascade delete funciona (deletar Process deleta FlowSteps deleta StepResources)

**Checklist de segurança:**
- [ ] Não há endpoints ainda, só models — sem risco direto

---

### B-15 — Schemas e service de Process (CRUD admin)
Status: TODO
Depende de: B-14, B-12
REQ mapeados: REQ-040, REQ-041, REQ-042

**Objetivo:** Schemas e services para o CRUD de processos pelo admin.

**Critério de pronto:**
- [ ] Schemas em `app/schemas/process.py`: `ProcessCreate`, `ProcessUpdate`, `ProcessAdminView`, `ProcessPublicList`, `ProcessPublicDetail`, `ProcessFullFlow`
- [ ] Service `process_service.py`: `create_process`, `update_process`, `archive_process` (soft delete via status=ARCHIVED), `list_processes_admin`, `get_process_admin`
- [ ] Services recebem o `created_by` explicitamente, não do schema

**Arquivos permitidos:** `app/schemas/process.py`, `app/services/process_service.py`

**Testes obrigatórios:**
- `test_process_service.py`: cobertura de cada função, validação de regras (não editar ARCHIVED, etc.)

**Checklist de segurança:**
- [ ] Schemas de entrada não aceitam `created_by`, `approved_by`, `access_count`, `status` (gerenciados pelo service)

---

### B-16 — Endpoints admin de Process (CRUD)
Status: TODO
Depende de: B-15
REQ mapeados: REQ-040, REQ-041, REQ-042, REQ-100

**Objetivo:** Endpoints do admin para criar/editar/arquivar processos.

**Critério de pronto:**
- [ ] Router `app/routers/admin_processes.py` com:
  - `POST /admin/processes`
  - `PATCH /admin/processes/{id}`
  - `DELETE /admin/processes/{id}` (soft delete → ARCHIVED)
  - `GET /admin/processes` (lista TODOS os processos, incluindo DRAFT/IN_REVIEW/ARCHIVED)
  - `GET /admin/processes/{id}`
- [ ] Todos exigem role ADMIN ou SUPER_ADMIN
- [ ] Novos processos começam em `DRAFT`

**Arquivos permitidos:** `app/routers/admin_processes.py`, `app/main.py`

**Testes obrigatórios:**
- `test_admin_processes.py`:
  - 201: admin cria processo DRAFT
  - 403: user comum tenta criar
  - 200: admin edita processo
  - 200: admin arquiva processo (soft delete)
  - 404: editar processo inexistente

**Checklist de segurança:**
- [ ] `created_by` é pego do usuário autenticado, nunca do body
- [ ] User comum recebe 403 em todos os endpoints

---

### B-17 — Endpoints admin de FlowStep e StepResource
Status: TODO
Depende de: B-16
REQ mapeados: REQ-040, REQ-044

**Objetivo:** Admin adiciona/edita/remove etapas e recursos (documentos, base legal, POP) em processos.

**Critério de pronto:**
- [ ] Endpoints conforme CONTRACTS.md:
  - `POST /admin/processes/{process_id}/steps`
  - `PATCH /admin/processes/{process_id}/steps/{step_id}`
  - `DELETE /admin/processes/{process_id}/steps/{step_id}`
  - `POST /admin/processes/{process_id}/steps/{step_id}/resources`
  - `DELETE /admin/processes/{process_id}/steps/{step_id}/resources/{resource_id}`
- [ ] Reordenação de steps via campo `order` no PATCH
- [ ] Validação: não editar steps de processo ARCHIVED

**Arquivos permitidos:** `app/routers/admin_processes.py`, `app/services/process_service.py`, `app/schemas/process.py`

**Testes obrigatórios:**
- `test_admin_steps_resources.py`: cobertura dos caminhos principais (4 por endpoint mínimo)

**Checklist de segurança:**
- [ ] Validar que `step_id` pertence a `process_id` no path (prevenção de IDOR — Insecure Direct Object Reference)
- [ ] Validar que `resource_id` pertence a `step_id`

---

### B-18 — Fluxo de aprovação de processos
Status: TODO
Depende de: B-16
REQ mapeados: REQ-043, REQ-100

**Objetivo:** Transição de estados DRAFT → IN_REVIEW → PUBLISHED.

**Critério de pronto:**
- [ ] Endpoint `POST /admin/processes/{id}/submit-for-review` (DRAFT → IN_REVIEW)
- [ ] Endpoint `POST /admin/processes/{id}/approve` (IN_REVIEW → PUBLISHED, seta `approved_by`)
- [ ] Transições inválidas levantam erro (ex: aprovar DRAFT direto)
- [ ] **Decisão do MVP**: admin pode aprovar seu próprio processo, mas gera log de auditoria. Discutir na equipe se queremos bloquear.

**Arquivos permitidos:** `app/routers/admin_processes.py`, `app/services/process_service.py`

**Testes obrigatórios:**
- `test_process_approval.py`:
  - DRAFT → IN_REVIEW funciona
  - IN_REVIEW → PUBLISHED funciona e seta approved_by
  - DRAFT → PUBLISHED direto falha
  - PUBLISHED → IN_REVIEW falha

**Checklist de segurança:**
- [ ] Apenas admin pode submit; apenas admin pode approve
- [ ] `approved_by` é setado pelo service, nunca do body

---

## Sprint 3 — Visualização pública de processos

### B-19 — Endpoints públicos de listagem e busca
Status: TODO
Depende de: B-16
REQ mapeados: REQ-010, REQ-011, REQ-012, REQ-020

**Objetivo:** Servidor consulta processos publicados.

**Critério de pronto:**
- [ ] `GET /processes` (lista apenas PUBLISHED)
- [ ] Suporta query params `search` e `category`
- [ ] Busca case-insensitive em title, short_description, category
- [ ] Ordenação default por `access_count` desc
- [ ] Não exige autenticação
- [ ] Response conforme CONTRACTS.md

**Arquivos permitidos:** `app/routers/processes.py`, `app/services/process_service.py`, `app/schemas/process.py`, `app/main.py`

**Testes obrigatórios:**
- `test_public_processes.py`:
  - 200: lista processos sem auth
  - DRAFT/ARCHIVED não aparecem
  - Busca por título funciona
  - Busca case-insensitive
  - Filtro por categoria funciona

**Checklist de segurança:**
- [ ] Endpoint não vaza processos DRAFT/IN_REVIEW/ARCHIVED
- [ ] Query params são validados (categoria é enum)

---

### B-20 — Endpoint GET /processes/{id} (detalhes + incremento de access_count)
Status: TODO
Depende de: B-19
REQ mapeados: REQ-013, REQ-020

**Objetivo:** Detalhes do processo com incremento de contador.

**Critério de pronto:**
- [ ] `GET /processes/{id}` retorna detalhes básicos (sem o fluxo completo)
- [ ] Incrementa `access_count` atomicamente (UPDATE com `access_count + 1`, não SELECT + UPDATE)
- [ ] Não exige auth
- [ ] Apenas processos PUBLISHED são retornados; DRAFT/ARCHIVED → 404

**Arquivos permitidos:** `app/routers/processes.py`, `app/services/process_service.py`

**Testes obrigatórios:**
- `test_process_detail.py`:
  - 200: retorna detalhes
  - access_count incrementa a cada chamada
  - 404: processo DRAFT
  - 404: processo ARCHIVED

**Checklist de segurança:**
- [ ] Increment atômico (não permite race condition)

---

### B-21 — Endpoint GET /processes/{id}/flow (autenticado)
Status: TODO
Depende de: B-20, B-17
REQ mapeados: REQ-014, REQ-015, REQ-016, REQ-017, REQ-018

**Objetivo:** Retornar o fluxo completo com etapas, recursos e setores. Só para usuários autenticados.

**Critério de pronto:**
- [ ] `GET /processes/{id}/flow` retorna `ProcessFullFlow`
- [ ] Inclui todos os steps ordenados por `order`
- [ ] Cada step inclui setor (join) e resources
- [ ] Exige autenticação (`get_current_user`)
- [ ] Apenas PUBLISHED

**Arquivos permitidos:** `app/routers/processes.py`, `app/services/process_service.py`, `app/schemas/process.py`

**Testes obrigatórios:**
- `test_process_flow.py`:
  - 200: user autenticado vê fluxo completo
  - 401: sem token
  - 404: processo DRAFT
  - Steps vêm ordenados corretamente
  - Resources de cada step aparecem

**Checklist de segurança:**
- [ ] Exige autenticação
- [ ] Query otimizada (eager loading de steps + sector + resources) para evitar N+1

---

## Sprint 4 — Progresso do usuário

### B-22 — Model e migration de UserProgress
Status: TODO
Depende de: B-14, B-03
REQ mapeados: REQ-030, REQ-031, REQ-032, REQ-102

**Objetivo:** Model UserProgress.

**Critério de pronto:**
- [ ] `app/models/user_progress.py` com UserProgress
- [ ] Campo `step_statuses: dict` armazenado como JSONB no Postgres
- [ ] Unique constraint em (user_id, process_id) — um progresso por user por processo
- [ ] Migration criada e aplicada

**Arquivos permitidos:** `app/models/user_progress.py`, `alembic/versions/*.py`

**Testes obrigatórios:**
- `test_models_user_progress.py`: criar, atualizar, unique constraint funciona

**Checklist de segurança:**
- [ ] Unique (user_id, process_id) — impede registros duplicados

---

### B-23 — Service e endpoint de GET /progress/{process_id}
Status: TODO
Depende de: B-22, B-21
REQ mapeados: REQ-030, REQ-031, REQ-032

**Objetivo:** Busca ou cria automaticamente o progresso do usuário.

**Critério de pronto:**
- [ ] `app/services/progress_service.py` com `get_or_create_progress(session, user_id, process_id)`
- [ ] Se não existe, cria com todas as etapas do fluxo em status PENDING
- [ ] Se o processo ganhou novos steps desde a criação do progress, os novos são adicionados como PENDING
- [ ] Se algum step foi removido do processo, é removido do step_statuses
- [ ] Endpoint `GET /progress/{process_id}` exige auth e retorna o progress

**Arquivos permitidos:** `app/services/progress_service.py`, `app/routers/progress.py`, `app/schemas/progress.py`, `app/main.py`

**Testes obrigatórios:**
- `test_progress_get.py`:
  - 200: primeira chamada cria progress com tudo em PENDING
  - 200: chamadas subsequentes retornam o mesmo progress
  - Novos steps aparecem em PENDING após atualização do processo
  - 401: sem auth
  - 404: processo inexistente

**Checklist de segurança:**
- [ ] `user_id` vem SEMPRE de `get_current_user`, nunca de query param ou body
- [ ] User A nunca consegue ver progress de User B

---

### B-24 — Endpoint PATCH /progress/{process_id}/steps/{step_id}
Status: TODO
Depende de: B-23
REQ mapeados: REQ-030

**Objetivo:** Atualizar status de uma etapa no progresso pessoal.

**Critério de pronto:**
- [ ] Endpoint PATCH conforme CONTRACTS.md
- [ ] Valida que `step_id` pertence a `process_id`
- [ ] Valida que `status` é um dos 3 valores permitidos
- [ ] Atualiza `last_updated`
- [ ] Retorna o UserProgress completo atualizado

**Arquivos permitidos:** `app/routers/progress.py`, `app/services/progress_service.py`

**Testes obrigatórios:**
- `test_progress_patch.py`:
  - 200: atualiza status
  - 400: status inválido
  - 404: step não pertence ao processo
  - 401: sem auth
  - Verifica que user A não consegue atualizar progress de user B (passando user_id errado)

**Checklist de segurança:**
- [ ] `user_id` do current_user, nunca do body
- [ ] IDOR: valida que step pertence ao processo
- [ ] step_statuses no JSONB é atualizado de forma segura (não sobrescreve o dict inteiro com apenas uma chave)

---

## Sprint 5 — Polimento e deploy

### B-25 — Endpoint GET /super-admin/users (listagem para gestão de papéis)
Status: TODO
Depende de: B-13
REQ mapeados: REQ-007

**Objetivo:** B-13 só expôs `POST /super-admin/users/{id}/promote` e `.../demote`, mas sem um endpoint de listagem o frontend (F-24) não tem como exibir os usuários aprovados com seus papéis atuais para o super_admin escolher. Esta task preenche essa lacuna — identificada ao tentar implementar F-24 e faltar o GET.

**Critério de pronto:**
- [ ] `GET /super-admin/users` exige role `SUPER_ADMIN` (ADMIN e USER recebem 403, sem token recebe 401)
- [ ] Retorna usuários com status `APPROVED`, ordenados alfabeticamente por `name`
- [ ] Cada item contém: `id`, `name`, `email`, `siape`, `sector`, `role`, `created_at`
- [ ] Formato do envelope: `{ "users": [...], "total": N }` (consistente com `/admin/users/pending`)
- [ ] Nunca retorna `password_hash` ou outros campos internos
- [ ] Documentado em `docs/CONTRACTS.md` junto ao bloco de `/super-admin/users/*`

**Arquivos permitidos:** `app/routers/super_admin_users.py`, `app/services/user_service.py` (nova função `list_approved_users`), `app/schemas/user.py` (schemas `UserRoleManagementView` e `UsersRoleManagementListResponse` — ou reuso do que já existe), `tests/test_super_admin_users.py`, `docs/CONTRACTS.md`

**Testes obrigatórios:**
- SUPER_ADMIN lista → 200 com os APPROVED em ordem alfabética
- ADMIN tenta → 403 `FORBIDDEN`
- USER tenta → 403 `FORBIDDEN`
- Sem token → 401 `UNAUTHENTICATED`
- Usuários `PENDING` ou `REJECTED` não aparecem
- Schema de resposta não contém `password_hash`

**Checklist de segurança:**
- [ ] Dependency `require_role(SUPER_ADMIN)` — nunca checar role manualmente no handler
- [ ] Schema Pydantic explícito (não serializar o model SQLModel diretamente)
- [ ] Query parametrizada (sem concatenação de strings)

---

### B-26 — Logs e auditoria
Status: TODO
Depende de: —
REQ mapeados: REQ-071, REQ-073

**Objetivo:** Logging estruturado e auditoria de ações sensíveis.

**Critério de pronto:**
- [ ] `app/core/logging.py` configurando logging estruturado (JSON em prod, legível em dev)
- [ ] Middleware que loga cada request com: método, path, status, duração, user_id (se autenticado), IP
- [ ] Auditoria em ações sensíveis: approve/reject user, promote/demote, approve process, delete process
- [ ] Logs NUNCA incluem senhas, tokens, ou body de requests de auth

**Arquivos permitidos:** `app/core/logging.py`, `app/main.py`, services sensíveis

**Testes obrigatórios:**
- `test_logging.py`: verifica que senhas não aparecem em logs

**Checklist de segurança:**
- [ ] Senhas e tokens nunca aparecem em logs mesmo em caso de erro
- [ ] Body de `/auth/login` e `/auth/register` é mascarado

---

### B-27 — CORS, headers de segurança, configuração de produção
Status: TODO
Depende de: —
REQ mapeados: REQ-071, REQ-073

**Objetivo:** Headers de segurança e CORS restritivo.

**Critério de pronto:**
- [ ] CORS permitindo apenas `FRONTEND_URL` do config
- [ ] Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` em prod
- [ ] Trusted hosts middleware em prod
- [ ] Config separada por environment (dev/test/prod)

**Arquivos permitidos:** `app/main.py`, `app/config.py`

**Testes obrigatórios:**
- `test_security_headers.py`: verifica que headers estão presentes nas respostas

**Checklist de segurança:**
- [ ] CORS nunca aceita `*` em prod
- [ ] Não há "modo debug" ativo em prod

---

### B-28 — Deploy do MVP (Railway ou Render)
Status: TODO
Depende de: B-27, B-26
REQ mapeados: —

**Objetivo:** Backend acessível publicamente para o frontend consumir.

**Critério de pronto:**
- [ ] Projeto provisionado no Railway ou Render
- [ ] Postgres gerenciado provisionado
- [ ] Variáveis de ambiente configuradas (secrets no painel, não no repo)
- [ ] Migrations rodam automaticamente no deploy
- [ ] Seed do super_admin executado uma vez manualmente
- [ ] Health check em `/health` configurado
- [ ] URL do backend compartilhada com o time de frontend

**Arquivos permitidos:** arquivos de deploy (`railway.toml`, `render.yaml`, etc), README

**Testes obrigatórios:**
- Teste manual: `curl https://backend-url/health` retorna 200

**Checklist de segurança:**
- [ ] Secrets configurados no painel, nunca no repo
- [ ] `ENVIRONMENT=production` ativa headers de segurança
- [ ] Postgres não está exposto publicamente
- [ ] CORS apontando para a URL real do frontend

---

## Mapa de dependências (visual)

```
B-00 → B-01 → B-02 → B-03 → B-04 → B-05 → B-06
                              ↓
                              → B-07 → B-08
                              ↓
                       B-09 → B-10
                       ↓
                       B-11
                       ↓
              B-12 → B-13
              ↓
       B-14 → B-15 → B-16 → B-17 → B-18
                              ↓
                       B-19 → B-20 → B-21
                              ↓
                       B-22 → B-23 → B-24
                              ↓
                       B-25 (GET /super-admin/users)
                              ↓
                       B-26, B-27 → B-28
```

## Tasks que podem rodar em paralelo

Dentro de um sprint, estas podem ser atribuídas a pessoas diferentes:

- **Sprint 0**: B-00 sozinho primeiro, depois B-01 e (mais tarde) B-02 em paralelo
- **Sprint 1**: Depois de B-02 e B-03, {B-04 → B-05 → B-06 → B-07 → B-08} é uma cadeia; B-09 pode ser feita em paralelo com a cadeia; B-10 precisa de B-09; B-11 pode ser feita em paralelo depois de B-03
- **Sprint 2**: B-12 e B-14 em paralelo; depois B-15 e B-13 em paralelo; depois B-16, B-17, B-18 em sequência
- **Sprint 3**: B-19 → B-20 → B-21 (cadeia, difícil paralelizar)
- **Sprint 4**: B-22 → B-23 → B-24 (cadeia)
- **Sprint 5**: B-25 (gating para F-24 no frontend); B-26 e B-27 em paralelo depois; B-28 no final
