import { KeyRound, ShieldCheck, User } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { cn } from "../../lib/utils";
import type { components } from "../../types/api";
import { Badge } from "../ui/badge";

type UserRole = components["schemas"]["UserRole"];

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

interface RoleConfig {
  label: string;
  variant: BadgeVariant;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

// Padrão F-23/F-24: um único variant (default = verde institucional)
// pertence ao papel mais raro e relevante (SUPER_ADMIN). USER e ADMIN
// se diferenciam por densidade (outline vs preenchido) + ícone — REQ-052
// (cor nunca é canal único).
const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  USER: {
    label: "Servidor",
    variant: "outline",
    icon: User,
  },
  ADMIN: {
    label: "Administrador",
    variant: "secondary",
    icon: ShieldCheck,
  },
  SUPER_ADMIN: {
    // KeyRound > Crown: chave conota "guardião do acesso", coerente com
    // instituição pública. Crown carrega conotação monárquica.
    label: "Super administrador",
    variant: "default",
    icon: KeyRound,
  },
};

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const { label, variant, icon: Icon } = ROLE_CONFIG[role];
  return (
    <Badge variant={variant} className={cn("gap-1.5 font-medium", className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}
