import { ArrowRight, Clock, User } from "lucide-react";
import type { ReactNode } from "react";

import type { components } from "../../types/api";

type FlowStepRead = components["schemas"]["FlowStepRead"];

interface LinearFlowProps {
  steps: FlowStepRead[];
  onSelectStep?: (step: FlowStepRead) => void;
  renderStatusControl?: (step: FlowStepRead) => ReactNode;
}

export function LinearFlow({
  steps,
  onSelectStep,
  renderStatusControl,
}: LinearFlowProps) {
  const totalSteps = String(steps.length).padStart(2, "0");

  return (
    <div
      role="list"
      aria-label="Etapas do fluxo em sequência linear"
      className="flex min-w-fit items-stretch gap-4 pb-2"
    >
      {steps.map((step, index) => {
        const paddedOrder = String(step.order).padStart(2, "0");
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} role="listitem" className="flex items-center gap-4">
            <article
              aria-label={`Etapa ${step.order}: ${step.title}`}
              className="flex w-[320px] flex-shrink-0 flex-col rounded-md border border-border bg-card text-left"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.25em] text-foreground">
                    {step.sector.acronym}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {step.sector.name}
                  </span>
                </div>
                <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {paddedOrder}/{totalSteps}
                </span>
              </header>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center justify-center border-r border-border pr-4">
                    <span className="font-mono text-5xl font-light leading-none tabular-nums text-foreground/80">
                      {paddedOrder}
                    </span>
                    <span className="mt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Etapa
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold leading-[1.3] text-foreground">
                      {step.title}
                    </h3>

                    <div className="mt-4 flex flex-col gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <User aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{step.responsible}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{step.estimated_time}</span>
                      </span>
                    </div>

                    {step.description ? (
                      <p className="mt-3 line-clamp-3 text-xs leading-[1.5] text-muted-foreground">
                        {step.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {renderStatusControl ? (
                    <div>{renderStatusControl(step)}</div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onSelectStep?.(step)}
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

            {!isLast ? (
              <div
                aria-hidden
                className="flex h-full min-h-[280px] items-center text-border"
              >
                <ArrowRight className="h-5 w-5" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
