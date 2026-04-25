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
  IN_PROGRESS: "bg-blue-50 text-blue-900 border-blue-300",
  COMPLETED: "bg-emerald-50 text-emerald-900 border-emerald-300",
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
