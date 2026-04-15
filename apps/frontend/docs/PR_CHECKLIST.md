# PR_CHECKLIST.md — apps/frontend

**Quem revisa o PR deve percorrer esta lista com o código aberto ao lado.** Não é para marcar tudo sem olhar. Se um item não se aplica à task, marque "N/A" com justificativa.

Este checklist existe porque o time usa vibe-coding extensivamente. Em código gerado por agente, os problemas mais comuns aparecem em coisas que parecem certas mas não são — e é exatamente isso que a revisão humana precisa pegar.

---

## 1. A task foi realmente cumprida?

- [ ] O PR está linkado à task correspondente em `docs/TASKS.md`
- [ ] Cada item do "Critério de pronto" foi implementado e marcado
- [ ] O escopo não excedeu o definido
- [ ] Nada "a mais" foi adicionado
- [ ] Se precisava mudar escopo, foi discutido ANTES do PR

---

## 2. Arquitetura e estilo

- [ ] Hooks são o único lugar que usa `useQuery` / `useMutation` — pages/components não chamam TanStack Query diretamente
- [ ] `fetch` só existe em `src/lib/api-client.ts` — nenhum componente/hook chama fetch direto
- [ ] Componentes recebem dados via props ou via hook — não fazem fetch dentro deles
- [ ] Pages montam layout e chamam hooks — não têm lógica complexa
- [ ] Zustand store contém APENAS token e user autenticado — dados da API estão no cache do TanStack Query
- [ ] `useState` é só para estado de UI efêmero (modal aberto, tab ativa, etc)
- [ ] Nomes de variáveis/funções/componentes em inglês
- [ ] Comentários e mensagens de commit em português
- [ ] Sem imports não usados, sem código morto
- [ ] Sem `console.log` — usar logger/toast ou remover

---

## 3. Tipos da API

- [ ] Todos os tipos de objetos vindos da API são importados de `src/types/api.ts` (gerados)
- [ ] Não há `interface User { ... }` manual para objetos da API
- [ ] Se o backend atualizou um endpoint, `npm run generate-api-types` foi executado antes do PR
- [ ] `src/types/api.ts` atualizado está no commit

---

## 4. Formulários

- [ ] Formulários usam React Hook Form + Zod — não controlados com useState para cada campo
- [ ] Schemas Zod estão em `src/lib/validators/` — não inline
- [ ] Validação local roda antes de submit
- [ ] Erros de validação aparecem ao lado do campo, não só em toast
- [ ] Erros do backend (ApiError) são mapeados para campos quando possível (ex: EMAIL_ALREADY_EXISTS → campo email)
- [ ] Botão de submit tem loading state (disabled + spinner)
- [ ] Ao dar submit, formulário não fica em estado inconsistente (duplo-clique não dispara duas vezes)

---

## 5. Acessibilidade

- [ ] Todos os inputs têm `<label>` associado (por `htmlFor` ou componente shadcn Label)
- [ ] Botões icônicos têm `aria-label` ou título
- [ ] Contraste de texto em conformidade com AA (lighthouse pelo menos amarelo)
- [ ] Navegação por teclado funciona: Tab move entre controles, Enter submete forms
- [ ] Focus visível em todos os elementos interativos (sem `outline: none` sem substituto)
- [ ] Modais armadilham foco (via shadcn Dialog, que já faz isso) e fecham com Esc

---

## 6. Responsividade

- [ ] Layout funciona em 320px de largura (testar no devtools)
- [ ] Tablet (768px) e desktop (1280px) funcionam
- [ ] Grids usam `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (mobile first)
- [ ] Nada corta texto importante em telas pequenas
- [ ] Botões de ação têm área de toque >= 44x44px no mobile

---

## 7. Estados de loading/error/empty

- [ ] Toda query tem loading state (skeleton, spinner)
- [ ] Toda query tem error state com mensagem amigável
- [ ] Listas têm empty state claro ("Nenhum processo encontrado")
- [ ] Mutations mostram feedback ao final (toast de sucesso ou erro)

---

## 8. Segurança no frontend

### Dados sensíveis
- [ ] Senha nunca vai para logs/console
- [ ] Senha nunca é armazenada em estado global — só no form local
- [ ] Token nunca aparece em console, logs, ou no DOM
- [ ] User não é persistido em localStorage — só o token (persist do Zustand apenas para `token`)
- [ ] Nenhum `console.log(user)` ou `console.log(token)` ficou no código

### HTML/JS
- [ ] Nenhum `dangerouslySetInnerHTML` sem DOMPurify (ideal: não usar)
- [ ] Links externos têm `rel="noopener noreferrer"`
- [ ] URLs vindas da API são usadas como `href`, não como `eval` ou string concat

### Autorização
- [ ] Rotas protegidas usam `<ProtectedRoute requiredRole>`
- [ ] Comentário no código lembra que frontend é apenas UX — backend valida
- [ ] Nenhum endpoint assume role vinda de localStorage; sempre do user autenticado via /auth/me

### Variáveis de ambiente
- [ ] Só `VITE_*` vars usadas (outras não seriam expostas, mas confirmar)
- [ ] Nenhuma API key, secret, senha hardcoded
- [ ] `.env.local` não está no commit
- [ ] `.env.example` atualizado se houve nova var

### Regras de negócio visuais
- [ ] Se a tela mostra checklist ou progresso, o texto "Este checklist é pessoal e não altera o processo oficial no SIPAC" está presente e visível (REQ-102)
- [ ] Visibilidade de botões admin é baseada em `user.role` vindo de /auth/me, não de flag local

---

## 9. Testes

- [ ] Hooks novos têm teste (REQ-091 é Must)
- [ ] Validadores Zod novos têm teste
- [ ] Funções utilitárias em `lib/` têm teste
- [ ] Componentes CRÍTICOS (formulários de auth, step card, status selector) têm teste (REQ-091b)
- [ ] Testes usam MSW — nenhum teste faz fetch real
- [ ] Testes não dependem de ordem — rodar `vitest run --sequence.shuffle` não quebra
- [ ] Nenhum `.skip` sem justificativa
- [ ] `npm test` passa localmente
- [ ] CI está verde

---

## 10. Qualidade do código gerado por agente

- [ ] Você (revisor) entende o que cada linha faz. Se não, peça explicação
- [ ] Sem código "cargo cult" (imports inúteis, try/catch que só re-levanta, variáveis sem propósito)
- [ ] Exception handling é específico, não `catch (e) { /* nada */ }`
- [ ] Lógica não-óbvia tem comentário explicando o porquê
- [ ] Nenhum componente tem mais de ~150 linhas sem subdivisão
- [ ] Se o código resolve algo "criativamente" (fora dos padrões), há comentário — senão, refatorar

---

## 11. Documentação

- [ ] Componentes exportados têm JSDoc explicando props não óbvias
- [ ] Se mudou algo em `CONTRACTS.md` do backend, a referência do frontend foi atualizada
- [ ] README atualizado se houve nova var de env ou novo comando

---

## Aprovação final

Só aprove se:

1. Você leu cada arquivo modificado
2. Você conseguiria explicar o código para um terceiro
3. Todos os itens acima estão marcados ou têm N/A justificada
4. Você rodou a aplicação localmente e clicou no fluxo alterado
5. Você rodou os testes pelo menos uma vez
