import { ArrowRight, Clock, User } from "lucide-react";

import type { components } from "../../types/api";

type FlowStepRead = components["schemas"]["FlowStepRead"];

interface StepCardProps {
  step: FlowStepRead;
  onSelect?: (step: FlowStepRead) => void;
}

/**
 * Card de uma etapa dentro da swimlane. Fica sempre renderizado como
 * `<button>` porque F-18 liga o modal de recursos no onSelect. Em F-17 o
 * click ainda é no-op quando `onSelect` não é passado — a estrutura fica
 * pronta para evitar churn depois.
 */
export function StepCard({ step, onSelect }: StepCardProps) {
  const paddedOrder = String(step.order).padStart(2, "0");

  return (
    <button
      type="button"
      onClick={() => onSelect?.(step)}
      aria-label={`Etapa ${step.order}: ${step.title}`}
      className="group flex w-[280px] flex-shrink-0 cursor-pointer rounded-md border border-border bg-card p-4 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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

          <span className="mt-3 inline-flex items-center gap-1 self-end text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Ver detalhes
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}
