import { ArrowRight, Clock, User } from "lucide-react";
import type { ReactNode } from "react";

import type { components } from "../../types/api";

type FlowStepRead = components["schemas"]["FlowStepRead"];

interface StepCardProps {
  step: FlowStepRead;
  onSelect?: (step: FlowStepRead) => void;
  /**
   * Controle opcional de status do checklist pessoal (F-20). Quando
   * ausente (ex: visitante não autenticado — rota hoje é protegida, mas
   * mantém a flexibilidade), o card renderiza só a parte informativa.
   */
  statusControl?: ReactNode;
}

/**
 * Card de uma etapa dentro da swimlane.
 *
 * A raiz é um `<article>` (não um `<button>` como na F-17) porque o card
 * agora hospeda dois controles interativos distintos — o seletor de status
 * e o botão "Ver detalhes" — e aninhar botão dentro de botão é inválido
 * em HTML. O clique que abre o modal passou a acontecer só no botão
 * dedicado, mantendo as duas ações semanticamente separadas.
 */
export function StepCard({ step, onSelect, statusControl }: StepCardProps) {
  const paddedOrder = String(step.order).padStart(2, "0");

  return (
    <article
      aria-label={`Etapa ${step.order}: ${step.title}`}
      className="group flex w-[280px] flex-shrink-0 rounded-md border border-border bg-card p-4 text-left transition-colors duration-200 focus-within:border-foreground/40 hover:border-foreground/40"
    >
      <div className="grid w-full grid-cols-[auto_1fr] gap-x-4">
        <div className="flex flex-col items-center justify-center border-r border-border pr-4">
          <span className="font-mono text-5xl font-light leading-none tabular-nums text-foreground/80">
            {paddedOrder}
          </span>
          <span className="mt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Etapa
          </span>
        </div>

        <div className="flex min-w-0 flex-col">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-[1.3] text-foreground">
            {step.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User aria-hidden className="h-3.5 w-3.5" />
              <span className="truncate">Responsável: {step.responsible}</span>
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              <span>Prazo: {step.estimated_time}</span>
            </span>
          </div>

          {step.description ? (
            <p className="mt-2 line-clamp-2 text-xs leading-[1.5] text-muted-foreground">
              {step.description}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            {statusControl ? (
              <div className="min-w-0 flex-1">{statusControl}</div>
            ) : (
              <span aria-hidden />
            )}

            <button
              type="button"
              onClick={() => onSelect?.(step)}
              aria-label={`Ver detalhes da etapa ${step.order}: ${step.title}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[11px] font-medium text-primary transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Ver detalhes
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
