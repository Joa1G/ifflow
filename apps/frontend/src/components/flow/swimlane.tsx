import type { ReactNode } from "react";

import type { components } from "../../types/api";
import { StepCard } from "./step-card";

type FlowStepRead = components["schemas"]["FlowStepRead"];
type SectorRef = components["schemas"]["SectorRef"];

interface SwimlaneProps {
  sector: SectorRef;
  allSteps: FlowStepRead[];
  onSelectStep?: (step: FlowStepRead) => void;
  renderStatusControl?: (step: FlowStepRead) => ReactNode;
}

/**
 * Uma raia (linha horizontal) do swimlane, representando um setor.
 *
 * Renderiza TODAS as etapas globais como células de um grid — mas
 * preenche com um StepCard apenas nas posições em que o step pertence a
 * este setor. As posições vazias mantêm o alinhamento temporal entre
 * raias (step 3 em PROAD e step 3 em DRH ficam exatamente na mesma
 * coluna), o que é o que torna o padrão swimlane legível.
 */
export function Swimlane({
  sector,
  allSteps,
  onSelectStep,
  renderStatusControl,
}: SwimlaneProps) {
  const columnCount = allSteps.length;

  return (
    <div
      className="relative grid min-h-[180px] items-center gap-x-8 border-t border-border py-6"
      style={{
        gridTemplateColumns: `200px repeat(${columnCount}, 280px)`,
      }}
      role="group"
      aria-label={`Raia ${sector.acronym} — ${sector.name}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-[200px] right-0 top-1/2 border-t border-dashed border-border/50"
      />

      <div className="sticky left-0 z-10 flex h-full flex-col justify-center border-r border-border bg-background pr-5">
        <span className="text-3xl font-semibold leading-none tracking-tight text-foreground/90 md:text-4xl">
          {sector.acronym}
        </span>
        <span className="mt-2 hidden max-w-[14ch] text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.2em] text-muted-foreground md:block">
          {sector.name}
        </span>
      </div>

      {allSteps.map((step) =>
        step.sector.id === sector.id ? (
          <div key={step.id} className="relative z-[1]">
            <StepCard
              step={step}
              onSelect={onSelectStep}
              statusControl={renderStatusControl?.(step)}
            />
          </div>
        ) : (
          <div key={step.id} aria-hidden />
        ),
      )}
    </div>
  );
}
