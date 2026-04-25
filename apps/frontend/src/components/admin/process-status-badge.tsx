import { Archive, CheckCircle2, Clock, PencilLine } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import type { components } from "../../types/api";

type ProcessStatus = components["schemas"]["ProcessStatus"];

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

interface StatusConfig {
  label: string;
  variant: BadgeVariant;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  className?: string;
}

// Mapeamento centralizado: PUBLISHED é o único estado que carrega o
// verde institucional (variant=default), virando referência visual de
// "está no ar". ARCHIVED usa borda tracejada + texto muted para
// comunicar "estado terminal" sem depender só de cor (REQ-052).
const STATUS_CONFIG: Record<ProcessStatus, StatusConfig> = {
  DRAFT: {
    label: "Rascunho",
    variant: "outline",
    icon: PencilLine,
  },
  IN_REVIEW: {
    label: "Em revisão",
    variant: "secondary",
    icon: Clock,
  },
  PUBLISHED: {
    label: "Publicado",
    variant: "default",
    icon: CheckCircle2,
  },
  ARCHIVED: {
    label: "Arquivado",
    variant: "outline",
    icon: Archive,
    className: "border-dashed text-muted-foreground",
  },
};

interface ProcessStatusBadgeProps {
  status: ProcessStatus;
  className?: string;
}

export function ProcessStatusBadge({
  status,
  className,
}: ProcessStatusBadgeProps) {
  const { label, variant, icon: Icon, className: variantClass } =
    STATUS_CONFIG[status];
  return (
    <Badge
      variant={variant}
      className={cn("gap-1.5 font-medium", variantClass, className)}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}
