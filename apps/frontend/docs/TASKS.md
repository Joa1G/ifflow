# TASKS.md — apps/frontend

Cada task tem um ID no formato `F-XX`. Cumpra as tasks na ordem dos prefixos numéricos. Dependências cruzadas com o backend estão marcadas como `Requires backend`.

**Em monorepo, a regra de `requires backend` é simples**: se a task tem `Requires backend: B-XX`, a task B-XX precisa estar **mergeada no `main`** antes de você começar. Não precisa esperar deploy.

**Protocolo obrigatório antes de iniciar uma task com `requires backend`:**

1. `git pull origin main`
2. `./scripts/sync-api-types.sh` (da raiz do monorepo) — regenera `src/types/api.ts`
3. Confira que os tipos que você precisa existem em `src/types/api.ts`
4. Se não existem, a task do backend ainda não foi mergeada — a task está BLOQUEADA. Avise o humano.
5. Se existem, siga em frente — o TypeScript vai te avisar se você usar algo errado

**Não "mocke e siga adiante"** — na hora de integrar vai divergir do contrato real. Se o backend não está pronto, ou você espera, ou pega outra task.

## Legenda

- **Status**: `TODO` | `IN_PROGRESS` | `BLOCKED` | `DONE`
- **Depende de**: outras tasks do frontend
- **Requires backend**: tasks do backend que precisam estar DONE
- **Arquivos permitidos**: padrão glob
- **Testes obrigatórios**: mínimo que precisa existir
- **Checklist de segurança**: itens que o revisor confere
- **REQ mapeados**: IDs dos requisitos da planilha MoSCoW

---

## Sprint 0 — Fundação

### F-00 — Setup do repositório e Vite
Status: TODO
Depende de: —
Requires backend: —
REQ mapeados: REQ-080, REQ-081

**Objetivo:** Criar o repo com Vite + React + TypeScript strict + Tailwind + shadcn inicializados, rodando em `npm run dev`.

**Critério de pronto:**
- [ ] Repo `ifflow-frontend` criado no GitHub com branch protection no `main`
- [ ] Vite + React + TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`) configurado
- [ ] Tailwind CSS configurado com as variáveis CSS do shadcn
- [ ] shadcn/ui inicializado via CLI (`npx shadcn@latest init`), tema neutro
- [ ] `src/main.tsx` renderiza um `<h1>IFFLOW</h1>` simples
- [ ] `.env.example` com `VITE_API_URL`
- [ ] `.gitignore` cobrindo `node_modules`, `.env.local`, `dist`
- [ ] Vitest + React Testing Library + jsdom configurados, com um teste hello-world passando
- [ ] `.github/workflows/ci.yml` rodando `npm run lint`, `npm test`, `npm run build` a cada push
- [ ] `README.md` com instruções de setup

**Arquivos permitidos:** todo o repo (task fundacional)

**Testes obrigatórios:**
- Um teste hello-world em Vitest passando

**Checklist de segurança:**
- [ ] `.env.local` está no `.gitignore`
- [ ] Não há secrets nos commits

---

### F-01 — Estrutura de pastas e rotas vazias
Status: TODO
Depende de: F-00
Requires backend: —
REQ mapeados: REQ-080

**Objetivo:** Criar a estrutura de pastas definida no CLAUDE.md e configurar React Router com páginas vazias.

**Critério de pronto:**
- [ ] Todas as pastas de `src/` criadas conforme CLAUDE.md
- [ ] React Router v6 instalado e configurado em `App.tsx`
- [ ] Páginas criadas como stubs (apenas `<div>Nome da Página</div>`):
  - `/` → HomePage
  - `/login` → LoginPage
  - `/register` → RegisterPage
  - `/reset-password` → ResetPasswordPage
  - `/processes/:id` → ProcessDetailPage
  - `/processes/:id/flow` → ProcessFlowPage
  - `/admin/users` → AdminUsersPage
  - `/admin/processes` → AdminProcessesPage
  - `/admin/processes/new` e `/admin/processes/:id/edit` → ProcessEditorPage
  - `/super-admin/roles` → SuperAdminRolesPage
  - `/forbidden` → ForbiddenPage
  - `*` → NotFoundPage
- [ ] Navegar entre elas funciona

**Arquivos permitidos:** `src/pages/**`, `src/App.tsx`, `src/main.tsx`

**Testes obrigatórios:**
- Teste de smoke: `<App />` renderiza sem crashar

**Checklist de segurança:** N/A

---

### F-02 — Geração de tipos da API a partir do OpenAPI
Status: TODO
Depende de: F-01
Requires backend: B-06 (precisa ter pelo menos um endpoint real)
REQ mapeados: REQ-081

**Objetivo:** Configurar geração automática de tipos TypeScript a partir do OpenAPI do backend.

**Critério de pronto:**
- [ ] `openapi-typescript` instalado como devDependency
- [ ] Script `generate-api-types` no package.json que baixa o openapi.json do backend e gera `src/types/api.ts`
- [ ] Comando funcionando: `VITE_API_URL=http://localhost:8000 npm run generate-api-types` produz o arquivo
- [ ] `src/types/api.ts` está no commit (versionado — facilita code review e CI)
- [ ] README do repo explica quando rodar o comando (toda vez que backend mudar um endpoint)

**Arquivos permitidos:** `package.json`, `src/types/api.ts`, scripts em `scripts/`

**Testes obrigatórios:** N/A (é um script de build)

**Checklist de segurança:** N/A

---

### F-03 — Cliente HTTP (api-client.ts)
Status: TODO
Depende de: F-02
Requires backend: —
REQ mapeados: REQ-072, REQ-052

**Objetivo:** Wrapper de fetch que lida com base URL, token de auth, parsing de resposta e formato de erro padrão.

**Critério de pronto:**
- [ ] `src/lib/api-client.ts` exporta funções `apiGet`, `apiPost`, `apiPatch`, `apiDelete` genéricas
- [ ] Todas leem base URL de `import.meta.env.VITE_API_URL`
- [ ] Todas injetam `Authorization: Bearer <token>` automaticamente lendo do `auth-store` se o token existir
- [ ] Em caso de sucesso, retornam o JSON parseado
- [ ] Em caso de erro, parseiam o formato padrão `{ error: { code, message } }` e lançam uma instância de `ApiError` (classe customizada exportada)
- [ ] `ApiError` tem propriedades `code: string`, `message: string`, `status: number`, `details: unknown`
- [ ] Se o erro for 401 e o código for `UNAUTHENTICATED` ou `INVALID_TOKEN`, o cliente limpa o auth-store (logout automático) — mas só depois do auth-store existir; no momento desta task, só logar um warning
- [ ] Se a resposta não for JSON parseável (ex: 500 com HTML), lança `ApiError` com code `INTERNAL_ERROR`

**Arquivos permitidos:** `src/lib/api-client.ts`, `src/lib/api-error.ts`

**Testes obrigatórios:**
- `api-client.test.ts` com MSW:
  - Requisição de sucesso retorna o objeto
  - Requisição de erro 4xx lança ApiError com code e message corretos
  - Requisição com token adiciona o header Authorization
  - Requisição sem token não adiciona o header
  - Resposta não-JSON lança INTERNAL_ERROR

**Checklist de segurança:**
- [ ] Token nunca é logado
- [ ] Erros não expõem detalhes internos do fetch no console em prod
- [ ] Base URL vem apenas de env var, não é hardcoded

---

### F-04 — TanStack Query e query-client
Status: TODO
Depende de: F-03
Requires backend: —
REQ mapeados: REQ-052

**Objetivo:** Configurar TanStack Query como provider global.

**Critério de pronto:**
- [ ] `@tanstack/react-query` instalado
- [ ] `src/lib/query-client.ts` exporta um QueryClient com configuração padrão:
  - `retry: 1`
  - `refetchOnWindowFocus: false`
  - `staleTime: 30_000` (30s)
- [ ] `QueryClientProvider` montado em `src/main.tsx` ou `App.tsx`
- [ ] React Query Devtools em dev mode
- [ ] Toaster (sonner) montado globalmente para notificações

**Arquivos permitidos:** `src/lib/query-client.ts`, `src/main.tsx`, `src/App.tsx`, `package.json`

**Testes obrigatórios:** N/A (setup)

**Checklist de segurança:** N/A

---

## Sprint 1 — Auth (telas e fluxo)

### F-05 — Zustand auth-store
Status: TODO
Depende de: F-03
Requires backend: —
REQ mapeados: REQ-002, REQ-003

**Objetivo:** Store de autenticação com persist no localStorage.

**Critério de pronto:**
- [ ] `src/stores/auth-store.ts` com Zustand e middleware `persist`
- [ ] Estado: `token: string | null`, `user: UserMe | null`, `isHydrating: boolean`
- [ ] Ações: `setAuth(token, user)`, `setUser(user)`, `logout()`, `hydrate()`
- [ ] `persist` armazena APENAS `token` no localStorage, NÃO o user inteiro
- [ ] `hydrate()` é chamado no bootstrap do App: lê token do localStorage, chama `GET /auth/me`, preenche user. Se falhar, limpa o token.
- [ ] Tipo `UserMe` vem de `src/types/api.ts`

**Arquivos permitidos:** `src/stores/auth-store.ts`

**Testes obrigatórios:**
- `auth-store.test.ts`:
  - setAuth preenche token e user
  - logout limpa ambos
  - persist armazena apenas o token (mockando localStorage)
  - hydrate chama /auth/me e preenche user
  - hydrate com falha de /auth/me limpa o token

**Checklist de segurança:**
- [ ] User NÃO é persistido — só o token. User é recarregado via /auth/me a cada hidratação.
- [ ] Senha NUNCA é armazenada em nenhum lugar
- [ ] Logout limpa completamente a store

---

### F-06 — Hook useAuth e bootstrap da sessão
Status: TODO
Depende de: F-05
Requires backend: B-08 (/auth/me)
REQ mapeados: REQ-002

**Objetivo:** Hook que expõe auth state e dispara hidratação no mount.

**Critério de pronto:**
- [ ] `src/hooks/use-auth.ts` exporta `useAuth()` que retorna `{ user, token, isAuthenticated, isHydrating, login, logout }`
- [ ] Componente `<AuthBootstrap />` no App.tsx que dispara `hydrate()` no mount e renderiza um loading enquanto `isHydrating === true`
- [ ] Após hidratação, renderiza o resto do app

**Arquivos permitidos:** `src/hooks/use-auth.ts`, `src/App.tsx`, `src/components/layout/auth-bootstrap.tsx`

**Testes obrigatórios:**
- `use-auth.test.tsx`: renderiza loading durante hidratação, depois renderiza children

**Checklist de segurança:**
- [ ] Sem user, nenhum conteúdo protegido é renderizado

---

### F-07 — Componente ProtectedRoute
Status: TODO
Depende de: F-06
Requires backend: —
REQ mapeados: REQ-014, REQ-072

**Objetivo:** Componente que envolve rotas autenticadas e checa role.

**Critério de pronto:**
- [ ] `src/components/layout/protected-route.tsx` exporta `<ProtectedRoute requiredRole?>`
- [ ] Se não autenticado, redireciona para `/login` guardando a rota original em `location.state.from`
- [ ] Se autenticado mas sem a role requerida, redireciona para `/forbidden`
- [ ] Se autenticado e com role, renderiza children
- [ ] Hierarquia de roles: SUPER_ADMIN > ADMIN > USER. Uma rota que exige ADMIN também permite SUPER_ADMIN.

**Arquivos permitidos:** `src/components/layout/protected-route.tsx`, `src/App.tsx`

**Testes obrigatórios:**
- `protected-route.test.tsx`:
  - Sem user → redireciona para /login
  - User com role menor → redireciona para /forbidden
  - User com role correta → renderiza children
  - SUPER_ADMIN pode acessar rota de ADMIN

**Checklist de segurança:**
- [ ] Autorização no frontend é APENAS UX — o backend ainda valida tudo. Documente isso em comentário no componente.

---

### F-08 — Schemas Zod para formulários de auth
Status: TODO
Depende de: F-01
Requires backend: —
REQ mapeados: REQ-053, REQ-103

**Objetivo:** Schemas Zod para validação de Register, Login, Reset Password.

**Critério de pronto:**
- [ ] `src/lib/validators/auth.ts` exporta:
  - `registerSchema` com todos os campos do CONTRACTS.md (inclusive validação `.endsWith('@ifam.edu.br')`)
  - `loginSchema`
  - `passwordResetRequestSchema`
  - `passwordResetConfirmSchema`
- [ ] Mensagens de erro em português
- [ ] Validação de senha mínima 8 caracteres
- [ ] Validação de confirmação de senha (refine)

**Arquivos permitidos:** `src/lib/validators/auth.ts`

**Testes obrigatórios:**
- `auth-validators.test.ts`:
  - Cada schema aceita input válido
  - registerSchema rejeita email sem @ifam.edu.br
  - registerSchema rejeita senhas diferentes
  - Cada schema rejeita campos ausentes

**Checklist de segurança:**
- [ ] Schemas nunca transformam/normalizam senha

---

### F-09 — Tela de Login
Status: TODO
Depende de: F-06, F-08
Requires backend: B-07 (/auth/login)
REQ mapeados: REQ-002, REQ-053, REQ-006b

**Objetivo:** Tela funcional de login com validação e tratamento de erros.

**Critério de pronto:**
- [ ] `src/pages/login.tsx` renderiza formulário com email + senha
- [ ] Usa React Hook Form + Zod (`loginSchema`)
- [ ] Submissão chama `POST /auth/login` via hook
- [ ] Hook `useLoginMutation` em `src/hooks/use-auth.ts` usando `useMutation` do TanStack Query
- [ ] Em sucesso: salva no auth-store, redireciona para `location.state.from` ou `/`
- [ ] Tratamento de erros:
  - `INVALID_CREDENTIALS` → mostrar toast "Email ou senha incorretos"
  - `ACCOUNT_PENDING` → redirecionar para página "/pending" (criar uma página simples que explica)
  - `ACCOUNT_REJECTED` → mostrar mensagem clara
  - `RATE_LIMITED` → mostrar "Muitas tentativas, aguarde um minuto"
  - Outros → mostrar mensagem genérica
- [ ] Botão de submit com loading state (disable + spinner)
- [ ] Link para "/register" e "/reset-password"
- [ ] Acessível: labels, contraste, tab order

**Arquivos permitidos:** `src/pages/login.tsx`, `src/pages/pending.tsx`, `src/hooks/use-auth.ts`, `src/components/auth/login-form.tsx`

**Testes obrigatórios:**
- `login-form.test.tsx`:
  - Form válido dispara mutation
  - Erro INVALID_CREDENTIALS mostra toast certo
  - Erro ACCOUNT_PENDING redireciona
  - Validação local bloqueia submit com email inválido

**Checklist de segurança:**
- [ ] Campo senha é `type="password"`
- [ ] Senha não aparece em logs/console
- [ ] Form não envia senha via URL (garantido por ser POST, mas checar)
- [ ] Erros do backend não expõem detalhes internos — mostrar só `error.message` do ApiError

---

### F-10 — Tela de Cadastro
Status: TODO
Depende de: F-08
Requires backend: B-06 (/auth/register)
REQ mapeados: REQ-001, REQ-006b, REQ-053, REQ-103

**Objetivo:** Tela de cadastro que deixa claro que o cadastro fica pendente.

**Critério de pronto:**
- [ ] `src/pages/register.tsx` com formulário: nome, email, siape, setor, senha, confirmar senha
- [ ] Validação local via `registerSchema`
- [ ] Submissão chama `POST /auth/register`
- [ ] Em sucesso: redireciona para página "/pending" mostrando "Cadastro recebido. Aguarde aprovação do administrador."
- [ ] Tratamento de erros:
  - `EMAIL_ALREADY_EXISTS` → erro no campo email
  - `INVALID_EMAIL_DOMAIN` → erro no campo email
  - `WEAK_PASSWORD` → erro no campo senha
- [ ] Link para /login

**Arquivos permitidos:** `src/pages/register.tsx`, `src/components/auth/register-form.tsx`, `src/hooks/use-auth.ts`

**Testes obrigatórios:**
- `register-form.test.tsx`:
  - Form válido dispara mutation
  - Erro EMAIL_ALREADY_EXISTS mostra erro no campo
  - Validação local bloqueia email sem @ifam.edu.br

**Checklist de segurança:**
- [ ] Campos senha são `type="password"`
- [ ] Nada indica ao usuário por que o cadastro foi rejeitado (no nível de erro técnico)

---

### F-11 — Telas de recuperação de senha
Status: TODO
Depende de: F-08
Requires backend: B-10 (/auth/request-password-reset e /auth/reset-password)
REQ mapeados: REQ-004

**Objetivo:** Duas telas: solicitar reset e confirmar reset (com token do link).

**Critério de pronto:**
- [ ] `src/pages/reset-password.tsx` (request) — campo de email, botão, mensagem de sucesso genérica
- [ ] `src/pages/reset-password-confirm.tsx` (confirm) — lê token da query string, campos de nova senha e confirmação
- [ ] Em ambos, tratamento de rate limit
- [ ] Rota `/reset-password` e `/reset-password/confirm` em App.tsx

**Arquivos permitidos:** `src/pages/reset-password.tsx`, `src/pages/reset-password-confirm.tsx`, `src/components/auth/*`, `src/hooks/use-auth.ts`

**Testes obrigatórios:**
- Teste de componente para cada tela (happy path + erro)

**Checklist de segurança:**
- [ ] Token nunca aparece no console
- [ ] Tela de sucesso não confirma se o email existia

---

### F-12 — Header com perfil e logout
Status: TODO
Depende de: F-06
Requires backend: —
REQ mapeados: REQ-002, REQ-003, REQ-006

**Objetivo:** Header com dropdown de usuário.

**Critério de pronto:**
- [ ] `src/components/layout/header.tsx` com logo à esquerda, dropdown à direita se autenticado, botão "Entrar" se não
- [ ] Dropdown usa shadcn `DropdownMenu`
- [ ] Dropdown mostra: avatar (inicial do nome), nome completo, email, separador, "Sair"
- [ ] Se role é ADMIN ou SUPER_ADMIN, mostra também link "Painel Admin"
- [ ] Se role é SUPER_ADMIN, mostra também "Gerenciar papéis"
- [ ] Logout chama store + toast "Sessão encerrada" + redirecionar para /
- [ ] Header é sticky

**Arquivos permitidos:** `src/components/layout/header.tsx`, `src/App.tsx` (para montar)

**Testes obrigatórios:**
- `header.test.tsx`:
  - Sem user: mostra botão Entrar
  - Com user USER: mostra dropdown sem links admin
  - Com user ADMIN: mostra link Painel Admin
  - Com user SUPER_ADMIN: mostra ambos os links
  - Clicar em Sair chama logout

**Checklist de segurança:**
- [ ] Visibilidade dos botões admin é só UX — backend valida tudo
- [ ] Nenhum dado sensível exposto no DOM

---

## Sprint 2 — Painel Admin: aprovação de usuários

### F-13 — Tela admin: usuários pendentes
Status: TODO
Depende de: F-12, F-07
Requires backend: B-12 (/admin/users/pending, approve, reject)
REQ mapeados: REQ-005, REQ-006b

**Objetivo:** Admin aprova/rejeita cadastros.

**Critério de pronto:**
- [ ] `src/pages/admin/users.tsx` protegida por `<ProtectedRoute requiredRole="ADMIN">`
- [ ] Hook `useAdminPendingUsers` (query) e `useApproveUser`, `useRejectUser` (mutations)
- [ ] Lista de cadastros pendentes em cards ou tabela
- [ ] Cada card mostra: nome, email, siape, setor, data de cadastro, botões "Aprovar" e "Rejeitar"
- [ ] Modal de confirmação antes de cada ação
- [ ] Modal de rejeição permite inserir motivo opcional
- [ ] Após ação, cache é invalidado e lista atualiza
- [ ] Estado vazio: "Nenhum cadastro pendente"

**Arquivos permitidos:** `src/pages/admin/users.tsx`, `src/components/admin/pending-users-list.tsx`, `src/components/admin/*`, `src/hooks/use-admin-users.ts`

**Testes obrigatórios:**
- `use-admin-users.test.ts`:
  - Query lista pendentes
  - approveUser invalida a query
  - rejectUser invalida a query
- Teste de componente da lista com estados vazio/com dados/loading

**Checklist de segurança:**
- [ ] Rota protegida por role
- [ ] Confirmação antes de ação destrutiva

---

## Sprint 3 — Visualização pública de processos

### F-14 — Hooks de processos públicos
Status: TODO
Depende de: F-04
Requires backend: B-19, B-20, B-21
REQ mapeados: REQ-010, REQ-011, REQ-012, REQ-013

**Objetivo:** Hooks que encapsulam as queries de processo.

**Critério de pronto:**
- [ ] `src/hooks/use-processes.ts`:
  - `useProcesses(search?, category?)` → lista paginada
  - `useProcess(id)` → detalhe
  - `useProcessFlow(id)` → fluxo completo (só se autenticado)
- [ ] Chaves de cache consistentes: `['processes', { search, category }]`, `['process', id]`, `['process-flow', id]`
- [ ] Tipos vêm de `src/types/api.ts`

**Arquivos permitidos:** `src/hooks/use-processes.ts`

**Testes obrigatórios:**
- `use-processes.test.ts` (MSW):
  - Lista sem filtros
  - Lista com search
  - Detalhe por id
  - useProcessFlow chama endpoint autenticado

**Checklist de segurança:**
- [ ] Nenhum hook expõe dados de outros usuários

---

### F-15 — Home com listagem e busca
Status: TODO
Depende de: F-14, F-12
Requires backend: B-19
REQ mapeados: REQ-010, REQ-011, REQ-012, REQ-061

**Objetivo:** Página inicial com barra de busca e grid de processos.

**Critério de pronto:**
- [ ] `src/pages/home.tsx` renderiza header + hero com barra de busca + grid de `ProcessCard`
- [ ] Busca é debounced (300ms) e chama o hook com o termo
- [ ] Grid responsivo: 1 coluna mobile, 2 tablet, 3 desktop
- [ ] Loading state (skeletons de card via shadcn Skeleton)
- [ ] Empty state ("Nenhum processo encontrado")
- [ ] Seção "Novo na PROAD?" com processos recomendados (hardcoded no MVP, discutir com stakeholder)
- [ ] Todas as seções informativas escondem quando há texto na busca (REQ-023 é Won't, mas esta regra básica é da home)

**Arquivos permitidos:** `src/pages/home.tsx`, `src/components/processes/process-card.tsx`, `src/components/processes/search-bar.tsx`

**Testes obrigatórios:**
- `process-card.test.tsx`: renderiza título, descrição, categoria, tempo
- Teste de debounce na busca (com timers do Vitest)

**Checklist de segurança:** N/A

---

### F-16 — Modal de detalhes do processo
Status: TODO
Depende de: F-14, F-15
Requires backend: B-20
REQ mapeados: REQ-013, REQ-014

**Objetivo:** Ao clicar em um card, abrir modal com detalhes e botão "Ver Fluxo".

**Critério de pronto:**
- [ ] `src/components/processes/process-detail-modal.tsx` com shadcn Dialog
- [ ] Mostra: título, categoria (badge), descrição completa, tempo estimado, número de etapas, lista de requisitos
- [ ] Botão "Ver fluxo completo" que navega para `/processes/:id/flow`
- [ ] Se não autenticado, botão muda para "Fazer login para ver fluxo" e abre modal de login OU redireciona
- [ ] Fechar modal via botão X ou clique fora

**Arquivos permitidos:** `src/components/processes/process-detail-modal.tsx`, `src/pages/home.tsx`

**Testes obrigatórios:**
- `process-detail-modal.test.tsx`:
  - Renderiza campos corretos
  - Botão muda conforme auth
  - Clicar em "Ver fluxo" navega

**Checklist de segurança:**
- [ ] Botão para rota autenticada NÃO renderiza o conteúdo, só redireciona (backend valida)

---

### F-17 — Tela de fluxograma
Status: TODO
Depende de: F-14, F-07
Requires backend: B-21
REQ mapeados: REQ-015, REQ-016, REQ-017, REQ-018

**Objetivo:** Tela mostrando o fluxo com etapas agrupadas por setor (swimlanes).

**Critério de pronto:**
- [ ] `src/pages/process-flow.tsx` protegida por `<ProtectedRoute>`
- [ ] Carrega fluxo via `useProcessFlow(id)`
- [ ] Renderiza swimlanes agrupando steps por `sector.id`
- [ ] Cada step é um `StepCard` clicável
- [ ] Início e Fim do fluxo como marcadores visuais
- [ ] Rolagem horizontal/vertical conforme o fluxo
- [ ] Botão "Voltar para processos" no topo
- [ ] Loading com skeleton, erro com mensagem

**Arquivos permitidos:** `src/pages/process-flow.tsx`, `src/components/flow/flow-viewer.tsx`, `src/components/flow/step-card.tsx`, `src/components/flow/swimlane.tsx`

**Testes obrigatórios:**
- `flow-viewer.test.tsx`: renderiza swimlanes corretas dado um mock de fluxo
- `step-card.test.tsx`: mostra número, título, responsável

**Checklist de segurança:**
- [ ] Conteúdo só aparece para autenticado
- [ ] Se conteúdo de base legal vier como HTML, sanitizar com DOMPurify (não deve acontecer no MVP, mas revisar)

---

### F-18 — Modal de detalhes da etapa (recursos)
Status: TODO
Depende de: F-17
Requires backend: B-21
REQ mapeados: REQ-017

**Objetivo:** Ao clicar em um step, abrir modal com documentos, base legal e POP.

**Critério de pronto:**
- [ ] `src/components/flow/step-detail-modal.tsx` com shadcn Dialog
- [ ] Seções:
  - "Descrição" — texto completo
  - "Documentos necessários" — lista de links (tipo `DOCUMENT`)
  - "Base legal" — lista de referências (tipo `LEGAL_BASIS`)
  - "Procedimento operacional" — link ou texto (tipo `POP`)
- [ ] Se não há recursos de um tipo, a seção não aparece
- [ ] Responsivo e acessível

**Arquivos permitidos:** `src/components/flow/step-detail-modal.tsx`

**Testes obrigatórios:**
- `step-detail-modal.test.tsx`: renderiza cada tipo de recurso e esconde seções vazias

**Checklist de segurança:**
- [ ] Links externos usam `rel="noopener noreferrer"`
- [ ] URLs vindas da API são tratadas como não confiáveis (se possível usar `<a href>` sem injeção)

---

## Sprint 4 — Checklist pessoal

### F-19 — Hook useProgress
Status: TODO
Depende de: F-14
Requires backend: B-23, B-24
REQ mapeados: REQ-030, REQ-031, REQ-032

**Objetivo:** Hook para buscar e atualizar progresso do usuário.

**Critério de pronto:**
- [ ] `src/hooks/use-progress.ts`:
  - `useProgress(processId)` → query, com auto-create no backend
  - `useUpdateStepStatus()` → mutation que recebe `{processId, stepId, status}`
- [ ] Mutation invalida a query ao terminar
- [ ] Optimistic update opcional (pode ser Should/Could dependendo do tempo)

**Arquivos permitidos:** `src/hooks/use-progress.ts`

**Testes obrigatórios:**
- `use-progress.test.ts` (MSW):
  - Query cria e retorna progress
  - Mutation atualiza e invalida cache

**Checklist de segurança:**
- [ ] user_id NÃO é passado em nenhum lugar (vem do token no backend)

---

### F-20 — Seletor de status nas etapas
Status: TODO
Depende de: F-19, F-17
Requires backend: B-24
REQ mapeados: REQ-030, REQ-102

**Objetivo:** Cada step no fluxo tem um seletor de status (Aguardando / Em Andamento / Concluído).

**Critério de pronto:**
- [ ] `src/components/flow/status-selector.tsx` com shadcn Select ou RadioGroup
- [ ] Cores:
  - Aguardando: cinza
  - Em Andamento: azul
  - Concluído: verde
- [ ] Integrado ao `StepCard`, lendo status do `useProgress(processId)`
- [ ] Ao mudar, chama `useUpdateStepStatus`
- [ ] **Texto explícito visível na página**: "Este checklist é pessoal e não altera o processo oficial no SIPAC." (REQ-102 — obrigatório)
- [ ] Feedback visual ao atualizar (toast ou highlight)

**Arquivos permitidos:** `src/components/flow/status-selector.tsx`, `src/components/flow/step-card.tsx`, `src/pages/process-flow.tsx`

**Testes obrigatórios:**
- `status-selector.test.tsx`:
  - Renderiza o status atual
  - Mudar valor chama a mutation com os args corretos
  - Exibe o texto do REQ-102 na página (teste na page)

**Checklist de segurança:**
- [ ] Texto do REQ-102 está presente e visível — teste automatizado garante isso
- [ ] User não consegue alterar progress de outro user (garantido pelo backend, mas documentar)

---

### F-21 — Resumo de progresso
Status: TODO
Depende de: F-19
Requires backend: B-23
REQ mapeados: REQ-033

**Objetivo:** Mostrar contagem de etapas por status e data da última atualização.

**Critério de pronto:**
- [ ] Componente `<ProgressSummary>` no topo/rodapé do fluxograma
- [ ] Mostra: X concluídas, Y em andamento, Z aguardando, última atualização em formato relativo ("há 2 minutos")
- [ ] Atualiza em tempo real quando status muda (via cache do TanStack Query)

**Arquivos permitidos:** `src/components/flow/progress-summary.tsx`, `src/pages/process-flow.tsx`

**Testes obrigatórios:**
- `progress-summary.test.tsx`: renderiza contagens corretas

**Checklist de segurança:** N/A

---

## Sprint 5 — Admin de processos + polimento + deploy

### F-22 — Editor de processo (admin)
Status: TODO
Depende de: F-13
Requires backend: B-16, B-17
REQ mapeados: REQ-040, REQ-041, REQ-044

**Objetivo:** Admin cria/edita processos via formulário. **Não é editor visual** — é formulário simples.

**Critério de pronto:**
- [ ] `src/pages/admin/process-editor.tsx` como formulário controlado
- [ ] Campos: título, descrição curta, descrição completa, categoria, tempo estimado, requisitos (lista editável de strings)
- [ ] Seção de "Etapas": lista editável com subformulários para cada step (ordem, título, descrição, responsável, setor, tempo)
- [ ] Cada step tem subsseção de "Recursos" (tipo, título, url, conteúdo)
- [ ] Validação via Zod
- [ ] Submit chama as mutations correspondentes
- [ ] Hook `useAdminProcess`, `useCreateProcess`, `useUpdateProcess` etc.

**Arquivos permitidos:** `src/pages/admin/process-editor.tsx`, `src/components/admin/*`, `src/hooks/use-admin-processes.ts`, `src/lib/validators/process.ts`

**Testes obrigatórios:**
- Validação do formulário
- Submissão chama mutation
- Teste de cada subformulário (step, resource)

**Checklist de segurança:**
- [ ] Rota protegida por role
- [ ] Formulário não envia campos gerenciados pelo sistema

---

### F-23 — Lista de processos admin (todos os status)
Status: TODO
Depende de: F-22
Requires backend: B-16
REQ mapeados: REQ-041, REQ-042, REQ-043

**Objetivo:** Admin vê todos os processos (inclusive DRAFT, IN_REVIEW, ARCHIVED) e pode gerenciar.

**Critério de pronto:**
- [ ] `src/pages/admin/processes.tsx` com tabela de processos
- [ ] Filtros por status
- [ ] Botões de ação por linha: editar, arquivar, submeter para revisão, aprovar
- [ ] Badges visuais de status

**Arquivos permitidos:** `src/pages/admin/processes.tsx`, `src/components/admin/*`

**Testes obrigatórios:**
- Renderização de cada status
- Ações chamam as mutations corretas

**Checklist de segurança:**
- [ ] Rota protegida
- [ ] Ações destrutivas pedem confirmação

---

### F-24 — Tela super_admin: gestão de papéis
Status: BLOCKED (depende do B-25 para listar os usuários APPROVED)
Depende de: F-13
Requires backend: B-13, B-25
REQ mapeados: REQ-007

**Objetivo:** Super admin promove/rebaixa admins.

**Critério de pronto:**
- [ ] `src/pages/super-admin/roles.tsx` protegida por `<ProtectedRoute requiredRole="SUPER_ADMIN">`
- [ ] Lista todos os usuários APPROVED
- [ ] Badge de role atual
- [ ] Botões "Promover a admin" / "Rebaixar a user"
- [ ] Impossibilidade visual de rebaixar a si mesmo (botão desabilitado)
- [ ] Confirmação antes de cada ação

**Arquivos permitidos:** `src/pages/super-admin/roles.tsx`, `src/components/admin/*`

**Testes obrigatórios:**
- Renderização
- Botão de auto-rebaixamento desabilitado

**Checklist de segurança:**
- [ ] Role verificada no frontend + validação no backend

---

### F-25 — Polimento de responsividade, feedback visual, acessibilidade
Status: TODO
Depende de: tudo anterior
Requires backend: —
REQ mapeados: REQ-050, REQ-051, REQ-052, REQ-054

**Objetivo:** Passada final de QA antes do deploy.

**Critério de pronto:**
- [ ] Todas as telas funcionam em 320px (mobile)
- [ ] Todos os botões têm hover e focus states visíveis
- [ ] Todas as ações que chamam API têm loading state
- [ ] Todos os formulários têm labels associados
- [ ] Contraste testado com Lighthouse (meta: score >= 90 em acessibilidade)
- [ ] Navegação por teclado funciona em fluxos principais
- [ ] Toasts sonner padronizados para sucesso e erro

**Arquivos permitidos:** todos os componentes/pages já existentes

**Testes obrigatórios:** N/A (manual)

**Checklist de segurança:** N/A

---

### F-26 — Deploy do MVP
Status: TODO
Depende de: F-25
Requires backend: B-27
REQ mapeados: —

**Objetivo:** Frontend acessível publicamente, conectado ao backend em produção.

**Critério de pronto:**
- [ ] Deploy no Vercel, Netlify ou Railway (discutir com equipe)
- [ ] `VITE_API_URL` apontando para o backend real
- [ ] Build rodando no CI e deployando automaticamente na main
- [ ] URL compartilhada com o stakeholder

**Arquivos permitidos:** arquivos de deploy, README

**Testes obrigatórios:** Teste manual: abrir a URL, fazer login, navegar

**Checklist de segurança:**
- [ ] `.env.local` não foi commitado
- [ ] VITE_API_URL aponta para HTTPS
- [ ] CORS do backend está configurado para a URL real do frontend

---

## Mapa de dependências (resumido)

```
F-00 → F-01 → F-02 → F-03 → F-04
              ↓
              F-05 → F-06 → F-07
                     ↓
                     F-08 → F-09, F-10, F-11
                            ↓
                            F-12
                            ↓
                     F-13 (admin users pendentes)
                     ↓
              F-14 → F-15 → F-16 → F-17 → F-18
                                   ↓
                            F-19 → F-20 → F-21
                                   ↓
                     F-22 → F-23 → F-24
                            ↓
                            F-25 → F-26
```

## Tasks paralelizáveis

- **Sprint 0**: F-00 sozinho, depois F-01 → F-02 → F-03 → F-04 em sequência (ou F-03 e F-04 em paralelo depois de F-02)
- **Sprint 1**: F-08 em paralelo com F-05 → F-06; F-09, F-10, F-11 em paralelo depois que F-08 estiver pronto
- **Sprint 3**: F-15, F-16, F-17, F-18 em sequência (cada um depende do anterior)
- **Sprint 5**: F-22, F-23, F-24 podem ser em paralelo depois de F-13
