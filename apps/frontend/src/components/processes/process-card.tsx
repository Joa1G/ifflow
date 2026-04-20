import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { components } from "../../types/api";
import { Badge } from "../ui/badge";

type ProcessCategory = components["schemas"]["ProcessCategory"];

/** Cores fechadas do DESIGN_SYSTEM.md — não inventar. */
const categoryBadgeClass: Record<ProcessCategory, string> = {
  RH: "bg-blue-100 text-blue-900",
  MATERIAIS: "bg-amber-100 text-amber-900",
  FINANCEIRO: "bg-emerald-100 text-emerald-900",
  TECNOLOGIA: "bg-violet-100 text-violet-900",
  INFRAESTRUTURA: "bg-orange-100 text-orange-900",
  CONTRATACOES: "bg-rose-100 text-rose-900",
};

const categoryLabel: Record<ProcessCategory, string> = {
  RH: "Recursos Humanos",
  MATERIAIS: "Materiais",
  FINANCEIRO: "Financeiro",
  TECNOLOGIA: "Tecnologia",
  INFRAESTRUTURA: "Infraestrutura",
  CONTRATACOES: "Contratações",
};

export interface ProcessCardData {
  id: string;
  title: string;
  short_description: string;
  category: ProcessCategory;
  estimated_time: string;
  step_count: number;
}

interface ProcessCardProps {
  process: ProcessCardData;
}

/**
 * Deriva um "código de catálogo" curto a partir do UUID (4 primeiros
 * hex, uppercase). É decorativo — não tem significado no backend. O
 * objetivo é reforçar o DNA de arquivo institucional que a tela adota
 * (ver briefing F-15).
 */
function buildReferenceCode(id: string): string {
  const slug = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `PROC-${slug}`;
}

export function ProcessCard({ process }: ProcessCardProps) {
  const categoryClass = categoryBadgeClass[process.category];
  const categoryText = categoryLabel[process.category];
  const stepLabel =
    process.step_count === 1 ? "1 etapa" : `${process.step_count} etapas`;

  return (
    <Link
      to={`/processes/${process.id}`}
      aria-label={`Abrir detalhes do processo ${process.title}`}
      className="group flex h-full flex-col justify-between rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <Badge
            variant="outline"
            className={`border-transparent ${categoryClass}`}
          >
            {categoryText}
          </Badge>
          <span
            aria-hidden
            className="font-mono text-xs tracking-wider text-muted-foreground"
          >
            {buildReferenceCode(process.id)}
          </span>
        </div>

        <div className="space-y-2">
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-foreground">
            {process.title}
          </h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {process.short_description}
          </p>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {stepLabel}
            <span aria-hidden className="mx-2">
              ·
            </span>
            {process.estimated_time}
          </span>
          <ArrowRight
            aria-hidden
            className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </div>
      </div>
    </Link>
  );
}
