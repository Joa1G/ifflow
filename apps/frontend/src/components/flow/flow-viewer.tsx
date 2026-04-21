import type { components } from "../../types/api";
import { Swimlane } from "./swimlane";

type FlowStepRead = components["schemas"]["FlowStepRead"];
type ProcessFullFlow = components["schemas"]["ProcessFullFlow"];
type SectorRef = components["schemas"]["SectorRef"];

interface FlowViewerProps {
  flow: ProcessFullFlow;
  onSelectStep?: (step: FlowStepRead) => void;
}

/**
 * Ordena os setores pela ORDEM DA PRIMEIRA APARIÇÃO no fluxo: o setor
 * que executa a primeira etapa aparece no topo, e assim por diante.
 * Isso preserva a leitura "de cima para baixo no começo do processo".
 */
function collectSectorsInFlowOrder(steps: FlowStepRead[]): SectorRef[] {
  const seen = new Map<string, SectorRef>();
  for (const step of steps) {
    if (!seen.has(step.sector.id)) {
      seen.set(step.sector.id, step.sector);
    }
  }
  return [...seen.values()];
}

function FlowMarker({
  label,
  position,
}: {
  label: string;
  position: "start" | "end";
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      className="relative flex items-center py-8"
    >
      <div aria-hidden className="h-px flex-1 bg-foreground/30" />
      <div className="flex items-center gap-3 bg-background px-4">
        {position === "start" ? (
          <span aria-hidden className="h-2 w-2 bg-primary" />
        ) : null}
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-foreground">
          {label}
        </span>
        {position === "end" ? (
          <span aria-hidden className="h-2 w-2 bg-primary" />
        ) : null}
      </div>
      <div aria-hidden className="h-px flex-1 bg-foreground/30" />
    </div>
  );
}

export function FlowViewer({ flow, onSelectStep }: FlowViewerProps) {
  const sortedSteps = [...flow.steps].sort((a, b) => a.order - b.order);
  const sectors = collectSectorsInFlowOrder(sortedSteps);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-fit">
        <FlowMarker label="Início do fluxo" position="start" />

        <div role="list" aria-label="Etapas do fluxo agrupadas por setor">
          {sectors.map((sector) => (
            <div key={sector.id} role="listitem">
              <Swimlane
                sector={sector}
                allSteps={sortedSteps}
                onSelectStep={onSelectStep}
              />
            </div>
          ))}
        </div>

        <FlowMarker label="Fim do fluxo" position="end" />
      </div>
    </div>
  );
}
