# CLAUDE.md — IFFLOW (raiz do monorepo)

Você está na raiz do monorepo do IFFLOW. Este arquivo explica a estrutura do projeto e as regras que valem para qualquer sessão, independente do app em que você vai trabalhar.

**Antes de tocar em qualquer código, leia:**
1. Este arquivo (estrutura + regras gerais)
2. `ARCHITECTURE.md` (decisões arquiteturais e modelo de dados)
3. `DESIGN_SYSTEM.md` se for tocar em UI
4. `apps/backend/CLAUDE.md` OU `apps/frontend/CLAUDE.md` — o app específico da task
5. `apps/<app>/docs/TASKS.md` — localizar a task exata
6. `apps/<app>/docs/CONTRACTS.md` — contrato de API

## O que é o IFFLOW em 3 frases

Portal institucional da PROAD/IFAM onde servidores consultam fluxos de processos administrativos, veem etapas com documentos e base legal, e acompanham um checklist pessoal (que NÃO altera o processo real no SIPAC — é apenas organização individual). O MVP é um piloto com o processo de capacitação. A equipe é de 6 estudantes inexperientes em produção, usando vibe-coding extensivo — testes e segurança são inegociáveis.

## Estrutura do monorepo

```
ifflow/
├── CLAUDE.md                    ← este arquivo (regras gerais)
├── README.md                    ← como rodar o projeto
├── ARCHITECTURE.md              ← decisões arquiteturais e ADRs
├── DESIGN_SYSTEM.md             ← regras de UI (tokens, componentes)
├── apps/
│   ├── backend/
│   │   ├── CLAUDE.md            ← contexto específico do backend
│   │   ├── app/                 ← código Python
│   │   ├── tests/
│   │   ├── alembic/             ← migrations
│   │   ├── pyproject.toml
│   │   ├── Dockerfile
│   │   └── docs/
│   │       ├── CONTRACTS.md     ← fonte da verdade de API
│   │       ├── TASKS.md         ← tasks B-00 a B-27
│   │       └── PR_CHECKLIST.md
│   └── frontend/
│       ├── CLAUDE.md            ← contexto específico do frontend
│       ├── src/
│       ├── package.json
│       ├── vite.config.ts
│       └── docs/
│           ├── CONTRACTS.md     ← referência (fonte é backend)
│           ├── TASKS.md         ← tasks F-00 a F-26
│           └── PR_CHECKLIST.md
├── scripts/
│   ├── dev.sh                   ← sobe backend + frontend em paralelo
│   ├── sync-api-types.sh        ← regenera tipos do frontend a partir do OpenAPI
│   └── setup.sh                 ← setup inicial (após clone)
├── docker-compose.yml           ← Postgres + backend em dev
├── .github/workflows/
│   ├── backend-ci.yml           ← roda só em mudanças em apps/backend/**
│   └── frontend-ci.yml          ← roda só em mudanças em apps/frontend/**
├── .gitignore
└── .env.example
```

## Regras gerais do monorepo

### Escopo de tasks

Cada task em `apps/backend/docs/TASKS.md` ou `apps/frontend/docs/TASKS.md` define seu escopo. As regras:

1. **Tasks B-XX tocam apenas em `apps/backend/**`.** Nunca modifique o frontend em uma task do backend.
2. **Tasks F-XX tocam apenas em `apps/frontend/**`.** Com UMA exceção permitida: se a task F-XX tem `requires backend: B-YY`, e o endpoint existe, você pode rodar `./scripts/sync-api-types.sh` para atualizar `apps/frontend/src/types/api.ts` — isso conta como parte da task.
3. **Arquivos da raiz** (`README.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `CLAUDE.md`) só podem ser modificados em PRs dedicados a documentação, nunca no mesmo PR de uma task de código.
4. **Mudanças cross-stack** (ex: um novo endpoint de backend + a tela que o consome no frontend) devem ser feitas em **um único PR** tocando em ambos os apps. Esse é o principal benefício do monorepo — aproveite, mas com cuidado.

### Como o frontend sabe o que o backend implementou

Este era o problema que motivou a mudança para monorepo. A resposta em monorepo é simples:

1. **Se uma task B-XX está mergeada em `main`**, o endpoint existe. Ponto.
2. O frontend **gera os tipos do OpenAPI localmente** via `./scripts/sync-api-types.sh`. Se o endpoint existe no código do backend, o tipo vai existir em `apps/frontend/src/types/api.ts`. Se não existe, o TypeScript reclama em tempo de compilação.
3. **NÃO existe mais** `TASKS_STATUS.md` ou `AVAILABLE_ENDPOINTS.md`. Essa fonte de verdade é o próprio código.

**Protocolo obrigatório antes de iniciar qualquer task F-XX com `requires backend`:**

1. Faça `git pull` no `main`
2. Rode `./scripts/sync-api-types.sh` (que sobe o backend local e regenera os tipos)
3. Se o tipo que você precisa não aparecer em `apps/frontend/src/types/api.ts`, a task está BLOQUEADA — o backend ainda não foi implementado. Avise o humano.
4. Só então comece a escrever código do frontend

### Branches e PRs

- Uma branch por task. Nomes: `feat/B-03-modelo-user`, `feat/F-09-tela-login`, `fix/B-15-bug-validacao`
- PRs devem ter o ID da task no título: `B-03: implementa modelo User e migration`
- **Monorepo não muda** a regra de 1 aprovação obrigatória por PR de alguém que não escreveu a task
- CI separado por app (GitHub Actions `paths:` filters) — PRs tocando só no backend não rodam testes de frontend e vice-versa. Isso economiza tempo.

### Quando tocar em ambos os apps no mesmo PR

Permitido quando a task é inerentemente cross-stack. Exemplos legítimos:

- Adicionar um novo endpoint + gerar os tipos atualizados do frontend
- Corrigir um bug de contrato de API (frontend e backend concordando num formato novo)

**NÃO permitido**:

- Aproveitar o PR para "também melhorar uma coisinha no frontend"
- Misturar task B-XX com task F-YY que são logicamente separadas
- Fazer uma refatoração oportunista em outro app

Se você (agente) acha que precisa tocar em ambos os apps mas não tem uma task cross-stack explícita, **PARE e pergunte**.

### Comandos canônicos (de memória)

Todos rodam da raiz do repo:

```bash
./scripts/setup.sh                  # primeira vez após clone
./scripts/dev.sh                    # sobe backend + frontend juntos
./scripts/sync-api-types.sh         # regenera tipos do frontend

# Backend isolado
cd apps/backend
uvicorn app.main:app --reload       # só o backend
pytest                              # testes do backend
alembic upgrade head                # aplicar migrations

# Frontend isolado
cd apps/frontend
npm run dev                         # só o frontend
npm test                            # testes do frontend
npm run generate-api-types          # (ou usar o script da raiz)
```

### Regras invioláveis para Claude Code

1. **Antes de escrever código, descreva o plano.** Liste arquivos a criar/modificar, endpoints a usar, testes a escrever. Espere confirmação do humano.

2. **Se a task toca no backend, leia `apps/backend/CLAUDE.md` antes.** Se toca no frontend, leia `apps/frontend/CLAUDE.md`. Se toca nos dois, leia os dois.

3. **Nunca invente endpoints, schemas ou tipos.** Se não existe no código ou em CONTRACTS.md, pergunte.

4. **Nunca exceda o escopo da task.** Não toque em arquivos fora dos permitidos pela task, mesmo que pareça melhoria óbvia.

5. **Testes e segurança não são opcionais.** O `PR_CHECKLIST.md` do app específico lista os requisitos mínimos — eles serão auditados.

6. **Quando em dúvida, pergunte ao humano.** Não decida sozinho em situações ambíguas.

7. **Limpe o contexto entre tasks.** Cada task = uma sessão nova do Claude Code. Contexto contaminado causa bugs sutis.

## O que está FORA do MVP (não implementar)

- Editor visual drag-and-drop de fluxos
- SSO com login do IFAM
- Chatbot IA
- Dashboards de BI
- Central de notificações
- Gerador de documentos via formulário
- Favoritos
- Popularidade na UI (o campo `access_count` existe no banco, mas não exibir ainda)

Se alguém tentar implementar algo dessa lista, PR rejeitado.

## Lembrete final

Este projeto tem risco alto de virar código gerado que ninguém entende. Sua responsabilidade como agente é **ajudar o humano a entender** o que você escreve, não impressioná-lo com velocidade. Quando em dúvida, explique mais. Quando o humano pedir velocidade sobre qualidade, lembre-o dos requisitos de segurança e testes dos arquivos CLAUDE.md específicos.
