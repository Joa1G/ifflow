# DESIGN_SYSTEM.md — IFFLOW

**Este arquivo é contexto para o Claude Code.** Cole-o no início de qualquer sessão que envolva UI, ou referencie-o por caminho. Todos os valores aqui são **literais** — use exatamente o que está escrito, não improvise variações.

Localização canônica: `ifflow/DESIGN_SYSTEM.md` (raiz do monorepo). Este arquivo aplica-se a `apps/frontend/**`.

---

## Regra #0 — O que NÃO fazer

Antes de qualquer coisa, as proibições. Estas regras pegam 80% dos erros de agente em UI:

- **NÃO** invente cores novas. Use apenas as definidas em "Paleta" abaixo.
- **NÃO** use gradientes, sombras coloridas, ou efeitos decorativos (blur, glow, neon). O sistema é institucional — um ministério usaria isso.
- **NÃO** use emojis na UI, exceto dentro de conteúdo gerado pelo usuário. Para ícones, use `lucide-react`.
- **NÃO** crie componentes novos se existe equivalente em shadcn/ui. Adicione o shadcn via `npx shadcn@latest add <nome>`.
- **NÃO** use `styled-components`, `emotion`, CSS Modules, ou CSS inline exceto para valores verdadeiramente dinâmicos (ex: largura calculada). Tudo é Tailwind.
- **NÃO** use `!important` em nenhum CSS.
- **NÃO** use classes Tailwind arbitrárias (`bg-[#123456]`, `text-[17px]`) exceto com justificativa em comentário.
- **NÃO** escreva `text-white bg-blue-500` — use as variáveis CSS do shadcn (`text-primary-foreground bg-primary`) para que o tema seja consistente.
- **NÃO** copie estilo do protótipo Figma cegamente. Ele é referência visual, não fonte de verdade.

---

## Paleta de cores

Usamos o sistema de variáveis CSS do shadcn/ui com um **tema custom** ajustado para o IFFLOW. Abaixo estão os valores literais que devem estar em `src/index.css`.

```css
@layer base {
  :root {
    /* Base */
    --background: 0 0% 100%;           /* branco puro */
    --foreground: 222 47% 11%;         /* quase preto, levemente azulado */

    /* Card e popover */
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;

    /* Primary — verde institucional do IFFLOW */
    --primary: 160 84% 25%;            /* #0b7a51 — verde escuro acadêmico */
    --primary-foreground: 0 0% 100%;

    /* Secondary — cinza neutro */
    --secondary: 210 20% 96%;          /* cinza muito claro */
    --secondary-foreground: 222 47% 11%;

    /* Muted — para texto secundário e backgrounds suaves */
    --muted: 210 20% 96%;
    --muted-foreground: 215 16% 47%;   /* cinza médio para subtítulos */

    /* Accent — usado em hover states */
    --accent: 160 60% 94%;             /* verde muito claro */
    --accent-foreground: 160 84% 25%;

    /* Destructive — ações destrutivas e erros */
    --destructive: 0 72% 51%;          /* vermelho */
    --destructive-foreground: 0 0% 100%;

    /* Borders e inputs */
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 160 84% 25%;               /* ring de foco = primary */

    --radius: 0.5rem;
  }
}
```

**Como usar**: via classes Tailwind do shadcn. Exemplos:
- Botão primário: `bg-primary text-primary-foreground hover:bg-primary/90`
- Texto secundário (descrições, legendas): `text-muted-foreground`
- Card: `bg-card text-card-foreground border border-border`
- Erro inline: `text-destructive`

**Cores semânticas para status de progresso** (usadas no fluxograma e seletor de status):

```ts
// src/lib/status-colors.ts
export const stepStatusColors = {
  PENDING:      'bg-muted text-muted-foreground border-border',
  IN_PROGRESS:  'bg-blue-50 text-blue-900 border-blue-300',
  COMPLETED:    'bg-emerald-50 text-emerald-900 border-emerald-300',
} as const;
```

Estas são as **únicas** cores fixas permitidas fora das variáveis CSS, porque representam estados semânticos universais.

**Categorias de processo** (badges na listagem):

```ts
export const categoryColors: Record<ProcessCategory, string> = {
  RH:             'bg-blue-100 text-blue-900',
  MATERIAIS:      'bg-amber-100 text-amber-900',
  FINANCEIRO:     'bg-emerald-100 text-emerald-900',
  TECNOLOGIA:     'bg-violet-100 text-violet-900',
  INFRAESTRUTURA: 'bg-orange-100 text-orange-900',
  CONTRATACOES:   'bg-rose-100 text-rose-900',
};
```

---

## Tipografia

**Fonte**: Inter (variável), carregada via `@fontsource-variable/inter` ou Google Fonts. Fallback: `system-ui, sans-serif`.

Configuração em `tailwind.config.js`:

```js
theme: {
  extend: {
    fontFamily: {
      sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
    },
  },
}
```

**Escala tipográfica** — use apenas estas classes. Não invente tamanhos.

| Uso | Classe Tailwind | Onde usar |
|---|---|---|
| Display (título de página grande) | `text-4xl font-bold tracking-tight` | Hero da home, não usar em mais lugares |
| H1 (título de página) | `text-3xl font-bold tracking-tight` | Topo de cada página |
| H2 (seção) | `text-2xl font-semibold tracking-tight` | Seções dentro de uma página |
| H3 (subseção) | `text-xl font-semibold` | Cards grandes, modais |
| H4 (título pequeno) | `text-lg font-semibold` | Cards, itens de lista |
| Body | `text-base` (16px) | Texto corrido |
| Body pequeno | `text-sm` | Descrições secundárias, metadados |
| Caption | `text-xs text-muted-foreground` | Labels pequenos, timestamps |

**Regras de peso**:
- `font-bold` só em display e h1/h2
- `font-semibold` em h3/h4/botões
- `font-medium` em labels de formulário
- `font-normal` (default) em body

**Line-height**: use `leading-tight` em títulos, `leading-relaxed` em parágrafos longos, default no resto.

---

## Espaçamento

Use exclusivamente a escala do Tailwind (múltiplos de 4px). **Não** use valores arbitrários.

**Guia de uso por contexto:**

| Contexto | Spacing |
|---|---|
| Padding interno de card | `p-6` (24px) |
| Padding interno de card pequeno | `p-4` |
| Gap entre elementos de um form | `space-y-4` |
| Gap entre seções de uma página | `space-y-8` ou `space-y-12` |
| Gap entre cards em grid | `gap-4` (mobile) / `gap-6` (desktop) |
| Padding horizontal de container | `px-4 md:px-8` |
| Margem entre label e input | (usar `space-y-2` no wrapper) |
| Altura de botão padrão | `h-10` (40px) — vem do shadcn Button |
| Altura de input padrão | `h-10` — vem do shadcn Input |

**Container principal**:

```tsx
<main className="container mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
  {/* conteúdo */}
</main>
```

`max-w-6xl` (1152px) é o limite superior para tudo. Conteúdo principal nunca excede isso.

---

## Componentes shadcn permitidos

O sistema usa **apenas** estes componentes do shadcn/ui no MVP. Se precisar de algo que não está na lista, pare e peça autorização antes de adicionar.

### Instalados desde o início
- `button` — botões em geral
- `input` — campos de texto, senha, email
- `label` — labels de formulário (sempre associados via `htmlFor`)
- `card` — containers de processos, cadastros pendentes, etc
- `dialog` — modais (detalhes de processo, confirmações)
- `dropdown-menu` — menu do perfil no header
- `form` — integração RHF + Zod + shadcn
- `select` — seleção única
- `textarea` — descrições longas
- `badge` — status de processo, categoria, role do usuário
- `skeleton` — loading states
- `toast` + `sonner` — notificações (usar sonner)
- `alert` — mensagens de info/warning/error inline
- `alert-dialog` — confirmação de ações destrutivas
- `tabs` — separação de seções no editor admin
- `separator` — divisores visuais

### Proibidos no MVP (não adicionar)
- `accordion` (use dialog ou tabs)
- `carousel` (sem necessidade)
- `command palette` (sem necessidade)
- `date picker` (datas são geradas pelo sistema)
- `drawer` (use dialog)
- `hover card` (overkill)
- `menubar` (use dropdown)
- `navigation menu` (o header manual cobre)
- `sheet` (use dialog)

---

## Padrões de componente — exemplos obrigatórios

Estes são os "templates" que os agentes devem seguir. Copie a estrutura, adapte o conteúdo.

### Botão primário de ação

```tsx
<Button className="w-full md:w-auto">
  Aprovar cadastro
</Button>
```

Nunca `<button className="bg-green-500 text-white p-2 rounded">`. Isso quebra o tema.

### Botão destrutivo

```tsx
<Button variant="destructive">
  Rejeitar
</Button>
```

### Card de conteúdo

```tsx
<Card>
  <CardHeader>
    <CardTitle>Solicitação de Capacitação</CardTitle>
    <CardDescription>Processo para pedido de afastamento para estudos.</CardDescription>
  </CardHeader>
  <CardContent>
    {/* conteúdo */}
  </CardContent>
  <CardFooter>
    <Button>Ver fluxo completo</Button>
  </CardFooter>
</Card>
```

### Campo de formulário com erro

Use **sempre** o padrão do shadcn Form (que integra RHF + Zod):

```tsx
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email institucional</FormLabel>
      <FormControl>
        <Input type="email" placeholder="nome@ifam.edu.br" {...field} />
      </FormControl>
      <FormDescription>Use seu email @ifam.edu.br.</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

Nunca um `<input>` solto com `<span>` de erro ao lado.

### Modal de confirmação destrutiva

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Arquivar processo</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Arquivar este processo?</AlertDialogTitle>
      <AlertDialogDescription>
        O processo ficará oculto para os servidores. O progresso já existente dos usuários será preservado.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleArchive}>Arquivar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Badge de status

```tsx
const statusLabel = {
  DRAFT: 'Rascunho',
  IN_REVIEW: 'Em revisão',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Arquivado',
};

const statusVariant = {
  DRAFT: 'secondary',
  IN_REVIEW: 'outline',
  PUBLISHED: 'default',
  ARCHIVED: 'secondary',
} as const;

<Badge variant={statusVariant[process.status]}>
  {statusLabel[process.status]}
</Badge>
```

Labels **sempre** em português. Variants do shadcn.

---

## Layout e grid

**Grid responsivo padrão** (cards na home, lista de pendentes, etc):

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
  {items.map(item => <Card key={item.id} />)}
</div>
```

Mobile first: 1 coluna → 2 em sm → 3 em lg. Não pular breakpoints.

**Página padrão**:

```tsx
<div className="min-h-screen bg-background">
  <Header />
  <main className="container mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
    <div className="mb-8 space-y-2">
      <h1 className="text-3xl font-bold tracking-tight">Título da página</h1>
      <p className="text-muted-foreground">Descrição curta do que é esta página.</p>
    </div>
    {/* conteúdo */}
  </main>
</div>
```

Toda página começa com header + título + descrição + conteúdo. Não mude essa estrutura.

---

## Estados de UI — obrigatórios

Toda tela que busca dados precisa implementar **os quatro estados**: loading, error, empty, success. Faltar qualquer um é motivo de rejeição em PR.

### Loading

```tsx
if (query.isLoading) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-48 w-full" />
      ))}
    </div>
  );
}
```

Nunca mostrar texto "Carregando..." sem skeleton, exceto em mutations (botão com spinner).

### Error

```tsx
if (query.isError) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Erro ao carregar</AlertTitle>
      <AlertDescription>
        {query.error instanceof ApiError
          ? query.error.message
          : 'Não foi possível carregar os dados. Tente novamente.'}
      </AlertDescription>
    </Alert>
  );
}
```

### Empty

```tsx
if (data.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <InboxIcon className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="text-lg font-semibold">Nenhum processo encontrado</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Ajuste os filtros ou tente um termo de busca diferente.
      </p>
    </div>
  );
}
```

### Success

Renderização normal.

---

## Feedback de mutations

Use `sonner` (shadcn wrapper). Padrão:

```tsx
import { toast } from 'sonner';

const mutation = useApproveUser({
  onSuccess: () => {
    toast.success('Cadastro aprovado com sucesso');
    queryClient.invalidateQueries({ queryKey: ['admin', 'pending-users'] });
  },
  onError: (err) => {
    if (err instanceof ApiError) {
      toast.error(err.message);
    } else {
      toast.error('Erro ao aprovar cadastro. Tente novamente.');
    }
  },
});
```

**Regras**:
- Success toast sempre que uma mutation modifica dados
- Error toast com mensagem do backend quando possível
- Nunca dois toasts seguidos para a mesma ação
- Duração default do sonner (4s) — não alterar

---

## Ícones

Fonte única: `lucide-react`. Não misturar com outras bibliotecas.

```tsx
import { Check, X, AlertCircle, Inbox, User, Settings } from 'lucide-react';

<Check className="h-4 w-4" />
```

**Tamanhos permitidos**:
- `h-4 w-4` — dentro de botões, badges, texto inline
- `h-5 w-5` — headers de seção
- `h-6 w-6` — ícones decorativos em cards
- `h-12 w-12` — empty states
- `h-16 w-16` — ilustrações de erro/sucesso grandes

Não use outros tamanhos.

---

## Acessibilidade — regras que o PR bloqueia

- Todo `<input>` tem um `<Label>` associado (o shadcn Form faz isso automaticamente)
- Todo botão que contém apenas ícone tem `aria-label`
- Contraste mínimo AA — teste com o devtools do Chrome antes do PR
- Navegação por teclado: Tab passa por todos os controles em ordem lógica, Enter submete forms, Esc fecha modais
- Focus visível em todos os interativos — nunca `outline: none` sem substituto
- Modais (shadcn Dialog) já aprisionam foco — não desabilitar isso
- Imagens informativas têm `alt`; decorativas têm `alt=""`
- Não usar cor como única forma de comunicar status (sempre acompanhar de ícone ou texto)

---

## Textos institucionais obrigatórios

Estes textos **não são decorativos** — são requisitos de negócio. Devem aparecer literalmente onde indicado:

**1. Aviso de checklist pessoal** (REQ-102). Obrigatório em toda tela de fluxograma e checklist pessoal:

> "Este checklist é pessoal e não altera o processo oficial no SIPAC. Use-o para acompanhar seu próprio andamento."

Posicionamento: `<Alert>` no topo da página de fluxograma, variant default, ícone `Info`.

**2. Aviso de cadastro pendente** (REQ-006b). Na tela `/pending`:

> "Seu cadastro foi recebido e está aguardando aprovação de um administrador. Você receberá um email assim que for aprovado. Esse processo pode levar até 2 dias úteis."

**3. Rejeição de cadastro**:

> "Seu cadastro foi rejeitado. Entre em contato com a administração do IFFLOW para mais informações."

**4. Rate limit em login**:

> "Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente."

---

## Mobile first — checklist rápido

Antes de abrir PR de qualquer tela:

1. Teste em 320px (iPhone SE mais apertado) — nada pode vazar
2. Botões clicáveis têm no mínimo 44x44px de área (shadcn Button default já atende)
3. Grids usam `grid-cols-1` como base
4. Modais ocupam tela inteira em mobile (shadcn Dialog já faz isso em mobile)
5. Texto nunca menor que `text-sm` (14px) em conteúdo interativo

---

## Resumo das 10 decisões que um agente precisa saber

Se tiver tempo para ler só 10 linhas deste arquivo:

1. Cores: variáveis CSS do shadcn com paleta verde institucional (#0b7a51) — nunca hex direto
2. Tipografia: Inter, escala fixa de `text-xs` até `text-4xl` — nunca tamanhos arbitrários
3. Espaçamento: escala padrão do Tailwind, `p-6` em cards, `gap-4/6` em grids
4. Componentes: apenas os shadcn listados — nunca componente custom se shadcn equivalente existe
5. Formulários: sempre shadcn Form + RHF + Zod — nunca `<input>` solto
6. Estados: loading (skeleton), error (Alert destructive), empty (ícone + texto), success — os 4 obrigatórios
7. Feedback: sonner toast em toda mutation (success e error)
8. Ícones: lucide-react apenas, tamanhos fixos
9. Acessibilidade: labels, contraste, teclado, aria-labels — bloqueia PR
10. Textos institucionais: os 4 avisos do REQ-102/006b são obrigatórios e literais
