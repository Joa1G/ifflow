import type { components } from "../types/api";

type UserRole = components["schemas"]["UserRole"];

/**
 * Hierarquia de roles. SUPER_ADMIN > ADMIN > USER. Comparações são feitas
 * por rank numérico (rota com `requiredRole=ADMIN` aceita SUPER_ADMIN).
 */
export const roleRank: Record<UserRole, number> = {
  USER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

interface RoutePrefixGuard {
  prefix: string;
  minRole: UserRole;
}

/**
 * Prefixos de rota com role mínima exigida. A ordem importa: prefixos
 * mais específicos (`/super-admin`) antes dos mais gerais (`/admin`).
 *
 * Mantido em sincronia com as rotas declaradas em App.tsx — a fonte da
 * verdade para autorização real é o backend, mas estes prefixos refletem
 * o desenho de UX e permitem decisões de redirect no client (p. ex. evitar
 * mandar um USER que acabou de logar para uma rota /admin que ele não
 * pode acessar — caso contrário ele aterrissaria em /forbidden).
 */
const PROTECTED_ROUTE_PREFIXES: ReadonlyArray<RoutePrefixGuard> = [
  { prefix: "/super-admin", minRole: "SUPER_ADMIN" },
  { prefix: "/admin", minRole: "ADMIN" },
];

/**
 * Retorna `true` se a role fornecida é suficiente para acessar o pathname.
 *
 * Rotas fora dos prefixos protegidos são consideradas acessíveis (público
 * ou apenas-autenticado — o caller já tem o user em mãos quando chama
 * isso, então a parte "está logado?" é responsabilidade dele).
 *
 * Aceita `pathname` cru (sem normalização) — case-sensitive como o
 * próprio React Router. URLs com query string ou hash não são esperadas
 * aqui (o caller deve passar `location.pathname`).
 */
export function userCanAccess(pathname: string, role: UserRole): boolean {
  for (const { prefix, minRole } of PROTECTED_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return roleRank[role] >= roleRank[minRole];
    }
  }
  return true;
}
