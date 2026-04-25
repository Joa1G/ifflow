import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { apiGet, apiPost } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";

type ApprovedUsersListResponse =
  components["schemas"]["ApprovedUsersListResponse"];
type RoleChangeResponse = components["schemas"]["RoleChangeResponse"];

/**
 * Chave única da query de gestão de papéis. Centralizada para que ambas
 * as mutations (promote e demote) invalidem o mesmo bucket de cache.
 */
const APPROVED_USERS_KEY = ["super-admin", "approved-users"] as const;

/**
 * Lista todos os usuários APPROVED do sistema, com role atual.
 *
 * O endpoint exige role SUPER_ADMIN; a tela que consome já está atrás de
 * `<ProtectedRoute requiredRole="SUPER_ADMIN">`. Em caso de chamada por
 * alguém sem permissão (token defasado, bug de roteamento), o api-client
 * lança um ApiError 401/403 e a query cai em isError.
 */
export function useApprovedUsers(): UseQueryResult<
  ApprovedUsersListResponse,
  ApiError
> {
  return useQuery<ApprovedUsersListResponse, ApiError>({
    queryKey: APPROVED_USERS_KEY,
    queryFn: () => apiGet<ApprovedUsersListResponse>("/super-admin/users"),
  });
}

/**
 * Promove um usuário para ADMIN.
 *
 * Mutation invalida APPROVED_USERS_KEY mesmo em erro — assim o card vai
 * para a seção correta caso o estado real do servidor tenha mudado entre
 * o load e o clique (ex: dois super_admins promovendo o mesmo user).
 *
 * O backend bloqueia promover um SUPER_ADMIN ou um já-ADMIN
 * (INVALID_ROLE_TRANSITION); o frontend só esconde o botão como UX.
 */
export function usePromoteUser(): UseMutationResult<
  RoleChangeResponse,
  ApiError,
  string
> {
  const queryClient = useQueryClient();
  return useMutation<RoleChangeResponse, ApiError, string>({
    mutationFn: (userId) =>
      apiPost<RoleChangeResponse>(`/super-admin/users/${userId}/promote`, {}),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: APPROVED_USERS_KEY });
    },
  });
}

/**
 * Rebaixa um usuário ADMIN de volta para USER.
 *
 * O backend tem duas travas críticas (testadas lá, redundância aqui é
 * só UX): (a) `CANNOT_DEMOTE_SELF` — super_admin não pode rebaixar a si
 * mesmo, e (b) `CANNOT_DEMOTE_SUPER_ADMIN` — não dá para rebaixar outro
 * super_admin pelo painel. O frontend reflete isso escondendo/desabilitando
 * o botão; mas se algo escapar e a request chegar, o backend devolve 403.
 */
export function useDemoteUser(): UseMutationResult<
  RoleChangeResponse,
  ApiError,
  string
> {
  const queryClient = useQueryClient();
  return useMutation<RoleChangeResponse, ApiError, string>({
    mutationFn: (userId) =>
      apiPost<RoleChangeResponse>(`/super-admin/users/${userId}/demote`, {}),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: APPROVED_USERS_KEY });
    },
  });
}
