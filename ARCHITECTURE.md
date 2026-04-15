# ARCHITECTURE.md — IFFLOW

**Este arquivo é contexto para o Claude Code.** Contém as decisões arquiteturais do sistema que não devem ser questionadas durante o MVP. Toda sessão que toque em modelagem, fluxo, ou integração deve ter este arquivo em contexto.

Localização canônica: `ifflow/ARCHITECTURE.md` (raiz do monorepo).

---

## Regra #0 — O que NÃO fazer

- **NÃO** questione decisões marcadas como `ADR` abaixo. Se você (agente) acha que uma decisão está errada, PARE e peça confirmação humana antes de propor alternativa.
- **NÃO** introduza novas camadas arquiteturais (microservices, message queue, cache Redis, GraphQL) sem autorização. O MVP é monolito síncrono.
- **NÃO** otimize prematuramente. Se um endpoint lento aparecer, a decisão é humana — não adicione Redis por conta própria.
- **NÃO** duplique lógica entre frontend e backend. Validação de negócio é do backend. Validação de forma (Zod no frontend, Pydantic no backend) é local, mas regras de negócio ficam só no backend.
- **NÃO** adicione dependências não listadas no CLAUDE.md sem passar pelo processo de ADR.

---

## Visão geral em uma frase

IFFLOW é um monolito FastAPI + React + Postgres, onde o backend é stateless (escala horizontalmente no futuro), o frontend é uma SPA estática, e ambos se comunicam via HTTPS/JSON usando JWT para autenticação.

## Diagrama de componentes

```
┌─────────────────────┐         ┌──────────────────────┐
│   Navegador do      │  HTTPS  │   CDN / Static Host  │
│   servidor IFAM     │◄────────┤   (Vercel/Netlify)   │
│                     │         │                      │
│   React SPA         │         │   apps/frontend      │
│   - Zustand (auth)  │         │   (build estático)   │
│   - TanStack Query  │         └──────────────────────┘
│   - shadcn/ui       │
└──────────┬──────────┘
           │ HTTPS/JSON + JWT
           │
           ▼
┌─────────────────────────────────────────────────────┐
│             Backend (Railway/Render)                │
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │  FastAPI (stateless)                        │   │
│   │  ├─ Routers (HTTP)                          │   │
│   │  ├─ Services (lógica de negócio)            │   │
│   │  ├─ Models (SQLModel, tabelas)              │   │
│   │  └─ Core (security, deps)                   │   │
│   └─────────────┬───────────────────────────────┘   │
│                 │                                   │
│                 │                                   │
│   ┌─────────────▼──────────┐    ┌──────────────┐   │
│   │   PostgreSQL 16        │    │   Resend     │   │
│   │   (gerenciado)         │    │   (email API)│   │
│   └────────────────────────┘    └──────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Componentes externos**:
- **PostgreSQL gerenciado** (Railway/Render provisiona): fonte da verdade de todos os dados.
- **Resend**: envio de emails transacionais (aprovação de cadastro, reset de senha). 3000 emails/mês no tier grátis.

**Componentes NÃO presentes (e isso é intencional)**:
- Redis / cache externo
- Message queue (RabbitMQ, SQS)
- Object storage (S3) — sem upload de arquivos no MVP
- Serviço de autenticação externo (Auth0, Cognito) — JWT próprio
- Busca externa (Elasticsearch) — busca é `ILIKE` no Postgres

---

## Fluxo de requisição típico

```
1. Usuário clica "Aprovar cadastro" no frontend
2. React component chama useApproveUser().mutate(userId)
3. Hook chama api-client.apiPost('/admin/users/{id}/approve')
4. api-client adiciona Authorization: Bearer <token> lido do Zustand
5. Requisição HTTPS chega no FastAPI
6. Middleware de rate limit verifica
7. Dependency get_current_user decodifica o JWT, busca o user no DB
8. Dependency require_role(ADMIN, SUPER_ADMIN) valida a role
9. Router chama user_service.approve_user(session, user_id, requester)
10. Service:
    a. Busca o user-alvo, verifica se está PENDING
    b. Atualiza status para APPROVED
    c. Chama email.send_email com template de aprovação
    d. Commit
    e. Retorna o user atualizado
11. Router serializa via schema UserAdminView e retorna JSON
12. TanStack Query invalida ['admin', 'pending-users']
13. React re-renderiza a lista, removendo o card aprovado
14. Toast "Cadastro aprovado com sucesso"
```

Este é o padrão canônico. Qualquer fluxo que envolva mutação de dados segue essa estrutura.

---

## Modelo de dados (ER textual)

```
┌──────────────┐
│    User      │
├──────────────┤
│ id (PK)      │
│ name         │
│ email (uk)   │
│ siape        │
│ sector       │
│ password_hash│
│ role         │──┐ enum: USER, ADMIN, SUPER_ADMIN
│ status       │──┤ enum: PENDING, APPROVED, REJECTED
│ created_at   │  │
│ updated_at   │  │
└──────┬───────┘  │
       │          │
       │ 1        │
       │          │
       │ N        │
┌──────▼──────────▼──┐      ┌───────────────┐
│   UserProgress     │      │ PasswordReset │
├────────────────────┤      │     Token     │
│ id (PK)            │      ├───────────────┤
│ user_id (FK) ─────┐│      │ id (PK)       │
│ process_id (FK) ──┼┘      │ user_id (FK)  │
│ step_statuses (JSON)│     │ token_hash    │
│ last_updated       │     │ expires_at    │
└────────┬───────────┘      │ used_at       │
         │                  └───────────────┘
         │
         ▼ belongs_to
┌──────────────┐
│   Process    │
├──────────────┤
│ id (PK)      │
│ title        │
│ short_desc   │
│ full_desc    │
│ category     │──── enum: RH, MATERIAIS, FINANCEIRO,
│ estimated_time│         TECNOLOGIA, INFRAESTRUTURA,
│ requirements  │         CONTRATACOES
│  (JSON array) │
│ access_count  │
│ status        │──── enum: DRAFT, IN_REVIEW, PUBLISHED, ARCHIVED
│ created_by (FK User)
│ approved_by (FK User nullable)
│ created_at    │
│ updated_at    │
└──────┬───────┘
       │ 1
       │
       │ N
┌──────▼────────┐        ┌───────────────┐
│   FlowStep    │   N   1│    Sector     │
├───────────────┤────────├───────────────┤
│ id (PK)       │        │ id (PK)       │
│ process_id(FK)│        │ name          │
│ sector_id (FK)│        │ acronym       │
│ order         │        └───────────────┘
│ title         │
│ description   │
│ responsible   │
│ estimated_time│
│ created_at    │
│ updated_at    │
└──────┬────────┘
       │ 1
       │
       │ N
┌──────▼──────────┐
│  StepResource   │
├─────────────────┤
│ id (PK)         │
│ step_id (FK)    │
│ type            │──── enum: DOCUMENT, LEGAL_BASIS, POP, LINK
│ title           │
│ url (nullable)  │
│ content (text, nullable)
│ created_at      │
│ updated_at      │
└─────────────────┘
```

**Relacionamentos-chave**:
- `User 1–N UserProgress` — cada usuário tem um progresso por processo
- `User 1–N Process (created_by)` — admin criador
- `Process 1–N FlowStep` — CASCADE DELETE
- `FlowStep N–1 Sector` — agrupamento de swimlane
- `FlowStep 1–N StepResource` — CASCADE DELETE
- `UserProgress N–1 Process` — unique (user_id, process_id)

**Decisões de modelagem importantes**:
- `step_statuses` é JSONB em vez de tabela separada. Ver ADR-005.
- `requirements` é JSON array em vez de tabela. Ver ADR-006.
- Soft delete apenas em Process (via `status=ARCHIVED`). User rejeitado fica como `status=REJECTED`. Ver ADR-007.

---

## Fluxos críticos passo a passo

### Fluxo 1 — Cadastro e aprovação

```
Servidor                Frontend              Backend              Email
   │                      │                     │                    │
   │ preenche form        │                     │                    │
   ├─────────────────────►│                     │                    │
   │                      │ POST /auth/register │                    │
   │                      ├────────────────────►│                    │
   │                      │                     │ cria User PENDING  │
   │                      │                     │ (sem token)        │
   │                      │ 201 + mensagem      │                    │
   │                      │◄────────────────────┤                    │
   │ vê tela "aguarde"    │                     │                    │
   │◄─────────────────────┤                     │                    │
   │                      │                     │                    │
   │        ... tempo passa ...                  │                    │
   │                      │                     │                    │
Admin                     │                     │                    │
   │ acessa /admin/users  │                     │                    │
   ├─────────────────────►│                     │                    │
   │                      │ GET /admin/users/pending                 │
   │                      ├────────────────────►│                    │
   │                      │ lista pending       │                    │
   │                      │◄────────────────────┤                    │
   │ clica "Aprovar"      │                     │                    │
   ├─────────────────────►│                     │                    │
   │                      │ POST /admin/users/{id}/approve           │
   │                      ├────────────────────►│                    │
   │                      │                     │ user.status = APPROVED
   │                      │                     ├──────────────────► │ send_email
   │                      │ 200                 │                    │
   │                      │◄────────────────────┤                    │
   │                      │                     │                    │
Servidor                  │                     │                    │
   │ recebe email         │                     │                    │
   │◄───────────────────────────────────────────────────────────────┤
   │ faz login            │                     │                    │
   ├─────────────────────►│ POST /auth/login    │                    │
   │                      ├────────────────────►│                    │
   │                      │ 200 + token         │                    │
   │                      │◄────────────────────┤                    │
```

**Pontos críticos**:
- Cadastro **não** retorna token. Login só funciona após approval.
- Email é side effect do service `approve_user` — se o Resend falhar, decidir: (a) rollback e 500, ou (b) log e seguir. **Decisão MVP**: (b) — o user já está APPROVED, email é nice-to-have. Logar erro.

### Fluxo 2 — Visualização de fluxo e atualização de progresso

```
Servidor         Frontend           Backend
   │                │                   │
   │ clica processo │                   │
   ├───────────────►│ GET /processes/{id}
   │                ├──────────────────►│ access_count += 1
   │                │◄──────────────────┤ retorna detalhes
   │ clica "Ver fluxo"                  │
   ├───────────────►│ navega /processes/{id}/flow
   │                │ GET /processes/{id}/flow (auth)
   │                ├──────────────────►│
   │                │◄──────────────────┤ fluxo completo
   │                │ GET /progress/{id}│
   │                ├──────────────────►│ cria progress se não existe
   │                │◄──────────────────┤ step_statuses
   │ marca etapa    │                   │
   │ "Concluída"    │                   │
   ├───────────────►│ PATCH /progress/{id}/steps/{step_id}
   │                ├──────────────────►│ atualiza JSONB
   │                │◄──────────────────┤ progress atualizado
   │                │ TanStack Query    │
   │                │ invalida cache    │
   │ vê badge verde │                   │
   │◄───────────────┤                   │
```

**Pontos críticos**:
- A primeira chamada a `/progress/{id}` cria o progresso automaticamente. Frontend não precisa criar explicitamente.
- `access_count` incrementa a cada GET no detalhe — **não** incrementa na listagem (ver ADR-008).
- `user_id` do progress vem do JWT, nunca do body/query. Um user A **não consegue** tocar no progress de B.

---

## Architectural Decision Records (ADRs)

ADRs numerados. Cada um explica **por que** uma decisão foi tomada, para que o próximo agente/dev não reabra a discussão. Formato: Status, Contexto, Decisão, Consequências.

### ADR-001 — Monolito síncrono FastAPI
**Status**: Aceito

**Contexto**: Equipe de 6 estudantes, projeto pedagógico com prazo. Alternativas consideradas: microservices, arquitetura serverless.

**Decisão**: Monolito único em FastAPI. Routers agrupados por recurso, services isolados, banco único.

**Consequências**:
- (+) Simples de raciocinar, debugar, testar
- (+) Deploy único
- (−) Escala vertical até ~100 req/s (suficiente para piloto)
- (−) Mudar para microservices depois exige refactor — aceitável pelo horizonte do projeto

### ADR-002 — JWT stateless sem refresh token
**Status**: Aceito

**Contexto**: Autenticação precisa ser simples. Alternativas: sessões no banco, refresh tokens, OAuth.

**Decisão**: JWT HS256 com expiração de 24h, sem refresh token. Logout apenas limpa o token no frontend; backend não mantém blacklist.

**Consequências**:
- (+) Backend stateless, fácil escalar
- (+) Implementação simples
- (−) Não há revogação imediata de token — se um token vazar, fica válido até expirar
- (−) Usuário precisa fazer login a cada 24h
- **Mitigação de risco**: expiração curta (24h em vez de 7 dias típicos); rate limit no login; HTTPS obrigatório em prod

### ADR-003 — argon2 para hash de senha
**Status**: Aceito

**Contexto**: Precisamos hashear senhas. Alternativas: bcrypt (tradicional), scrypt, PBKDF2.

**Decisão**: argon2id via passlib. Parâmetros padrão do passlib.

**Consequências**:
- (+) Estado da arte em hash de senha — vencedor do Password Hashing Competition
- (+) Resistente a GPU e ASICs
- (−) Um pouco mais lento que bcrypt em startup (aceitável)

### ADR-004 — SQLModel em vez de SQLAlchemy puro
**Status**: Aceito

**Contexto**: Precisa de ORM. Alternativas: SQLAlchemy 2.0, Tortoise ORM, Peewee.

**Decisão**: SQLModel (mesmo autor do FastAPI), que combina SQLAlchemy 2.0 + Pydantic.

**Consequências**:
- (+) Menos boilerplate — model de banco e schema Pydantic no mesmo lugar
- (+) Integra bem com FastAPI
- (−) Projeto mais novo, menos material que SQLAlchemy puro
- (−) Para queries complexas, pode precisar cair no SQLAlchemy subjacente — aceitável

### ADR-005 — `step_statuses` como JSONB em vez de tabela
**Status**: Aceito

**Contexto**: Precisamos guardar status (PENDING/IN_PROGRESS/COMPLETED) de cada etapa para cada usuário. Alternativas: (a) tabela `user_step_status` com uma linha por (user, step), (b) campo JSONB no UserProgress.

**Decisão**: JSONB em `UserProgress.step_statuses`. Dict `{step_id: status}`.

**Consequências**:
- (+) Menos joins — um GET no progress traz tudo
- (+) Update atômico de todo o progresso em uma query
- (−) Não dá para indexar por step facilmente — aceitável (consulta é sempre por user_id + process_id)
- (−) Se um step é removido do process, precisa limpar do JSONB — ver task B-23

### ADR-006 — `requirements` como JSON array
**Status**: Aceito

**Contexto**: Processo tem lista de requisitos. Alternativas: tabela `process_requirements`, JSON array.

**Decisão**: JSON array de strings no Process.

**Consequências**:
- (+) Simples, raramente consultado isoladamente
- (−) Não dá para pesquisar por requisito individual — OK, nunca será feito

### ADR-007 — Soft delete só em Process, hard delete em outras entidades
**Status**: Aceito

**Contexto**: LGPD exige direito ao esquecimento. Alternativas: soft delete universal, hard delete universal, híbrido.

**Decisão**:
- `Process`: soft delete via `status=ARCHIVED` (preserva progresso histórico)
- `User`: hard delete quando usuário solicita (LGPD). `REJECTED` é status, não deleção.
- `UserProgress`: deletado em cascade com User
- `FlowStep`, `StepResource`: deletados em cascade com Process

**Consequências**:
- (+) Compliance LGPD
- (+) Simples de raciocinar por entidade
- (−) Histórico de quem já foi APPROVED e depois deletou a conta não fica preservado — aceitável

### ADR-008 — `access_count` só no GET de detalhe
**Status**: Aceito

**Contexto**: Queremos saber popularidade dos processos para ordenação.

**Decisão**: Incrementar `access_count` apenas no endpoint `GET /processes/{id}`, não em `GET /processes` (listagem).

**Consequências**:
- (+) Reflete interesse real (abrir para ver detalhes), não só scroll
- (+) Não inflaciona contador com visitas de busca
- (−) Um usuário que só lê o card da listagem não conta — aceitável

### ADR-009 — Busca com ILIKE no Postgres (sem Elasticsearch)
**Status**: Aceito

**Contexto**: Precisa de busca por texto em título e descrição. Alternativas: `ILIKE`, `tsvector` do Postgres, Elasticsearch.

**Decisão**: `ILIKE '%termo%'` no MVP.

**Consequências**:
- (+) Zero infra extra
- (−) Lento se a tabela crescer muito (>10k processos) — MVP terá ~20 processos
- **Plano futuro**: se precisar, migrar para `tsvector` + `GIN index` (ainda Postgres, sem Elasticsearch)

### ADR-010 — Frontend consome OpenAPI gerado (em monorepo)
**Status**: Aceito

**Contexto**: Precisa manter tipos do frontend sincronizados com o backend. Com o monorepo (ver ADR-012 revisado), o backend está disponível localmente, o que simplifica a sincronização.

**Decisão**: Backend expõe OpenAPI automaticamente (FastAPI gera em `/openapi.json`). Frontend usa `openapi-typescript` para gerar `apps/frontend/src/types/api.ts`. O script `scripts/sync-api-types.sh` (na raiz do monorepo) sobe o backend local temporariamente, busca o schema, e regenera os tipos. Tipos gerados são versionados no Git.

**Consequências**:
- (+) Zero divergência de tipos
- (+) Breaking changes do backend aparecem como erros de TypeScript em tempo de compilação do frontend
- (+) Por ser monorepo, não há necessidade de deploy intermediário — sincronização é local
- (−) Desenvolvedor precisa rodar o script antes de tasks que dependem de endpoint novo — documentado em `CLAUDE.md` raiz

### ADR-011 — Zustand apenas para auth, TanStack Query para o resto
**Status**: Aceito

**Contexto**: Precisa de estado global. Alternativas: Redux, Zustand global, Context API, TanStack Query.

**Decisão**: Zustand **apenas** para auth store (token, user). Todo dado vindo da API vive no cache do TanStack Query. Nada de duplicação.

**Consequências**:
- (+) Cache, invalidation e refetch automáticos
- (+) Impossível dessincronizar cache do Zustand (porque não existe)
- (−) Desenvolvedores precisam entender TanStack Query — parte da curva de aprendizado

### ADR-012 — Monorepo com dois apps (backend e frontend)
**Status**: Aceito (revisado em 14/04 — decisão anterior era dois repos separados)

**Contexto**: Equipe com 6 pessoas, vibe-coding extensivo, projeto pedagógico com prazo. Alternativas: dois repos separados, monorepo manual, monorepo com Turborepo/Nx.

**Histórico**: A decisão inicial foi por dois repos separados. Durante o planejamento, ficou claro que o risco de dessincronização entre backend e frontend (tipos de API, estado de implementação, mudanças cross-stack) seria alto demais para uma equipe inexperiente em produção. A sincronização por dois repos exigiria um mecanismo manual (arquivos de status atualizados à mão) que depende de disciplina que a equipe ainda está aprendendo.

**Decisão**: Monorepo manual (sem Turborepo/Nx) com estrutura `apps/backend/` e `apps/frontend/`. Um único repositório Git. CI separado por app via `paths:` filters do GitHub Actions. Deploy separado por app (ambas as plataformas — Railway/Render/Vercel/Netlify — suportam "root directory").

**Consequências**:
- (+) Mudanças cross-stack em um único PR — reviewer vê os dois lados juntos
- (+) `git pull` traz tudo — nunca há "esqueci de puxar do outro repo"
- (+) Tipos do OpenAPI gerados localmente em segundos, sem depender de backend deployado
- (+) Uma única fonte de verdade para tasks, docs, issues
- (+) Elimina a necessidade de `TASKS_STATUS.md` e scripts de sync complexos
- (−) CI precisa de `paths:` filters para não rodar testes desnecessários — trivial de configurar
- (−) Histórico do Git fica misturado (mudanças de front e back intercaladas) — aceitável
- (−) Se o projeto crescer para >2 apps ou equipe >20 pessoas, pode precisar de Turborepo — não é o caso do MVP

**Por que manual em vez de Turborepo**: Turborepo resolve problemas de cache distribuído, build paralelo e orquestração que um projeto de 2 apps não tem. Manual é 2 arquivos de configuração + scripts bash. Zero dependência nova para a equipe aprender.

### ADR-013 — Sem message queue nem jobs assíncronos
**Status**: Aceito

**Contexto**: Emails transacionais podem demorar.

**Decisão**: Chamada ao Resend é síncrona dentro do handler. Se falhar, logar e continuar (a ação principal já foi persistida).

**Consequências**:
- (+) Zero infra extra
- (−) Um request de "aprovar cadastro" pode demorar ~500ms por causa do email — aceitável
- **Plano futuro**: se email virar gargalo, adicionar fila (Celery + Redis) pós-MVP

### ADR-014 — Monorepo manual sem Turborepo/Nx
**Status**: Aceito

**Contexto**: Consequência de ADR-012 (monorepo). Precisa decidir se usa ferramenta especializada.

**Decisão**: Configuração manual. Dois diretórios em `apps/`, cada um com seu próprio `package.json` / `pyproject.toml`. Scripts em bash na pasta `scripts/`. CI do GitHub Actions com `paths:` filters para rodar testes só no app afetado.

**Consequências**:
- (+) Zero dependência nova para a equipe aprender
- (+) Setup em minutos, não horas
- (+) Problemas de CI são debugáveis em bash, não em arquivos de configuração de ferramenta terceira
- (−) Sem cache distribuído de builds (irrelevante para 2 apps pequenos)
- (−) Sem orquestração de dependências entre apps (também irrelevante — apps são independentes)

**Revisitar se**: o projeto adicionar um terceiro app, ou builds locais começarem a levar mais de 2 minutos.

---

## Segurança — resumo do modelo de ameaças

Estas são as ameaças que estamos **explicitamente** protegendo contra. Qualquer contribuição deve considerar se introduz novo vetor.

| Ameaça | Mitigação |
|---|---|
| SQL injection | SQLModel/SQLAlchemy parametrizado em todas as queries |
| XSS | React escapa por default; proibido `dangerouslySetInnerHTML` sem sanitize |
| CSRF | JWT em header Authorization (não cookie) — imune a CSRF clássico |
| Mass assignment | Schemas Pydantic explícitos, `extra="forbid"` |
| IDOR | `user_id` sempre do JWT, validação de ownership em recursos aninhados |
| Brute force em login | Rate limit via slowapi, mensagem genérica |
| Vazamento de existência de conta | `/auth/request-password-reset` sempre retorna 200 |
| Senha fraca | Validação mínima no backend (Pydantic) e frontend (Zod) |
| JWT vazado | Expiração de 24h, HTTPS obrigatório, sem refresh token |
| Token de reset reutilizado | Tabela `password_reset_tokens` com `used_at`, expiração 1h |
| Escalação de privilégio | `require_role` dependency, role vem do JWT não do body |
| Auto-rebaixamento super_admin | Validação no service — não permite rebaixar a si mesmo |
| Email phishing | Email tem link com token aleatório criptograficamente seguro |
| Dados pessoais em logs | Logger mascara `/auth/login`, `/auth/register` bodies |
| Exposição de stack trace | Exception handlers customizados, `ENVIRONMENT=production` esconde detalhes |

**Ameaças aceitas (fora de escopo do MVP)**:
- DDoS distribuído — depende de infra do host
- Side-channel timing attacks além do login — improvável em contexto institucional
- Compromisso do host (Railway/Render) — confiamos no provedor
- Insider threat (admin mal-intencionado) — audit log ajuda mas não previne

---

## Estratégia de testes

**Backend**:
- Unit tests de services (com session de teste, sem FastAPI)
- Integration tests de routers via TestClient
- Cobertura mínima de 70% em `app/services` e `app/routers`
- Fixtures centrais em `conftest.py`

**Frontend**:
- Unit tests de hooks (com MSW mockando API)
- Unit tests de validators Zod
- Component tests de formulários críticos
- Sem E2E no MVP (Playwright é pós-MVP se sobrar tempo)

**Integração cross-stack**:
- Tipos gerados do OpenAPI atuam como "contract test" — se backend muda um schema, frontend quebra em compile time
- Um smoke test manual após cada deploy: login → listar processos → ver fluxo → marcar etapa

---

## Deploy e ambientes

**Ambientes**:
- `dev`: local, Docker Compose (backend + Postgres + frontend em Vite)
- `test`: CI (GitHub Actions), Postgres em container, Resend mockado
- `prod`: Railway/Render para backend, Vercel/Netlify para frontend, Postgres gerenciado

**Variáveis críticas** (backend):
- `DATABASE_URL` — string de conexão Postgres
- `JWT_SECRET` — 32+ bytes random
- `RESEND_API_KEY` — chave do Resend
- `FRONTEND_URL` — URL do frontend (para CORS)
- `ENVIRONMENT` — `development` | `test` | `production`

**Variáveis críticas** (frontend):
- `VITE_API_URL` — URL do backend

**CI/CD** (monorepo):
- Push em `main` → deploy automático de cada app separadamente
- Backend e frontend têm workflows independentes em `.github/workflows/backend-ci.yml` e `frontend-ci.yml`
- Cada workflow usa `paths:` filter — `backend-ci.yml` só roda em mudanças dentro de `apps/backend/**`, `frontend-ci.yml` só em `apps/frontend/**`
- Mudanças em arquivos da raiz (docs, scripts) não disparam CI dos apps
- PR → roda testes, lint, build do(s) app(s) afetado(s) — bloqueia merge se falhar
- Migrations rodam automaticamente no deploy (backend)
- **Deploy**: Railway/Render/Vercel/Netlify suportam "root directory" — aponte cada serviço para `apps/backend/` ou `apps/frontend/` nas configurações da plataforma

**Variáveis de ambiente**: todas ficam no painel da plataforma de deploy, nunca no repo. Arquivo `.env.example` na raiz do monorepo documenta quais variáveis existem (com valores placeholder).

---

## O que fazer quando encontrar ambiguidade

Se você (agente) está implementando algo e encontra uma situação não coberta aqui:

1. **NÃO decida sozinho.** Pergunte ao humano.
2. Proponha 2 opções com consequências, não 1 "melhor caminho".
3. Referencie o ADR mais próximo como base.
4. Se o humano decidir, sugira criar um ADR novo (ADR-015, 016...) para preservar a decisão.

Este documento cresce conforme decisões novas aparecem. Ele não está "pronto" — está vivo.
