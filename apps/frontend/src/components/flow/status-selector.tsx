import { Loader2 } from "lucide-react";

import {
  STEP_STATUSES,
  stepStatusColors,
  stepStatusLabels,
} from "../../lib/status-colors";
import { cn } from "../../lib/utils";
import type { components } from "../../types/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type StepStatus = components["schemas"]["StepStatus"];

interface StatusSelectorProps {
  status: StepStatus;
  onChange: (next: StepStatus) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  /** Usado pelo aria-label para identificar qual etapa o seletor controla. */
  stepLabel: string;
}

/**
 * Seletor de status do checklist pessoal (F-20).
 *
 * A cor de fundo do trigger reflete o estado atual (`stepStatusColors`) — o
 * usuário percebe o status só de bater o olho, mesmo sem abrir o menu.
 * Isso é um complemento visual; o DESIGN_SYSTEM proíbe usar cor como ÚNICA
 * forma de comunicar status, então o label textual ("Aguardando" etc.) está
 * sempre presente dentro do trigger.
 *
 * `isUpdating` troca o chevron por um spinner enquanto a mutation roda —
 * serve como feedback visual imediato, e junto com `disabled` evita que o
 * usuário dispare vários PATCHs em sequência contra o mesmo step.
 */
export function StatusSelector({
  status,
  onChange,
  disabled = false,
  isUpdating = false,
  stepLabel,
}: StatusSelectorProps) {
  return (
    <Select
      value={status}
      onValueChange={(next) => onChange(next as StepStatus)}
      disabled={disabled || isUpdating}
    >
      <SelectTrigger
        aria-label={`Status da etapa: ${stepLabel}`}
        className={cn(
          "h-8 w-full gap-2 border px-3 text-xs font-medium transition-colors",
          stepStatusColors[status],
        )}
      >
        {isUpdating ? (
          <Loader2
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 animate-spin opacity-70"
          />
        ) : null}
        <SelectValue placeholder={stepStatusLabels[status]} />
      </SelectTrigger>
      <SelectContent>
        {STEP_STATUSES.map((value) => (
          <SelectItem key={value} value={value} className="text-xs">
            {stepStatusLabels[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
