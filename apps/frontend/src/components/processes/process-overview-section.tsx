import { categoryColors, categoryLabel } from "../../lib/category-colors";
import type { components } from "../../types/api";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";

type ProcessPublicDetail = components["schemas"]["ProcessPublicDetail"];

interface ProcessOverviewSectionProps {
  process: ProcessPublicDetail | undefined;
  isLoading: boolean;
}

/**
 * Bloco "Sobre o processo" exibido na página de fluxo (F-20).
 *
 * Replica a ficha pública (categoria, descrição, prazo, etapas, requisitos)
 * que o usuário já vê no modal/página de detalhe — o objetivo é não
 * obrigar o servidor a voltar pra Home só pra reler o card antes de
 * começar a marcar etapas.
 *
 * Se a query do detalhe falhar, o componente pai esconde a seção
 * (passando `process={undefined}` e `isLoading={false}`); o fluxo em si
 * continua visível.
 */
export function ProcessOverviewSection({
  process,
  isLoading,
}: ProcessOverviewSectionProps) {
  if (isLoading) {
    return (
      <section
        aria-label="Sobre o processo"
        className="mt-6 rounded-md border border-border bg-card p-6"
      >
        <EyebrowRule label="Sobre o processo" />
        <div aria-hidden className="mt-4 space-y-4">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="grid grid-cols-2 gap-6 pt-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </section>
    );
  }

  if (!process) return null;

  const stepLabel =
    process.step_count === 1 ? "1 etapa" : `${process.step_count} etapas`;

  return (
    <section
      aria-labelledby="process-overview-heading"
      className="mt-6 rounded-md border border-border bg-card p-6"
    >
      <div id="process-overview-heading">
        <EyebrowRule label="Sobre o processo" />
      </div>

      <Badge
        variant="outline"
        className={`mt-4 w-fit border-transparent ${categoryColors[process.category]}`}
      >
        {categoryLabel[process.category]}
      </Badge>

      <p className="mt-4 text-[15px] leading-[1.7] text-foreground/90">
        {process.full_description}
      </p>

      <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-0">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Prazo estimado
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {process.estimated_time}
          </dd>
        </div>
        <div className="sm:border-l sm:border-border sm:pl-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Etapas do fluxo
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {stepLabel}
          </dd>
        </div>
      </dl>

      {process.requirements.length > 0 ? (
        <div className="mt-8">
          <EyebrowRule label="Pré-requisitos" />
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
            {process.requirements.map((item, index) => (
              <div key={index} className="contents">
                <dt className="font-mono text-xs leading-[1.7] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </dt>
                <dd className="text-sm leading-[1.7] text-foreground/90">
                  {item}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function EyebrowRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="h-3.5 w-0.5 rounded-sm bg-primary" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
