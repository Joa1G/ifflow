# CONTRACTS.md — apps/frontend

**Este documento é uma referência rápida.** A fonte da verdade do contrato de API está em `apps/backend/docs/CONTRACTS.md`. Em caso de conflito, o backend manda.

## Como obter os tipos reais

Rode `npm run generate-api-types` com o backend ligado. Isso produz `src/types/api.ts` a partir do `/openapi.json` do backend. Use SEMPRE esses tipos — nunca escreva à mão.

Exemplo de uso:

```ts
import type { paths } from '@/types/api';

// Tipo da response de GET /processes
type ProcessListResponse = paths['/processes']['get']['responses']['200']['content']['application/json'];

// Tipo do body de POST /auth/login
type LoginRequest = paths['/auth/login']['post']['requestBody']['content']['application/json'];
```

Para facilitar, crie aliases em `src/types/api-aliases.ts`:

```ts
import type { paths, components } from './api';

export type User = components['schemas']['UserMe'];
export type Process = components['schemas']['ProcessPublicList']['processes'][number];
// etc.
```

## Formato padrão de erro

Toda resposta 4xx/5xx segue:

```json
{
  "error": {
    "code": "UPPER_SNAKE_CASE",
    "message": "Mensagem legível em português",
    "details": {}
  }
}
```

O `api-client.ts` parseia isso automaticamente e lança uma instância de `ApiError`:

```ts
try {
  await apiPost('/auth/login', credentials);
} catch (err) {
  if (err instanceof ApiError) {
    if (err.code === 'INVALID_CREDENTIALS') {
      toast.error('Email ou senha incorretos');
    } else if (err.code === 'ACCOUNT_PENDING') {
      navigate('/pending');
    } else {
      toast.error(err.message); // fallback para mensagem do backend
    }
  }
}
```

## Códigos de erro que o frontend precisa tratar especificamente

| Código | HTTP | O que fazer no frontend |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Toast "Email ou senha incorretos" |
| `UNAUTHENTICATED` | 401 | Logout automático, redirecionar /login |
| `INVALID_TOKEN` | 401 | Logout automático, redirecionar /login |
| `ACCOUNT_PENDING` | 403 | Redirecionar para /pending |
| `ACCOUNT_REJECTED` | 403 | Mensagem clara na tela de login |
| `FORBIDDEN` | 403 | Redirecionar para /forbidden |
| `NOT_FOUND` | 404 | Mostrar "Não encontrado" na tela atual |
| `EMAIL_ALREADY_EXISTS` | 409 | Erro no campo email do form |
| `INVALID_EMAIL_DOMAIN` | 400 | Erro no campo email |
| `WEAK_PASSWORD` | 400 | Erro no campo senha |
| `RATE_LIMITED` | 429 | Toast "Muitas tentativas, aguarde" |
| Outros | * | Toast genérico com `error.message` |

## Fluxos sensíveis que precisam de atenção extra

### Login bloqueado por status

Depois de `POST /auth/login`:
- 200 → salvar token e user, redirecionar
- 401 `INVALID_CREDENTIALS` → mesma mensagem para email/senha errado (não diferenciar)
- 403 `ACCOUNT_PENDING` → tela explicando que precisa aprovação do admin
- 403 `ACCOUNT_REJECTED` → mensagem com sugestão de contatar o admin

### Cadastro sem login automático

`POST /auth/register` NÃO retorna token. Após sucesso:
1. Mostrar tela "Cadastro recebido. Aguarde aprovação do administrador."
2. NÃO logar automaticamente
3. Usuário só consegue logar após admin aprovar (que pode gerar email opcional)

### Geração automática de progresso

`GET /progress/{process_id}` cria o progresso automaticamente se não existir. O frontend não precisa chamar um endpoint separado de "criar progresso" — o primeiro GET já faz isso.

### Incremento de access_count

`GET /processes/{id}` incrementa o contador no backend. Não duplique isso no frontend nem tente controlar quando chamar — toda vez que a tela de detalhes abre, é uma chamada legítima.
