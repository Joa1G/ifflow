import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../hooks/use-auth";
import type { components } from "../../types/api";

type UserRole = components["schemas"]["UserRole"];

/**
 * Hierarquia de roles. Um requiredRole="ADMIN" aceita também SUPER_ADMIN.
 * Mantida como tabela de rank para permitir comparações numéricas diretas.
 */
const roleRank: Record<UserRole, number> = {
  USER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: UserRole;
}

/**
 * Rota protegida por autenticação e (opcionalmente) role mínima.
 *
 * Segurança: esta verificação é apenas UX. A autorização real é sempre
 * feita pelo backend — um usuário que contornar o frontend ainda recebe
 * 401/403 ao chamar o endpoint protegido. Este componente existe para
 * evitar que o usuário veja telas às quais claramente não tem acesso.
 */
export function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const { isAuthenticated, user, isHydrating } = useAuth();
  const location = useLocation();

  // Enquanto a sessão está sendo validada no bootstrap, o AuthBootstrap
  // já renderiza um loading global. Aqui retornamos null para não
  // disparar um redirect prematuro para /login.
  if (isHydrating) {
    return null;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && roleRank[user.role] < roleRank[requiredRole]) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
