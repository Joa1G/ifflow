import { cn } from "../../lib/utils";

interface SectionEyebrowProps {
  index: string;
  label: string;
  className?: string;
}

/**
 * Cabeçalho editorial de seção. Mantém o ritmo visual de "documento dividido
 * em capítulos" — index em monospace + hairline + título serif. Usado tanto
 * na seção de Metadados quanto na de Etapas do editor admin.
 */
export function SectionEyebrow({ index, label, className }: SectionEyebrowProps) {
  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      <span
        aria-hidden
        className="font-mono text-xs font-medium tracking-[0.2em] text-ifflow-muted"
      >
        {index}
      </span>
      <span aria-hidden className="h-px flex-1 bg-ifflow-rule" />
      <h2 className="font-serif text-xl font-medium text-ifflow-ink">{label}</h2>
    </div>
  );
}
