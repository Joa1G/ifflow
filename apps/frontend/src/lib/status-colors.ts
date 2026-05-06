import type { components } from "../types/api";

type StepStatus = components["schemas"]["StepStatus"];

/**
 * Cores semânticas dos três estados do checklist pessoal.
 *
 * Fonte: DESIGN_SYSTEM.md > "Cores semânticas para status de progresso".
 * São as **únicas** cores fixas permitidas fora das variáveis CSS do
 * shadcn — representam estados universais (parado, em andamento, feito)
 * e por isso não seguem a paleta institucional.
 */
export const stepStatusColors: Record<StepStatus, string> = {
  PENDING: "bg-muted text-muted-foreground border-border",
  IN_PROGRESS:
    "bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
  COMPLETED:
    "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
};

export const stepStatusLabels: Record<StepStatus, string> = {
  PENDING: "Aguardando",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
};

export const STEP_STATUSES: readonly StepStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
