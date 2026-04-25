import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";
import { useAuth } from "./use-auth";

type PendingUsersListResponse =
  components["schemas"]["PendingUsersListResponse"];
type ProcessesAdminListResponse =
  components["schemas"]["ProcessesAdminListResponse"];

export interface AdminNotifications {
  pendingUsersCount: number;
  pendingProcessesCount: number;
  total: number;
  isLoading: boolean;
}

/**
 * Contadores de itens aguardando ação do administrador (cadastros pendentes
 * + processos IN_REVIEW). Usado pela bolinha de notificação na avatar do
 * Header.
 *
 * Reusa as mesmas queryKeys das listas admin para compartilhar cache:
 * quando o admin abre `/admin/users` ou `/admin/processes`, a página
 * usa o mesmo bucket — sem refetch duplicado. Mutations existentes
 * (`useApproveUserMutation`, `useApproveProcess`) já invalidam essas
 * chaves, então o badge atualiza sozinho após cada aprovação.
 *
 * Gated por role: o `enabled: isAdmin` evita 401/403 desnecessários
 * (e o teste de USER que aborta em `onUnhandledRequest: "error"` ficaria
 * vermelho se essas queries disparassem para usuário comum).
 */
export function useAdminNotifications(): AdminNotifications {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  // As duas chaves abaixo PRECISAM bater com `PENDING_USERS_KEY` em
  // use-admin-users.ts e com `adminProcessesListQueryKey({status: "IN_REVIEW"})`
  // em use-admin-processes.ts — assim a página admin e o badge consomem
  // o mesmo bucket de cache, e as mutations de aprovar (que já invalidam
  // essas chaves) atualizam o badge sem código extra.
  const usersQuery = useQuery<PendingUsersListResponse, ApiError>({
    queryKey: ["admin", "pending-users"],
    queryFn: () => apiGet<PendingUsersListResponse>("/admin/users/pending"),
    enabled: isAdmin,
  });

  const processesQuery = useQuery<ProcessesAdminListResponse, ApiError>({
    queryKey: ["admin-processes-list", { status: "IN_REVIEW" }],
    queryFn: () =>
      apiGet<ProcessesAdminListResponse>(
        "/admin/processes?status=IN_REVIEW",
      ),
    enabled: isAdmin,
  });

  const pendingUsersCount = usersQuery.data?.total ?? 0;
  const pendingProcessesCount = processesQuery.data?.total ?? 0;

  return {
    pendingUsersCount,
    pendingProcessesCount,
    total: pendingUsersCount + pendingProcessesCount,
    isLoading: usersQuery.isLoading || processesQuery.isLoading,
  };
}
