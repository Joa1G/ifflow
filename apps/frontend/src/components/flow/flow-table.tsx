import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import type { components } from "../../types/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type FlowStepRead = components["schemas"]["FlowStepRead"];

interface FlowTableProps {
  steps: FlowStepRead[];
  onSelectStep?: (step: FlowStepRead) => void;
  renderStatusControl?: (step: FlowStepRead) => ReactNode;
}

function countUniqueSectors(steps: FlowStepRead[]) {
  return new Set(steps.map((step) => step.sector.id)).size;
}

export function FlowTable({
  steps,
  onSelectStep,
  renderStatusControl,
}: FlowTableProps) {
  const sectorCount = countUniqueSectors(steps);

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-16 px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                #
              </TableHead>
              <TableHead className="min-w-[360px] px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Etapa
              </TableHead>
              <TableHead className="min-w-[180px] px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Setor
              </TableHead>
              <TableHead className="min-w-[180px] px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Responsável
              </TableHead>
              <TableHead className="min-w-[120px] px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Prazo
              </TableHead>
              <TableHead className="min-w-[180px] px-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-28 px-6 text-right">
                <span className="sr-only">Detalhes</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {steps.map((step) => {
              const paddedOrder = String(step.order).padStart(2, "0");

              return (
                <TableRow
                  key={step.id}
                  className="border-border hover:bg-ifflow-bone/60"
                >
                  <TableCell className="px-6 py-5 font-mono text-4xl font-light leading-none text-foreground/80">
                    {paddedOrder}
                  </TableCell>

                  <TableCell className="px-6 py-5 align-top">
                    <div className="max-w-[32rem]">
                      <p className="text-[15px] font-semibold leading-[1.35] text-foreground">
                        {step.title}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="px-6 py-5 align-top">
                    <div className="space-y-1">
                      <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-foreground">
                        {step.sector.acronym}
                      </p>
                      <p className="text-sm leading-[1.35] text-muted-foreground">
                        {step.sector.name}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="px-6 py-5 align-top text-[15px] leading-[1.35] text-foreground">
                    {step.responsible}
                  </TableCell>

                  <TableCell className="px-6 py-5 align-top text-[15px] leading-[1.35] text-muted-foreground">
                    {step.estimated_time}
                  </TableCell>

                  <TableCell className="px-6 py-5 align-top">
                    {renderStatusControl ? renderStatusControl(step) : null}
                  </TableCell>

                  <TableCell className="px-6 py-5 text-right align-top">
                    <button
                      type="button"
                      onClick={() => onSelectStep?.(step)}
                      aria-label={`Ver detalhes da etapa ${step.order}: ${step.title}`}
                      className="inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-primary transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      Detalhes
                      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-5 flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          {steps.length} etapas · {sectorCount} setores
        </p>
        <p>Ordenadas pela sequência oficial</p>
      </div>
    </div>
  );
}
