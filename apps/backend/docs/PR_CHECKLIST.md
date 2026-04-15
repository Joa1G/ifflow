# PR_CHECKLIST.md — apps/backend

**Quem revisa o PR deve percorrer esta lista com o código aberto ao lado.** Não é para marcar tudo sem olhar. Se um item não se aplica à task, marque "N/A" com justificativa.

Este checklist existe porque o time usa vibe-coding extensivamente. Em código gerado por agente, os problemas mais comuns aparecem em coisas que parecem certas mas não são — e é exatamente isso que a revisão humana precisa pegar.

---

## 1. A task foi realmente cumprida?

- [ ] O PR está linkado à task correspondente em `docs/TASKS.md`
- [ ] Cada item do "Critério de pronto" da task foi implementado e marcado
- [ ] O escopo não excedeu o definido (nenhum arquivo fora de "Arquivos permitidos" foi tocado)
- [ ] Nada "a mais" foi adicionado (sem refatorações oportunistas, sem "já que eu estava aqui...")
- [ ] Se o escopo precisava mudar, foi discutido ANTES do PR (comentário na task ou issue)

---

## 2. Arquitetura e estilo

- [ ] Routers não contêm lógica de negócio (só recebem, chamam service, retornam)
- [ ] Services não importam nada de `fastapi` (nada de `HTTPException`, `Depends`)
- [ ] Models (SQLModel) são distintos de Schemas (Pydantic) — não há retorno de model direto
- [ ] Nomes de variáveis/funções/classes estão em inglês
- [ ] Comentários e mensagens de commit estão em português
- [ ] Não há imports não usados nem código morto
- [ ] Não há `print()` — usar logger
- [ ] Type hints presentes em funções públicas

---

## 3. Contrato de API

- [ ] As respostas seguem o formato definido em `docs/CONTRACTS.md`
- [ ] Mensagens de erro usam o schema `ErrorResponse` padrão
- [ ] Códigos de erro são strings em UPPER_SNAKE_CASE da lista documentada
- [ ] Códigos HTTP estão corretos (401 vs 403, 404 vs 409, etc.)
- [ ] O schema Pydantic de entrada não aceita campos extras que não deveria (`extra="forbid"` ou lista explícita)
- [ ] O OpenAPI gerado em `/docs` reflete o novo endpoint corretamente (rodar localmente e conferir)
- [ ] **Monorepo**: se esta task adicionou/modificou um endpoint, você rodou `./scripts/sync-api-types.sh` da raiz e commitou o `apps/frontend/src/types/api.ts` atualizado junto com este PR — OU abriu uma issue/mensagem avisando o time que o próximo colega do frontend precisará rodar o script

---

## 4. Segurança (ATENÇÃO EXTRA)

### Autenticação e autorização
- [ ] Endpoints que precisam de auth usam `get_current_user` ou `require_role`
- [ ] Endpoints administrativos usam `require_role(ADMIN, SUPER_ADMIN)` corretamente
- [ ] Endpoints de super_admin usam `require_role(SUPER_ADMIN)` apenas
- [ ] Nenhum endpoint lê `Authorization` header manualmente
- [ ] `user_id` em operações sempre vem do `current_user`, nunca de body/query

### Mass assignment e validação
- [ ] Schemas de entrada NÃO aceitam campos gerenciados pelo sistema (id, created_at, role, status, access_count, password_hash, created_by, approved_by)
- [ ] `User(**request.json())` NÃO existe no código — sempre instanciação explícita dos campos
- [ ] Input é validado por Pydantic antes de tocar no service
- [ ] Regras de negócio são validadas no service (não confiar só no schema)

### SQL injection e queries
- [ ] Todas as queries usam sintaxe SQLModel/SQLAlchemy (`select().where()`)
- [ ] Nenhuma concatenação de string em queries
- [ ] Nenhum uso de `text()` com input do usuário sem parâmetros bound

### Senhas e tokens
- [ ] Senhas são hashed com argon2 via passlib (não bcrypt, não sha256)
- [ ] `password_hash` NUNCA aparece em responses
- [ ] JWT é assinado com HS256 e `JWT_SECRET` do config
- [ ] JWT payload contém apenas `user_id`, `role`, `exp`
- [ ] Tokens de reset de senha são gerados com `secrets.token_urlsafe` e armazenados apenas como hash

### Vazamento de informação
- [ ] Mensagem de erro de login não diferencia "email inexistente" de "senha errada"
- [ ] `/auth/request-password-reset` sempre retorna 200, mesmo se email não existe
- [ ] Stack traces não aparecem em responses de produção
- [ ] Logs não contêm senhas, tokens, ou body de requests de auth

### IDOR (Insecure Direct Object Reference)
- [ ] Quando a URL tem múltiplos IDs (`/processes/{p}/steps/{s}`), o código valida que `s` pertence a `p`
- [ ] User A não consegue acessar recursos de User B mesmo conhecendo os IDs

### Rate limiting
- [ ] `/auth/login` tem rate limit de 5/min por IP
- [ ] `/auth/request-password-reset` tem rate limit de 3/hora por IP
- [ ] Limite é por IP, não por usuário (senão o limite é inútil)

### CORS e headers
- [ ] CORS está configurado apenas para `FRONTEND_URL` (não `*`)
- [ ] Headers de segurança estão presentes em prod

### Secrets
- [ ] Nenhum secret, API key, ou senha hardcoded no código
- [ ] `.env` não está no commit
- [ ] `.env.example` tem todos os novos campos com valores placeholder

---

## 5. Testes

- [ ] Todos os testes novos passam localmente (`pytest`)
- [ ] CI está verde
- [ ] Cobertura de services e routers novos >= 70% (`pytest --cov=app --cov-report=term-missing`)
- [ ] Cada endpoint novo tem no mínimo 4 testes (happy path, 400/422, 401, 403)
- [ ] Testes usam as fixtures do `conftest.py`, não criam users manualmente
- [ ] Testes não dependem da ordem de execução (rodar `pytest --random-order` não quebra)
- [ ] Testes não fazem chamadas externas reais (Resend, outros serviços — tudo mockado)
- [ ] Nenhum teste foi marcado com `@pytest.mark.skip` sem justificativa

---

## 6. Migrations de banco

- [ ] Se model foi adicionado/modificado, há uma nova migration
- [ ] `alembic upgrade head` aplica limpo em banco vazio
- [ ] `alembic downgrade -1` funciona (rollback possível)
- [ ] Migration não perde dados (sem DROP COLUMN sem discussão)
- [ ] Nova coluna obrigatória em tabela existente tem um default ou é NULL primeiro

---

## 7. Qualidade do código gerado por agente

**Estes itens são específicos para pegar problemas comuns de vibe-coding:**

- [ ] Você (revisor) entende o que cada linha do código faz. Se não entende, peça explicação OU escreva o teste mental "o que quebraria se eu removesse esta linha?"
- [ ] Não há código "cargo cult" — importações desnecessárias, try/except que só re-levanta, variáveis que são nomeadas e usadas uma única vez sem propósito
- [ ] Exception handling é específico — não há `except Exception: pass` ou `except: ...`
- [ ] Lógica não-óbvia tem comentário em português explicando o porquê (não o quê — o quê está no código)
- [ ] Nenhuma função tem mais de ~40 linhas sem uma razão clara
- [ ] Se o código resolve algo "criativamente" (fora dos padrões da stack), há um comentário explicando por quê — senão, refatorar para o padrão

---

## 8. Documentação

- [ ] Funções exportadas têm docstring (propósito, parâmetros, retorno)
- [ ] Se mudou algo em `CONTRACTS.md`, está atualizado no PR
- [ ] Se adicionou dependência, `pyproject.toml` e `README` estão atualizados

---

## Aprovação final

Como revisor, só marque o PR como aprovado se:

1. Você leu cada arquivo modificado (não só o diff resumido)
2. Você conseguiria explicar o código para um terceiro
3. Todos os itens acima estão marcados ou têm N/A justificada
4. Você rodou os testes localmente pelo menos uma vez (não confiou só no CI)
5. Você rodou o endpoint localmente pelo menos uma vez (`curl` ou `/docs`)

**Se alguma dessas 5 coisas não for verdade, não aprove o PR.** É melhor demorar mais e entregar algo sólido do que aprovar cego e debugar em produção.
