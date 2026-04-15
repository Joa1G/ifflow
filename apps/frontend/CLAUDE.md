# CLAUDE.md — apps/frontend

Você está trabalhando no frontend do IFFLOW (sistema de orientação de processos da PROAD/IFAM). Este arquivo define o contexto obrigatório de TODA sessão que toca em `apps/frontend/`. Se você for um desenvolvedor humano: leia antes de começar. Se você for o Claude Code: siga rigorosamente.

**Este app vive em um monorepo.** Antes deste arquivo, você já deveria ter lido:
- `/CLAUDE.md` (raiz) — estrutura do monorepo, regras gerais, protocolo de sincronização com backend
- `/ARCHITECTURE.md` — decisões arquiteturais (ADRs)
- `/DESIGN_SYSTEM.md` — tokens visuais e padrões de UI (obrigatório para qualquer tela)

Seu escopo é **exclusivamente** `apps/frontend/**`. Não toque em `apps/backend/**`, mesmo que pareça relacionado. Exceção única: tasks com `requires backend: B-XX` permitem rodar `./scripts/sync-api-types.sh` da raiz, o que atualiza `apps/frontend/src/types/api.ts` — este arquivo gerado é considerado parte do frontend.

## Contexto do projeto em 3 frases

Portal institucional onde servidores consultam fluxos de processos administrativos, veem etapas com documentos e base legal, e acompanham um checklist pessoal (que NÃO altera o processo real no SIPAC — é apenas organização individual). O MVP é um piloto na PROAD com o processo de capacitação. A equipe é de 6 estudantes de Engenharia de Software, inexperientes em produção, usando vibe-coding extensivo — então testes e segurança são inegociáveis.

## Princípios de trabalho neste repo

1. **Antes de escrever código, descreva o plano.** Sempre que receber uma task, primeiro responda: "vou criar/modificar os arquivos X, Y, Z, usar o endpoint W, e escrever testes para A e B." Só escreva código após a pessoa confirmar.

2. **Tipos da API vêm do OpenAPI, não da sua imaginação.** Nunca escreva um tipo TypeScript à mão para algo que vem do backend. Use os tipos gerados em `src/types/api.ts` (gerados pela task F-02). Se o tipo que você precisa não existe lá, o backend precisa ser atualizado primeiro — pare e avise.

3. **Nunca invente um endpoint.** Se a task pede "buscar progressos do usuário" e você não encontra o endpoint em `docs/CONTRACTS.md` ou em `src/types/api.ts`, pare e pergunte. Não invente uma URL plausível.

4. **Não expanda escopo.** Se a task pede uma tela de listagem, não adicione ordenação, paginação avançada ou filtros que não foram pedidos.

5. **Não toque em arquivos fora do escopo da task.** Cada task lista os arquivos permitidos. Refatoração oportunista é proibida.

6. **Consulte a task inteira antes de qualquer coisa.** Se a pessoa só colou o título, peça a task completa de `docs/TASKS.md`.

7. **Protótipo do Figma ≠ Implementação.** Existe um protótipo antigo em outro repositório exportado do Figma. Ele serve como REFERÊNCIA visual. Você NÃO copia código dele cegamente — ele usa mocks, contexts que não existem aqui, e decisões antigas. Use-o para entender a UI que o stakeholder espera, mas escreva do zero.

## Stack (fixada, não sugerir alternativas)

- React 18
- TypeScript strict mode
- Vite (bundler)
- React Router v6 (routing)
- TanStack Query (data fetching + cache + loading/error states)
- Zustand (estado global: usuário autenticado, token)
- React Hook Form + Zod (formulários)
- Tailwind CSS + shadcn/ui (design system)
- lucide-react (ícones)
- openapi-typescript (gera tipos da API do OpenAPI)
- Vitest + React Testing Library (testes)
- Playwright (E2E — Sprint 5)

**Não instale libs extras sem discussão.** Em particular: nada de Redux, Axios (usamos fetch com wrapper), Formik, Material UI, Ant Design, styled-components, Emotion. Se precisar de um componente que shadcn não tem, adicione o componente shadcn oficial via CLI.

## Estrutura de pastas (obrigatória)

Você está dentro de `apps/frontend/`. A estrutura interna é:

```
apps/frontend/
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Router setup
│   ├── index.css                # Tailwind imports + CSS vars do shadcn
│   ├── types/
│   │   └── api.ts               # GERADO do OpenAPI — não editar à mão
│   ├── lib/
│   │   ├── api-client.ts        # fetch wrapper que lida com auth, erros, base URL
│   │   ├── query-client.ts      # configuração do TanStack Query
│   │   └── utils.ts             # helpers (cn, formatação, etc)
│   ├── stores/
│   │   └── auth-store.ts        # Zustand: token, user, login/logout
│   ├── hooks/
│   │   ├── use-auth.ts
│   │   ├── use-processes.ts     # queries do TanStack Query
│   │   ├── use-process-flow.ts
│   │   ├── use-progress.ts
│   │   └── ...
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components (gerados via CLI)
│   │   ├── layout/
│   │   ├── auth/
│   │   ├── processes/
│   │   ├── flow/
│   │   └── admin/
│   ├── pages/
│   │   ├── home.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── reset-password.tsx
│   │   ├── process-flow.tsx
│   │   ├── admin/
│   │   └── super-admin/
│   └── __tests__/
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
├── CLAUDE.md
└── docs/
    ├── CONTRACTS.md             # Referência do contrato (fonte é apps/backend/docs/CONTRACTS.md)
    ├── TASKS.md                 # Lista de tasks (F-00 a F-26)
    └── PR_CHECKLIST.md
```

Note que o `.env` geral, os scripts de dev, e o `docker-compose.yml` ficam na **raiz do monorepo**, não aqui. Este diretório contém apenas o código e docs do frontend.

**Regras sobre essa estrutura:**
- **Pages** são containers. Fazem routing, montam layout, chamam hooks. Não contêm lógica complexa.
- **Components** são reutilizáveis. Recebem props, disparam callbacks. Não fazem fetch direto — recebem dados via props ou usam hooks de `hooks/`.
- **Hooks** encapsulam TanStack Query. Não há `useQuery` direto em pages/components — sempre via hook dedicado.
- **Stores** (Zustand) guardam apenas estado global de sessão (usuário, token). Progresso de fluxo, lista de processos, etc, vêm do cache do TanStack Query, NÃO do Zustand.
- **api-client.ts** é o único lugar que chama `fetch`. Hooks chamam funções exportadas de `lib/api-client.ts` ou módulos relacionados.

## Tipos da API — fluxo importante

Em monorepo, a sincronização de tipos é muito simples:

1. Backend expõe `/openapi.json` (FastAPI gera automaticamente)
2. Script `./scripts/sync-api-types.sh` (na raiz do monorepo) sobe o backend local temporariamente e gera `apps/frontend/src/types/api.ts`
3. Hooks e componentes importam tipos de `src/types/api.ts`
4. **Antes de começar qualquer task com `requires backend: B-XX`**:
   - Faça `git pull origin main`
   - Rode `./scripts/sync-api-types.sh` da raiz
   - Confira que o tipo/endpoint que você precisa aparece em `src/types/api.ts`
   - Se não aparecer, a task do backend ainda não foi mergeada — PARE e avise o humano

**Nunca escreva tipos TypeScript manuais para objetos que vêm da API.** Se você precisa de uma projeção específica, use `Pick`, `Omit` ou mapeamento baseado nos tipos gerados.

## Contrato de resposta da API

O backend retorna:

- **Sucesso**: objeto direto, sem envelope.
- **Erro**: `{ error: { code: string, message: string, details?: object } }`.

O `api-client.ts` (task F-03) trata ambos:

- Sucesso: retorna `data`
- Erro: lança uma instância de `ApiError` customizada com `code` e `message`

Componentes e hooks capturam `ApiError` e mostram `error.message` ao usuário (que já vem em português). Para comportamentos específicos (ex: ACCOUNT_PENDING redireciona para tela de "aguardando"), use `error.code`.

## Estado global: o que vai onde

- **Zustand (`auth-store`)**: token JWT, user autenticado, login/logout/setUser. **Só isso.**
- **TanStack Query**: TODOS os dados vindos da API (processos, fluxos, progresso, cadastros pendentes). O cache do TanStack Query é seu "estado" — não duplique em Zustand ou useState.
- **useState local**: estado de UI (modal aberto/fechado, input não controlado, tabs ativas). Tudo que é efêmero.

**Nunca armazene dados da API em Zustand.** É o erro #1 que eu vou pegar em code review. O TanStack Query já faz cache, invalidation, refetch, loading states. Duplicar em outro store causa bugs de dessincronização.

## Persistência do token

O token JWT fica em **memória no Zustand** durante a sessão, e é persistido em `localStorage` apenas pela store do Zustand (com middleware `persist`). Ao recarregar a página:

1. Zustand hidrata token do localStorage
2. App chama `GET /auth/me` para validar e carregar user
3. Se falhar (token expirado), limpa o token e manda para login

**NÃO** coloque o token em cookies, sessionStorage, ou em variáveis globais fora do Zustand.

## Rotas protegidas

Existem 4 níveis:

1. **Público**: `/`, `/login`, `/register`, `/reset-password`, `/processes`, `/processes/:id`
2. **Autenticado**: `/processes/:id/flow`, `/my-progress`
3. **Admin**: `/admin/*`
4. **Super Admin**: `/super-admin/*`

Implementado via componente `<ProtectedRoute requiredRole="USER|ADMIN|SUPER_ADMIN">` que redireciona para `/login` se não autenticado ou `/forbidden` se sem permissão.

## Regras de UI/UX (do stakeholder)

- Design clean, profissional, sem excesso de cores. Paleta dominante: cinza, branco, um verde como accent (referência: `#059669`).
- Acessibilidade: labels associados a inputs, contraste AA, navegação por teclado.
- Responsividade: mobile first, grid de 1 coluna no mobile, 3 colunas no desktop.
- Feedback visual em tudo: hover nos botões, spinners durante requisições, toasts em sucesso/erro.
- Comunicação explícita sempre que o sistema mostrar algo relacionado a SIPAC: texto do tipo "este checklist é pessoal e não altera o processo oficial no SIPAC". **Não é decorativo — é regra de negócio (REQ-102).**

## Segurança no frontend: regras inegociáveis

1. **Nunca armazene senha em estado.** Em forms, use React Hook Form (que gerencia internamente) e envie direto para a API. Nunca `setPassword(...)`.

2. **Nunca construa URLs de API manualmente a partir de input do usuário.** Use funções de `api-client.ts`.

3. **Nunca use `dangerouslySetInnerHTML` com conteúdo vindo da API.** Se a base legal vier como HTML do backend, sanitize com `dompurify` antes. No MVP é improvável, mas o grepper do revisor vai procurar por isso.

4. **Nunca confie no frontend para autorização.** O backend é a fonte da verdade. Se um usuário USER conseguir ver um botão de admin por bug, clicar vai dar 403 — tudo bem. Mas NÃO liberar botões de admin no JSX baseado em flags vindas de localStorage sem checar a role real do user autenticado.

5. **Nunca logue token ou senha em console.** Em nenhum ambiente. Até `console.log(user)` é suspeito — o user não tem senha, mas pode ter dados que não queremos em logs de navegador.

6. **Variáveis de ambiente sensíveis não existem no frontend.** Qualquer `VITE_*` é público (vai para o bundle). Só coloque aí a URL da API. API keys, secrets, etc ficam no backend.

## Testes: regras inegociáveis

O time decidiu dividir testes de frontend em duas camadas:

**Camada 1 — Must (REQ-091):**
- Hooks customizados (`useProcesses`, `useProgress`, etc) — testar que chamam os endpoints certos, lidam com loading/error, invalidam cache corretamente
- Funções puras em `lib/` (utils, api-client helpers)
- Validadores Zod (cada schema de formulário)
- `auth-store` (login/logout/persist)

**Camada 2 — Should (REQ-091b):**
- Componentes críticos: `LoginForm`, `RegisterForm`, `StepCard`, `StatusSelector`, `ProcessDetailModal`
- Testes de renderização + interação (clicar, digitar, submeter)
- **NÃO** testar componentes cosméticos (cards informativos, headers, footers)

**Regras gerais:**
- Testes usam MSW (Mock Service Worker) para mockar a API, não `vi.fn` em fetch
- Testes não dependem de timing real — usar `waitFor` do RTL
- Nenhum teste marcado `.skip` sem justificativa no código
- Cobertura mínima de 60% em hooks e lib (configurar no vitest.config)

## Como rodar o frontend

Da **raiz do monorepo** (recomendado):

```bash
./scripts/dev.sh                     # sobe backend + frontend juntos
# ou só o frontend:
cd apps/frontend && npm run dev
```

De dentro de `apps/frontend/`:

```bash
# Primeira vez
npm install
# .env fica na raiz do monorepo, variável usada: VITE_API_URL

# Rodar dev server
npm run dev                          # http://localhost:5173

# Regenerar tipos da API (precisa do backend rodando)
# Prefira rodar da raiz: ./scripts/sync-api-types.sh

# Testes
npm test
npm run test:coverage

# Build
npm run build
```

**Nota sobre `.env`**: o monorepo usa um único `.env` na raiz. O Vite é configurado em `vite.config.ts` para ler variáveis daí. Apenas variáveis `VITE_*` são expostas ao frontend.

## Documentação adicional

- `docs/CONTRACTS.md` — cópia de referência do contrato de API (fonte da verdade no backend)
- `docs/TASKS.md` — lista de tasks
- `docs/PR_CHECKLIST.md` — checklist obrigatório de revisão

## Lembrete final

Este projeto tem risco alto de virar código gerado que ninguém entende. Sua responsabilidade como agente é AJUDAR O HUMANO A ENTENDER o que você escreve. Quando em dúvida, explique mais. Quando o humano pedir velocidade sobre qualidade, lembre-o dos requisitos de segurança e testes deste arquivo.
