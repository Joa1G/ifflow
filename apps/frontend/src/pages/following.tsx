import { AlertCircle, ArrowRight, Bookmark, Compass } from "lucide-react";
import { Link } from "react-router-dom";

import { ProcessStatusBadge } from "../components/admin/process-status-badge";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useFollowing } from "../hooks/use-following";
import { ApiError } from "../lib/api-error";
import { categoryColors, categoryLabel } from "../lib/category-colors";
import type { components } from "../types/api";

type FollowingItem = components["schemas"]["UserProgressListItem"];

/**
 * Tela "Processos que acompanho".
 *
 * Lista os processos em que o usuário tem `UserProgress` registrado —
 * ou seja, abriu o fluxo ao menos uma vez (criação automática no
 * backend) ou marcou alguma etapa. Cada item linka direto para
 * `/processes/:id/flow` para retomar o acompanhamento sem ter que
 * caçar o processo na home.
 *
 * Distinção intencional de `/processes/mine` (Processos que CRIEI):
 *   - "Mine" lista processos cujo `created_by` é o autenticado.
 *   - "Following" lista processos que o autenticado ESTÁ ACOMPANHANDO.
 * O header expõe ambos como itens distintos do menu do usuário.
 */
export default function FollowingPage() {
  const query = useFollowing();

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
        <nav
          aria-label="Caminho"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
        >
          Processos <span aria-hidden>/</span> Acompanhando
        </nav>

        <header className="mt-3 max-w-2xl">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-ifflow-ink md:text-4xl">
            Processos que acompanho
          </h1>
          <p className="mt-2 text-sm text-ifflow-muted">
            Os processos em que você abriu o fluxo ou marcou etapas. Use esta
            página para retomar o acompanhamento sem precisar buscar o processo
            de novo na tela inicial.
          </p>
        </header>

        <section className="mt-8">
          <FollowingContent query={query} />
        </section>
      </div>
    </main>
  );
}

interface FollowingContentProps {
  query: ReturnType<typeof useFollowing>;
}

function FollowingContent({ query }: FollowingContentProps) {
  if (query.isPending) {
    return <FollowingSkeleton />;
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Erro ao carregar acompanhamentos</AlertTitle>
        <AlertDescription>
          {query.error instanceof ApiError
            ? query.error.message
            : "Não foi possível carregar os processos que você acompanha. Tente novamente."}
        </AlertDescription>
      </Alert>
    );
  }

  const items = query.data.following;
  if (items.length === 0) {
    return <EmptyZero />;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.process_id}>
          <FollowingRow item={item} />
        </li>
      ))}
      <li
        aria-live="polite"
        className="pt-1 text-right text-xs text-ifflow-muted"
      >
        {items.length}{" "}
        {items.length === 1 ? "processo acompanhado" : "processos acompanhados"}
      </li>
    </ul>
  );
}

function FollowingRow({ item }: { item: FollowingItem }) {
  const categoryClass = categoryColors[item.process_category];
  const categoryText = categoryLabel[item.process_category];
  const stepsLabel =
    item.total_steps === 0
      ? "Sem etapas"
      : `${item.completed_steps} de ${item.total_steps} etapas concluídas`;

  return (
    <Link
      to={`/processes/${item.process_id}/flow`}
      aria-label={`Continuar acompanhamento de ${item.process_title}`}
      className="group flex flex-col gap-3 rounded-lg border border-ifflow-rule bg-ifflow-paper p-5 transition-colors hover:border-ifflow-green focus-visible:border-ifflow-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ifflow-green focus-visible:ring-offset-2 md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={`border-transparent ${categoryClass}`}
          >
            {categoryText}
          </Badge>
          <ProcessStatusBadge status={item.process_status} />
        </div>
        <h2 className="mt-2 truncate font-serif text-lg font-medium text-ifflow-ink">
          {item.process_title}
        </h2>
        <p className="mt-1 line-clamp-1 text-sm text-ifflow-muted">
          {item.process_short_description}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 md:justify-end">
        <StepsProgress
          completed={item.completed_steps}
          total={item.total_steps}
          label={stepsLabel}
        />
        <ArrowRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-ifflow-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ifflow-green"
        />
      </div>
    </Link>
  );
}

interface StepsProgressProps {
  completed: number;
  total: number;
  label: string;
}

/**
 * Indicador compacto de progresso. A barra é decorativa (`aria-hidden`)
 * porque o texto à esquerda já comunica o mesmo ao leitor de tela —
 * evita verbosidade dupla.
 */
function StepsProgress({ completed, total, label }: StepsProgressProps) {
  const ratio = total === 0 ? 0 : Math.min(1, completed / total);
  const percentage = Math.round(ratio * 100);

  return (
    <div className="flex flex-col items-end gap-1 text-xs text-ifflow-muted">
      <span className="font-medium tabular-nums">{label}</span>
      <div
        aria-hidden
        className="h-1 w-24 overflow-hidden rounded-full bg-ifflow-rule/40"
      >
        <div
          className="h-full bg-ifflow-green"
          // Largura calculada — único caso onde estilo inline é tolerado pelo
          // DESIGN_SYSTEM (valor verdadeiramente dinâmico). Usar classe
          // arbitrária `w-[NN%]` quebraria com porcentagens não-padrão.
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function FollowingSkeleton() {
  return (
    <div role="status" aria-label="Carregando acompanhamentos" className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg bg-ifflow-rule/40" />
      ))}
    </div>
  );
}

function EmptyZero() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ifflow-rule bg-ifflow-paper py-16 text-center">
      <Bookmark className="mb-4 h-12 w-12 text-ifflow-muted" aria-hidden />
      <h3 className="font-serif text-lg font-medium text-ifflow-ink">
        Você ainda não acompanha nenhum processo
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ifflow-muted">
        Abra um processo na tela inicial e marque etapas — ele aparecerá aqui
        para você retomar depois.
      </p>
      <Button
        asChild
        className="mt-6 bg-ifflow-green text-white hover:bg-ifflow-green-hover"
      >
        <Link to="/">
          <Compass className="mr-2 h-4 w-4" aria-hidden />
          Explorar processos
        </Link>
      </Button>
    </div>
  );
}
