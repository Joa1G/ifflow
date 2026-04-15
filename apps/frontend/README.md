# IFFLOW — Frontend

App web do IFFLOW (React 18 + TypeScript strict + Vite + Tailwind + shadcn/ui). Este README cobre apenas o app do frontend. Para visão geral do monorepo, stack completa e protocolo de trabalho, consulte o [README da raiz](../../README.md) e o [CLAUDE.md do frontend](./CLAUDE.md).

## Requisitos

- Node.js 20+
- Backend rodando em `http://localhost:8000` (apenas para gerar tipos da API — tasks a partir da F-02)

## Setup

Da raiz do monorepo, o setup completo é automatizado por `./scripts/setup.sh`. Se quiser rodar manualmente só o frontend:

```bash
cd apps/frontend
npm install
```

O arquivo `.env` fica na **raiz do monorepo** (copie de `.env.example`). O Vite é configurado para lê-lo via `envDir`. Apenas variáveis com prefixo `VITE_*` são expostas ao frontend.

Variável obrigatória:

- `VITE_API_URL` — URL do backend (ex: `http://localhost:8000`)

## Comandos

Da raiz do monorepo (recomendado):

```bash
./scripts/dev.sh --frontend-only    # só o frontend
./scripts/dev.sh                    # backend + frontend juntos
```

De dentro de `apps/frontend/`:

```bash
npm run dev            # dev server em http://localhost:5173
npm run build          # build de produção em dist/
npm run preview        # serve o build local para conferir
npm run lint           # ESLint
npm run type-check     # tsc --noEmit
npm test               # Vitest em modo watch
npm run test:run       # Vitest uma vez (igual ao CI)
npm run test:coverage  # Vitest com cobertura (thresholds em vitest.config.ts)
```

## Estrutura

A estrutura de pastas obrigatória está documentada em [CLAUDE.md](./CLAUDE.md). Resumo:

```
src/
├── main.tsx              # entry point
├── index.css             # Tailwind + CSS vars do shadcn
├── lib/                  # utils e api-client
├── components/ui/        # componentes shadcn (adicionados via CLI)
├── pages/                # rotas
├── hooks/                # hooks de query/mutation
├── stores/               # Zustand (apenas auth)
├── types/api.ts          # GERADO do OpenAPI — não editar à mão
└── __tests__/            # testes de smoke
```

## Geração de tipos da API

Os tipos de `src/types/api.ts` são gerados a partir do OpenAPI do backend. Sempre rode da raiz:

```bash
./scripts/sync-api-types.sh
```

Isso sobe o backend local temporariamente e regenera o arquivo. **Nunca edite `src/types/api.ts` à mão.** Detalhes em [CLAUDE.md](./CLAUDE.md).

## Tasks

Lista de tasks do frontend em [docs/TASKS.md](./docs/TASKS.md). Checklist de revisão em [docs/PR_CHECKLIST.md](./docs/PR_CHECKLIST.md).
