# IFFLOW

Sistema de orientação e padronização de processos administrativos da PROAD/IFAM. Portal onde servidores encontram fluxos de processos (ex: capacitação, aquisição de material), visualizam etapas com responsáveis, documentos e base legal, e acompanham seu próprio progresso em um checklist pessoal.

**Importante**: o checklist NÃO altera o processo oficial no SIPAC — é apenas uma ferramenta de organização individual.

## Sobre este repositório

Este é um **monorepo** que contém tanto o backend quanto o frontend do IFFLOW. Os dois apps são deployados separadamente em produção, mas vivem no mesmo Git para facilitar coordenação da equipe e mudanças cross-stack.

## Estrutura

```
ifflow/
├── CLAUDE.md                    Guia geral para o Claude Code
├── ARCHITECTURE.md              Decisões arquiteturais e ADRs
├── DESIGN_SYSTEM.md             Tokens visuais e padrões de UI
├── README.md                    Este arquivo
├── apps/
│   ├── backend/                 Python 3.12 + FastAPI + Postgres
│   └── frontend/                React 18 + TypeScript + Vite
├── scripts/
│   ├── setup.sh                 Setup inicial após clone
│   ├── dev.sh                   Sobe backend e frontend juntos
│   └── sync-api-types.sh        Regenera tipos do frontend via OpenAPI
└── docker-compose.yml           Postgres para desenvolvimento local
```

## Stack

**Backend**: Python 3.12, FastAPI, SQLModel, PostgreSQL 16, Alembic, Pytest, Argon2 (passlib), PyJWT, Resend (email), Docker.

**Frontend**: React 18, TypeScript strict, Vite, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, React Hook Form + Zod, Vitest, openapi-typescript.

**Infra**: GitHub Actions para CI, Railway/Render para backend, Vercel/Netlify para frontend.

## Pré-requisitos

- Python 3.12
- Node.js 20+
- Docker Desktop (para Postgres local)
- Git

## Primeira vez (setup)

```bash
git clone <repo-url> ifflow
cd ifflow
./scripts/setup.sh
```

O script `setup.sh` faz, em ordem:

1. Copia `.env.example` → `.env` (você edita os valores)
2. Sobe o Postgres via docker-compose
3. Instala dependências do backend (`pip install -e apps/backend`)
4. Aplica migrations
5. Cria o super_admin inicial
6. Instala dependências do frontend (`npm install` em `apps/frontend`)
7. Gera os tipos da API iniciais

## Rodando em desenvolvimento

**Opção 1 — tudo junto (recomendado):**

```bash
./scripts/dev.sh
```

Isso sobe backend em `localhost:8000` e frontend em `localhost:5173`.

**Opção 2 — separado (dois terminais):**

Terminal 1 (backend):
```bash
cd apps/backend
uvicorn app.main:app --reload
```

Terminal 2 (frontend):
```bash
cd apps/frontend
npm run dev
```

## Rodando os testes

**Backend**:
```bash
cd apps/backend
pytest                              # roda todos
pytest --cov=app --cov-report=term-missing   # com cobertura
```

**Frontend**:
```bash
cd apps/frontend
npm test                            # modo watch
npm run test:run                    # uma vez
npm run test:coverage
```

## Sincronizando tipos da API (frontend ← backend)

Quando alguém adiciona ou modifica um endpoint no backend, o frontend precisa regenerar os tipos TypeScript. Rode:

```bash
./scripts/sync-api-types.sh
```

Isso:
1. Sobe temporariamente o backend local (se não estiver rodando)
2. Busca `http://localhost:8000/openapi.json`
3. Gera `apps/frontend/src/types/api.ts`
4. Commita o arquivo gerado (ele vai versionado)

**Quando rodar**: sempre antes de começar uma task do frontend que dependa de endpoint novo, e sempre antes de commitar uma task de backend que tenha adicionado/modificado endpoint (para deixar o tipo atualizado para o próximo colega).

## Como trabalhar com tasks

Toda task vive em `apps/backend/docs/TASKS.md` (prefixo `B-`) ou `apps/frontend/docs/TASKS.md` (prefixo `F-`). Cada task tem:

- **Status**: TODO | IN_PROGRESS | BLOCKED | DONE
- **Depende de**: outras tasks que precisam estar DONE antes
- **Critério de pronto**: checklist verificável
- **Arquivos permitidos**: padrão glob dos arquivos que você pode tocar
- **Testes obrigatórios**: mínimos que devem existir
- **Checklist de segurança**: itens que o revisor confere

**Protocolo de trabalho** (para cada task):

1. Faça `git pull origin main` para ter o estado mais recente
2. Crie uma branch: `git checkout -b feat/B-03-modelo-user`
3. Abra o Claude Code na raiz do repo
4. **Cole a task inteira** no início da sessão (não só o título)
5. Peça ao agente que descreva o plano ANTES de escrever código
6. Implemente testes primeiro quando possível
7. Rode testes localmente antes de commitar
8. Abra PR e peça revisão de alguém que **não** escreveu a task
9. Aguarde aprovação (revisor segue o `PR_CHECKLIST.md` do app)
10. Merge no `main`

## Regras de commit e branch

- **Branches**: `feat/<ID-task>-descricao-curta`, `fix/<ID-task>-bug-xyz`. Nunca commitar direto no `main`.
- **Commits**: em português, imperativo, prefixo com ID da task. Exemplo: `B-03: implementa modelo User e migration`.
- **PRs**: título igual ao commit principal, corpo com link para a task em `TASKS.md`, screenshots se for UI.
- **Code review**: pelo menos 1 aprovação de alguém que NÃO escreveu a task.
- **Mensagens de commit e comentários no código**: em português.
- **Nomes de variáveis, funções, classes, tabelas, rotas**: em inglês.

## Convenções inegociáveis

1. **Escopo**: tasks B-* tocam apenas em `apps/backend/`. Tasks F-* tocam apenas em `apps/frontend/`. Exceção: tasks cross-stack explícitas.
2. **Arquivos de documentação na raiz** (`README.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`, `CLAUDE.md`) só podem ser modificados em PRs dedicados a documentação.
3. **Stack fixada**: não adicionar dependências fora do que já está no `pyproject.toml` ou `package.json` sem discussão.
4. **Sem refatorações oportunistas**: faça apenas o que a task pede.
5. **Testes e segurança**: seguir os `PR_CHECKLIST.md` de cada app. Violações bloqueiam merge.

## O que está FORA do MVP

Não implementar (mesmo se sobrar tempo):

- Editor visual drag-and-drop de fluxos
- SSO com login do IFAM (eliminado pelo stakeholder)
- Chatbot IA
- Dashboards de BI
- Central de notificações
- Gerador de documentos via formulário
- Favoritos
- Popularidade na UI (o campo existe no banco, mas não é exibido)

## Documentação adicional

- **`CLAUDE.md`** (raiz) — contexto para o Claude Code começar qualquer sessão
- **`ARCHITECTURE.md`** — diagrama de componentes, modelo de dados, ADRs (decisões arquiteturais)
- **`DESIGN_SYSTEM.md`** — tokens de cor, tipografia, componentes, padrões de UI
- **`apps/backend/CLAUDE.md`** — contexto específico do backend
- **`apps/backend/docs/CONTRACTS.md`** — contratos de API (fonte da verdade)
- **`apps/backend/docs/TASKS.md`** — lista de tasks do backend
- **`apps/backend/docs/PR_CHECKLIST.md`** — checklist de revisão de PRs do backend
- **`apps/frontend/CLAUDE.md`** — contexto específico do frontend
- **`apps/frontend/docs/CONTRACTS.md`** — referência de API para o frontend
- **`apps/frontend/docs/TASKS.md`** — lista de tasks do frontend
- **`apps/frontend/docs/PR_CHECKLIST.md`** — checklist de revisão de PRs do frontend

## Deploy

**Backend** → Railway ou Render (apontando para `apps/backend/` como root directory).

**Frontend** → Vercel ou Netlify (apontando para `apps/frontend/` como root directory).

Ambas as plataformas suportam "root directory" nativamente — selecione a pasta nas configurações e o serviço ignora o resto do repo.

Detalhes em `ARCHITECTURE.md`, seção "Deploy e ambientes".
