# CONTRACTS.md — apps/backend

Este documento é a **fonte da verdade** para formatos de request/response. Em caso de discordância entre código e este documento, este documento manda — ajuste o código.

O FastAPI gera o OpenAPI automaticamente em `/openapi.json` e uma UI em `/docs`. **Mantenha os schemas Pydantic alinhados com este documento**, porque o frontend gera tipos TypeScript a partir do OpenAPI gerado.

## Formato geral

- Todas as respostas de sucesso retornam o objeto diretamente (sem envelope `{"data": ...}`).
- Todas as respostas de erro seguem o formato do `ErrorResponse` abaixo.
- Todos os timestamps são ISO 8601 em UTC.
- Todos os IDs são UUIDs v4 em string.

## Schema de erro

```json
{
  "error": {
    "code": "UPPER_SNAKE_CASE",
    "message": "Mensagem legível em português",
    "details": {}
  }
}
```

## Códigos de erro padrão

| Código | HTTP | Quando usar |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input falhou validação de schema |
| `INVALID_CREDENTIALS` | 401 | Login com email/senha errados |
| `UNAUTHENTICATED` | 401 | Sem token ou token expirado |
| `INVALID_TOKEN` | 401 | Token malformado ou assinatura inválida |
| `ACCOUNT_PENDING` | 403 | Cadastro ainda não aprovado pelo admin |
| `ACCOUNT_REJECTED` | 403 | Cadastro rejeitado pelo admin |
| `FORBIDDEN` | 403 | Usuário autenticado mas sem permissão |
| `NOT_FOUND` | 404 | Recurso inexistente |
| `EMAIL_ALREADY_EXISTS` | 409 | Email já cadastrado |
| `INVALID_EMAIL_DOMAIN` | 400 | Email não é @ifam.edu.br |
| `WEAK_PASSWORD` | 400 | Senha não atende requisitos |
| `RATE_LIMITED` | 429 | Muitas tentativas |
| `INTERNAL_ERROR` | 500 | Bug no servidor |

## Endpoints — Autenticação

### POST /auth/register

Cria um novo cadastro em status `PENDING`. NÃO faz login automático.

**Request:**
```json
{
  "name": "João da Silva",
  "email": "joao.silva@ifam.edu.br",
  "siape": "1234567",
  "sector": "PROAD",
  "password": "minhasenha123",
  "password_confirmation": "minhasenha123"
}
```

**Validações:**
- `email` deve terminar em `@ifam.edu.br` → erro `INVALID_EMAIL_DOMAIN`
- `email` não pode estar cadastrado → erro `EMAIL_ALREADY_EXISTS`
- `password` mínimo 8 caracteres → erro `WEAK_PASSWORD`
- `password == password_confirmation` → erro `VALIDATION_ERROR`
- `siape` não é validado além de ser string não vazia no MVP

**Response 201:**
```json
{
  "id": "uuid",
  "name": "João da Silva",
  "email": "joao.silva@ifam.edu.br",
  "status": "PENDING",
  "message": "Cadastro recebido. Aguarde aprovação do administrador."
}
```

### POST /auth/login

**Request:**
```json
{
  "email": "joao.silva@ifam.edu.br",
  "password": "minhasenha123"
}
```

**Validações:**
- Credenciais corretas → erro `INVALID_CREDENTIALS` (NÃO diferenciar "email não existe" de "senha errada" — mesma mensagem)
- Status do usuário `PENDING` → erro `ACCOUNT_PENDING`
- Status do usuário `REJECTED` → erro `ACCOUNT_REJECTED`

**Response 200:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "id": "uuid",
    "name": "João da Silva",
    "email": "joao.silva@ifam.edu.br",
    "role": "USER",
    "sector": "PROAD"
  }
}
```

**Rate limit:** 5 tentativas/min por IP.

### POST /auth/logout

Apenas limpa o estado do frontend. No backend, o token continua válido até expirar — no MVP não implementamos blacklist de token. Documentar isso nos comentários.

**Response 204:** (sem corpo)

### GET /auth/me

Requer autenticação.

**Response 200:**
```json
{
  "id": "uuid",
  "name": "João da Silva",
  "email": "joao.silva@ifam.edu.br",
  "siape": "1234567",
  "sector": "PROAD",
  "role": "USER",
  "status": "APPROVED",
  "created_at": "2026-04-15T10:30:00Z"
}
```

### POST /auth/request-password-reset

**Request:**
```json
{ "email": "joao.silva@ifam.edu.br" }
```

**Comportamento:**
- Sempre retorna 200, mesmo se o email não existir (não vazar existência de conta).
- Se o email existe e está APROVADO, envia email com link contendo token temporário (válido por 1h).
- Token é armazenado em tabela `password_reset_tokens` com hash (não salvar o token em plaintext).

**Response 200:**
```json
{ "message": "Se o email estiver cadastrado, um link de redefinição foi enviado." }
```

**Rate limit:** 3 tentativas/hora por IP.

### POST /auth/reset-password

**Request:**
```json
{
  "token": "token-recebido-por-email",
  "new_password": "novasenha123",
  "new_password_confirmation": "novasenha123"
}
```

**Response 204:** (sem corpo)

## Endpoints — Gerenciamento de Usuários (Admin)

Todos exigem role `ADMIN` ou `SUPER_ADMIN`.

### GET /admin/users/pending

Lista todos os cadastros pendentes.

**Response 200:**
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "...",
      "email": "...",
      "siape": "...",
      "sector": "...",
      "created_at": "..."
    }
  ],
  "total": 3
}
```

### POST /admin/users/{user_id}/approve

**Response 200:**
```json
{
  "id": "uuid",
  "status": "APPROVED"
}
```

**Side effect:** envia email ao usuário avisando que foi aprovado.

### POST /admin/users/{user_id}/reject

**Request:**
```json
{ "reason": "Motivo opcional" }
```

**Response 200:**
```json
{
  "id": "uuid",
  "status": "REJECTED"
}
```

### GET /super-admin/users

Lista todos os usuários com status `APPROVED` com suas roles atuais. Usado
pela tela de gestão de papéis (F-24). Ordenação alfabética por `name`.

Exige role `SUPER_ADMIN` apenas. ADMIN e USER recebem 403 `FORBIDDEN`.

**Response 200:**
```json
{
  "users": [
    {
      "id": "uuid",
      "name": "Amanda Servidora",
      "email": "amanda@ifam.edu.br",
      "siape": "1234567",
      "sector": "PROAD",
      "role": "USER",
      "created_at": "2026-04-20T10:00:00Z"
    }
  ],
  "total": 1
}
```

Não retorna usuários `PENDING` ou `REJECTED` — moderação desses é feita em
`GET /admin/users/pending`. Não expõe `password_hash` nem `updated_at`.

### POST /super-admin/users/{user_id}/promote

Exige role `SUPER_ADMIN`. Promove um USER para ADMIN.

**Response 200:**
```json
{
  "id": "uuid",
  "role": "ADMIN"
}
```

### POST /super-admin/users/{user_id}/demote

Exige role `SUPER_ADMIN`. Rebaixa um ADMIN para USER. Não permite rebaixar a si mesmo.

## Endpoints — Setores

### GET /sectors

Lista os setores institucionais cadastrados, em ordem alfabética por `name`.
Usado pelo editor admin de processos (F-22) para popular o Select de
`sector_id` em cada etapa, e pelo fluxograma público para renderizar as
swimlanes com o nome completo + sigla.

**Autenticação:** exige token válido (qualquer role — USER, ADMIN ou
SUPER_ADMIN). Não é informação sensível dentro do portal.

**Response 200:**
```json
{
  "sectors": [
    {
      "id": "uuid",
      "name": "Diretoria de Administração e Planejamento",
      "acronym": "DAP"
    },
    {
      "id": "uuid",
      "name": "Pró-Reitoria de Administração",
      "acronym": "PROAD"
    }
  ],
  "total": 2
}
```

O catálogo é gerenciado via seed (`python -m app.scripts.seed_sectors`),
não há endpoint de create/update/delete no MVP. Seed é idempotente por
`acronym` — reexecutar não duplica registros.

## Endpoints — Processos (público)

### GET /processes

Lista processos publicados. Público (não exige auth).

**Query params:**
- `search`: busca em título, descrição curta, categoria (case-insensitive)
- `category`: filtro por categoria

**Response 200:**
```json
{
  "processes": [
    {
      "id": "uuid",
      "title": "Solicitação de Capacitação",
      "short_description": "...",
      "category": "RH",
      "estimated_time": "30 a 45 dias",
      "step_count": 12,
      "access_count": 45
    }
  ],
  "total": 8
}
```

### GET /processes/{process_id}

Retorna detalhes básicos do processo, SEM o fluxo. Público.

Incrementa `access_count` em 1.

**Response 200:**
```json
{
  "id": "uuid",
  "title": "...",
  "short_description": "...",
  "full_description": "...",
  "category": "RH",
  "estimated_time": "30 a 45 dias",
  "requirements": ["Ser servidor efetivo", "Ter chefia imediata"],
  "step_count": 12,
  "access_count": 46
}
```

### GET /processes/{process_id}/flow

Retorna o fluxo completo com etapas, setores e recursos. **Exige autenticação.**

**Response 200:**
```json
{
  "process": { "id": "uuid", "title": "..." },
  "steps": [
    {
      "id": "uuid",
      "order": 1,
      "sector": { "id": "uuid", "name": "Gabinete PROAD", "acronym": "PROAD" },
      "title": "Preencher formulário de solicitação",
      "description": "...",
      "responsible": "Solicitante",
      "estimated_time": "1 dia",
      "resources": [
        {
          "id": "uuid",
          "type": "DOCUMENT",
          "title": "Formulário de Solicitação",
          "url": "https://..."
        },
        {
          "id": "uuid",
          "type": "LEGAL_BASIS",
          "title": "Lei nº 8.112/1990, Art. 87",
          "url": null,
          "content": "..."
        }
      ]
    }
  ]
}
```

## Endpoints — Progresso do usuário

Todos exigem autenticação.

### GET /progress/{process_id}

Retorna o progresso do usuário autenticado naquele processo. Se não existir, cria automaticamente com todas as etapas em `PENDING` e retorna.

**Response 200:**
```json
{
  "id": "uuid",
  "process_id": "uuid",
  "step_statuses": {
    "step-uuid-1": "COMPLETED",
    "step-uuid-2": "IN_PROGRESS",
    "step-uuid-3": "PENDING"
  },
  "last_updated": "2026-04-15T10:30:00Z"
}
```

### PATCH /progress/{process_id}/steps/{step_id}

**Request:**
```json
{ "status": "COMPLETED" }
```

**Validações:**
- `status` ∈ {`PENDING`, `IN_PROGRESS`, `COMPLETED`}
- `step_id` deve pertencer a `process_id` → erro `VALIDATION_ERROR`

**Response 200:** retorna o UserProgress completo atualizado.

## Endpoints — Administração de Processos

Todos exigem role `ADMIN` ou `SUPER_ADMIN`.

### POST /admin/processes
### PATCH /admin/processes/{process_id}
### DELETE /admin/processes/{process_id} (soft delete → status ARCHIVED)
### POST /admin/processes/{process_id}/submit-for-review (DRAFT → IN_REVIEW)
### POST /admin/processes/{process_id}/approve (IN_REVIEW → PUBLISHED)
### POST /admin/processes/{process_id}/steps
### PATCH /admin/processes/{process_id}/steps/{step_id}
### DELETE /admin/processes/{process_id}/steps/{step_id}
### POST /admin/processes/{process_id}/steps/{step_id}/resources
### DELETE /admin/processes/{process_id}/steps/{step_id}/resources/{resource_id}

**Detalhes de cada um** serão especificados em suas respectivas tasks. Os formatos seguem o mesmo padrão dos endpoints públicos — entrada espelha os campos do modelo (menos timestamps, IDs gerados, `access_count`).

## Notas sobre o fluxo de aprovação de processos

- Processos começam em `DRAFT` (admin pode editar livremente).
- Admin move para `IN_REVIEW` quando terminou.
- Outro admin (ou super_admin) aprova → `PUBLISHED`.
- **No MVP**, como pode haver poucos admins, um admin pode aprovar seu próprio processo — mas gera log de auditoria. Discutir na equipe se queremos bloquear isso.
- Arquivamento (`ARCHIVED`) esconde o processo da listagem pública mas preserva o progresso dos usuários.
