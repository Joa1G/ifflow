# CLAUDE.md — apps/backend

Você está trabalhando no backend do IFFLOW (sistema de orientação de processos da PROAD/IFAM). Este arquivo define o contexto obrigatório de TODA sessão que toca em `apps/backend/`. Se você for um desenvolvedor humano: leia antes de começar. Se você for o Claude Code: siga rigorosamente.

**Este app vive em um monorepo.** Antes deste arquivo, você já deveria ter lido:
- `/CLAUDE.md` (raiz) — estrutura do monorepo, regras gerais
- `/ARCHITECTURE.md` — decisões arquiteturais (ADRs)

Seu escopo é **exclusivamente** `apps/backend/**`. Não toque em `apps/frontend/**`, mesmo que pareça relacionado. Se a task é cross-stack, ela precisa ser explicitamente marcada como tal.

## Contexto do projeto em 3 frases

Portal institucional onde servidores consultam fluxos de processos administrativos, veem etapas com documentos e base legal, e acompanham um checklist pessoal (que não altera o processo real no SIPAC). O MVP é um piloto na PROAD com o processo de capacitação. A equipe é de 6 estudantes de Engenharia de Software, inexperientes em produção, usando vibe-coding extensivo — então testes e segurança são inegociáveis.

## Princípios de trabalho neste repo

1. **Antes de escrever código, descreva o plano.** Sempre que receber uma task, primeiro responda: "vou criar os arquivos X, Y, modificar Z, e escrever testes para A, B." Só escreva código após a pessoa confirmar.

2. **Testes primeiro.** Para cada endpoint ou função de serviço, escreva o teste antes da implementação. Se a pessoa disser que não precisa, insista uma vez e aceite se ela insistir de volta.

3. **Não invente requisitos.** Se uma task pede "endpoint de login" e você está em dúvida sobre o formato de resposta, consulte `docs/CONTRACTS.md`. Se não estiver lá, PERGUNTE — não decida sozinho.

4. **Não expanda escopo.** Se a task pede um endpoint de listar usuários, não adicione filtros, paginação avançada, ou ordenação "porque é boa prática". Entregue o mínimo pedido.

5. **Não toque em arquivos fora do escopo da task.** Cada task lista os arquivos permitidos. Se você acha que precisa modificar outro, pare e pergunte.

6. **Consulte a task inteira antes de qualquer coisa.** Se a pessoa só colou o título, peça a task completa de `docs/TASKS.md`.

## Stack (fixada, não sugerir alternativas)

- Python 3.12
- FastAPI
- SQLModel (combina SQLAlchemy + Pydantic)
- PostgreSQL 16
- Alembic (migrations)
- Pytest + pytest-asyncio + httpx (testes)
- passlib[argon2] (hash de senha — NÃO bcrypt, NÃO sha256)
- PyJWT (JWT)
- Resend Python SDK (email transacional)
- python-dotenv (variáveis de ambiente)
- Docker + docker-compose

## Estrutura de pastas (obrigatória)

Você está dentro de `apps/backend/`. A estrutura interna é:

```
apps/backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app, middleware, CORS, inclusão de routers
│   ├── config.py               # Settings via pydantic-settings, lê .env
│   ├── database.py             # Engine, session, dependency get_session
│   ├── models/                 # SQLModel models (tabelas)
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── process.py
│   │   ├── flow_step.py
│   │   ├── step_resource.py
│   │   ├── user_progress.py
│   │   └── sector.py
│   ├── schemas/                # Schemas Pydantic para request/response (não tabelas)
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   └── ...
│   ├── routers/                # Endpoints agrupados por recurso
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── processes.py
│   │   └── progress.py
│   ├── services/               # Lógica de negócio (NÃO dentro dos routers)
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── user_service.py
│   │   └── ...
│   ├── core/                   # Segurança, deps, utilitários de baixo nível
│   │   ├── __init__.py
│   │   ├── security.py         # hash_password, verify_password, create_jwt, decode_jwt
│   │   ├── dependencies.py     # get_current_user, require_role, etc
│   │   └── exceptions.py       # Exceções customizadas
│   └── email/                  # Integração com Resend
│       ├── __init__.py
│       ├── client.py
│       └── templates.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # Fixtures: client, session de teste, usuário de teste
│   ├── test_auth.py
│   ├── test_users.py
│   ├── test_processes.py
│   └── test_progress.py
├── alembic/                    # Migrations (gerado pelo alembic init)
├── alembic.ini
├── .env.example                # variáveis específicas do backend
├── Dockerfile
├── pyproject.toml              # Dependências via uv ou pip-tools
├── CLAUDE.md                   # Este arquivo
└── docs/
    ├── CONTRACTS.md            # Contratos de API, formatos, códigos de erro
    ├── TASKS.md                # Lista de tasks (B-00 a B-27)
    └── PR_CHECKLIST.md         # Checklist obrigatório de revisão
```

Note que o `docker-compose.yml` geral e os scripts de dev ficam na **raiz do monorepo**, não aqui. Este diretório contém apenas o código e docs do backend.

**Regras sobre essa estrutura:**
- Routers NÃO contêm lógica de negócio. Eles recebem a request, chamam um service, retornam a response.
- Services NÃO conhecem FastAPI (nada de `HTTPException`, `Depends`). Services levantam exceções customizadas de `core/exceptions.py` que o router traduz para HTTP.
- Models (SQLModel) são as tabelas. Schemas (Pydantic) são os formatos de entrada/saída da API. Nunca retorne um model diretamente — sempre converta para schema.
- Validação de input acontece no schema (Pydantic/Zod-like). Validação de regra de negócio acontece no service.

## Contrato de resposta da API (inegociável)

**Respostas de sucesso**: retornam o objeto diretamente com o status apropriado (200, 201, 204). Nunca envelopar em `{"data": ...}`.

**Respostas de erro**: sempre no formato:

```json
{
  "error": {
    "code": "UPPER_SNAKE_CASE",
    "message": "Mensagem legível em português para o usuário final.",
    "details": {}
  }
}
```

Onde `code` é uma das strings definidas em `docs/CONTRACTS.md`. O frontend usa `code` para decidir o que fazer; `message` é o que o usuário vê.

**Códigos HTTP**:
- 200 OK: operação bem-sucedida com retorno
- 201 Created: recurso criado
- 204 No Content: operação bem-sucedida sem retorno (delete, logout)
- 400 Bad Request: validação de input falhou
- 401 Unauthorized: sem token ou token inválido
- 403 Forbidden: token válido mas sem permissão
- 404 Not Found: recurso inexistente
- 409 Conflict: violação de regra de negócio (ex: email duplicado)
- 422 Unprocessable Entity: FastAPI levanta automaticamente em erros de Pydantic — deixe como está, o frontend trata
- 500 Internal Server Error: bug. Logar e investigar.

## Modelos de dados (conceitual, fonte da verdade)

Estes são os campos mínimos. Cada model detalha em `app/models/*.py` e migrations em `alembic/`.

**User**
- `id`: UUID primary key
- `name`: str
- `email`: str unique, validado como `@ifam.edu.br`
- `siape`: str
- `sector`: str (texto livre por enquanto)
- `password_hash`: str (argon2)
- `role`: enum `USER` | `ADMIN` | `SUPER_ADMIN`
- `status`: enum `PENDING` | `APPROVED` | `REJECTED`
- `created_at`, `updated_at`: timestamps

**Process**
- `id`: UUID
- `title`, `short_description`, `full_description`: str
- `category`: enum (RH, MATERIAIS, FINANCEIRO, TECNOLOGIA, INFRAESTRUTURA, CONTRATACOES)
- `estimated_time`: str (texto livre, ex: "30 a 45 dias")
- `requirements`: list[str] (JSON array)
- `access_count`: int default 0
- `status`: enum `DRAFT` | `IN_REVIEW` | `PUBLISHED` | `ARCHIVED`
- `created_by`, `approved_by`: FK para User
- timestamps

**FlowStep**
- `id`: UUID
- `process_id`: FK Process
- `order`: int (ordem no fluxo)
- `sector_id`: FK Sector (para swimlanes)
- `title`, `description`: str
- `responsible`: str
- `estimated_time`: str
- timestamps

**StepResource**
- `id`: UUID
- `step_id`: FK FlowStep
- `type`: enum `DOCUMENT` | `LEGAL_BASIS` | `POP` | `LINK`
- `title`: str
- `url`: str (nullable)
- `content`: text (nullable, para base legal inline)
- timestamps

**UserProgress**
- `id`: UUID
- `user_id`: FK User
- `process_id`: FK Process
- `step_statuses`: JSON (dict de step_id → `PENDING` | `IN_PROGRESS` | `COMPLETED`)
- `last_updated`: timestamp

**Sector**
- `id`: UUID
- `name`: str
- `acronym`: str (ex: "PROAD", "DGP")

## Segurança: regras inegociáveis

Estas regras são AUDITADAS no `PR_CHECKLIST.md`. Violar qualquer uma = PR rejeitado.

1. **Senhas**: sempre hash com argon2 via passlib. Nunca sha256, nunca md5, nunca salve plaintext.

2. **JWT**: assinado com HS256, chave em variável de ambiente `JWT_SECRET` (mínimo 32 bytes random). Payload contém apenas `user_id`, `role`, `exp`. Expiração de 24h no MVP. Nunca coloque dados sensíveis no payload (não é criptografado, é só base64).

3. **Autorização em endpoints**: use as dependencies `get_current_user` e `require_role` de `app/core/dependencies.py`. Nunca checar `request.headers["Authorization"]` manualmente.

4. **SQL injection**: nunca concatene strings em queries. Use sempre a sintaxe do SQLModel/SQLAlchemy (`select(User).where(User.email == email)`).

5. **Mass assignment**: nunca faça `user = User(**request.json())`. Use sempre um schema Pydantic específico de entrada (`UserCreate`, `UserUpdate`) que lista explicitamente os campos aceitos. Isso impede um atacante de mandar `{"role": "SUPER_ADMIN"}` no cadastro.

6. **CORS**: permitir apenas o domínio do frontend em produção. Em dev, `http://localhost:5173`. Nunca `*`.

7. **Rate limiting em endpoints de auth**: login e reset de senha precisam de rate limit. Use `slowapi`. Limite: 5 tentativas por minuto por IP em `/auth/login`, 3 por hora em `/auth/request-password-reset`.

8. **Secrets**: nunca commit em `.env`. O repo tem `.env.example` com nomes das variáveis e valores fake. `.env` está no `.gitignore`.

9. **Logs**: nunca logar senhas, tokens, ou o body completo de requests de auth. Se precisar logar para debug, mascare.

10. **LGPD**: endpoints de deletar conta devem deletar de verdade (não soft delete do usuário — soft delete é só para Process). Comentar nos endpoints relacionados a dados pessoais.

## Testes: regras inegociáveis

1. **Cobertura mínima de services e routers: 70%.** Configurar coverage no CI e falhar o build abaixo disso.

2. **Cada endpoint tem no mínimo 4 testes**:
   - Caminho feliz (200/201)
   - Input inválido (400/422)
   - Sem autenticação quando necessária (401)
   - Sem permissão quando necessária (403)

3. **Testes usam um banco separado**, subido via fixture em `conftest.py`. Nunca rodar testes contra o banco de dev.

4. **Fixtures padrão que devem existir em `conftest.py`**:
   - `client`: TestClient do FastAPI
   - `session`: sessão de banco de teste
   - `user_fixture`: um User aprovado, role USER
   - `admin_fixture`: User aprovado, role ADMIN
   - `super_admin_fixture`: User aprovado, role SUPER_ADMIN
   - `auth_headers_user`, `auth_headers_admin`, `auth_headers_super_admin`: headers com JWT pronto

5. **Testes rodam em CI a cada push e a cada PR.** PR com teste quebrado não pode ser mergeado.

6. **Ao modificar um endpoint existente**, atualize os testes existentes E adicione um novo teste para a mudança.

## Como rodar o backend

Da **raiz do monorepo** (recomendado):

```bash
./scripts/dev.sh                     # sobe backend + frontend juntos
# ou só o backend:
docker compose up -d db              # sobe Postgres
cd apps/backend && uvicorn app.main:app --reload
```

De dentro de `apps/backend/`:

```bash
# Primeira vez
cp ../../.env.example ../../.env     # .env fica na raiz do monorepo
# editar .env com valores reais
alembic upgrade head
python -m app.scripts.seed_super_admin  # cria o super_admin inicial

# Rodar
uvicorn app.main:app --reload

# Rodar testes
pytest
pytest --cov=app --cov-report=term-missing

# Nova migration após mudar model
alembic revision --autogenerate -m "descricao_curta"
alembic upgrade head
```

**Nota sobre o `.env`**: o monorepo usa um único `.env` na raiz que contém variáveis de todos os apps. O backend lê `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, etc. O frontend lê `VITE_API_URL`. Isso simplifica o setup.

## Documentação adicional

- `docs/CONTRACTS.md` — formatos de request/response, códigos de erro, todos os endpoints
- `docs/TASKS.md` — lista de tasks, status, dependências
- `docs/PR_CHECKLIST.md` — checklist obrigatório de revisão

## Lembrete final

Este projeto tem o risco muito alto de virar um monte de código gerado que ninguém entende. Sua responsabilidade como agente é AJUDAR O HUMANO A ENTENDER o que você escreve, não impressioná-lo com velocidade. Quando em dúvida, explique mais. Quando o humano pedir velocidade sobre qualidade, lembre-o dos requisitos de segurança deste arquivo.
