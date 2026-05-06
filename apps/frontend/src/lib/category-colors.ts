import type { components } from "../types/api";

type ProcessCategory = components["schemas"]["ProcessCategory"];

/**
 * Cores fechadas do DESIGN_SYSTEM.md — únicas tonalidades extras permitidas
 * fora das variáveis CSS do shadcn (representam categorias institucionais).
 *
 * Mantém-se em sincronia com `categoryBadgeClass` inline em
 * `components/processes/process-card.tsx`. Se uma categoria nova for
 * adicionada ao backend, o tipo `ProcessCategory` força a atualização aqui.
 */
export const categoryColors: Record<ProcessCategory, string> = {
  RH: "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200",
  MATERIAIS:
    "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  FINANCEIRO:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  TECNOLOGIA:
    "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200",
  INFRAESTRUTURA:
    "bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200",
  CONTRATACOES:
    "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200",
};

export const categoryLabel: Record<ProcessCategory, string> = {
  RH: "Recursos Humanos",
  MATERIAIS: "Materiais",
  FINANCEIRO: "Financeiro",
  TECNOLOGIA: "Tecnologia",
  INFRAESTRUTURA: "Infraestrutura",
  CONTRATACOES: "Contratações",
};
