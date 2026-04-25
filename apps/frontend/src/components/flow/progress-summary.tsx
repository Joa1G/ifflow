import { Clock } from "lucide-react";
import { useMemo } from "react";

import { formatRelativeTime } from "../../lib/relative-time";
import { STEP_STATUSES, stepStatusLabels } from "../../lib/status-colors";
import { cn } from "../../lib/utils";
import type { components } from "../../types/api";
import { Skeleton } from "../ui/skeleton";

type StepStatus = components["schemas"]["StepStatus"];

interface ProgressSummaryProps {
  /** Mapa `step_id → status` do UserProgressRead. */
  stepStatuses: Record<string, StepStatus>;
  /** Total de etapas no fluxo — usado para exibir "X de N". */
  totalSteps: number;
  /** ISO da última atualização, ou null enquanto carrega. */
  lastUpdated: string | null;
  isLoading?: boolean;
}

/**
 * Card-resumo do checklist pessoal com contagem por status e tempo
 * relativo desde a última mudança (F-21).
 *
 * As cores usadas aqui NÃO são as cores de status do DESIGN_SYSTEM
 * (`stepStatusColors`) — aquelas são para backgrounds de elementos
 * interativos (o seletor). Aqui usamos a paleta institucional
 * (muted/primary/emerald) porque o componente é puramente informativo,
 * e o DESIGN_SYSTEM reforça: "não usar cor como única forma de
 * comunicar status" — a label textual ("Aguardando" etc.) sempre aparece
 * junto do ícone/bolinha.
 */
export function ProgressSummary({
  stepStatuses,
  totalSteps,
  lastUpdated,
  isLoading = false,
}: ProgressSummaryProps) {
  const counts = useMemo(() => {
    const acc: Record<StepStatus, number> = {
      PENDING: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
    };
    for (const status of Object.values(stepStatuses)) acc[status] += 1;
    // Etapas ainda sem entrada no JSONB contam como PENDING — isso
    // alinha com o contrato do backend (auto-create inicializa em PENDING).
    const tracked = Object.keys(stepStatuses).length;
    if (tracked < totalSteps) acc.PENDING += totalSteps - tracked;
    return acc;
  }, [stepStatuses, totalSteps]);

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-[repeat(3,1fr)_auto]"
      >
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const relative = lastUpdated ? formatRelativeTime(lastUpdated) : "";

  return (
    <section
      aria-label="Resumo do meu progresso"
      className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-[repeat(3,1fr)_auto]"
    >
      {STEP_STATUSES.map((status) => (
        <StatusPill
          key={status}
          status={status}
          count={counts[status]}
          total={totalSteps}
        />
      ))}

      <div className="flex items-center gap-2 self-center border-t border-border pt-3 text-xs text-muted-foreground sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span>
          {lastUpdated ? (
            <>
              Atualizado <span className="font-medium text-foreground">{relative}</span>
            </>
          ) : (
            <>Sem atualizações ainda</>
          )}
        </span>
      </div>
    </section>
  );
}

function StatusPill({
  status,
  count,
  total,
}: {
  status: StepStatus;
  count: number;
  total: number;
}) {
  const dotColor = {
    PENDING: "bg-muted-foreground/40",
    IN_PROGRESS: "bg-blue-500",
    COMPLETED: "bg-emerald-500",
  }[status];

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={cn("h-2 w-2 shrink-0 rounded-full", dotColor)}
      />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {stepStatusLabels[status]}
        </span>
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {count}
          <span className="text-muted-foreground"> de {total}</span>
        </span>
      </div>
    </div>
  );
}
