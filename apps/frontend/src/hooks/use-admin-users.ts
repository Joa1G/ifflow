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

type PendingUsersListResponse =
  components["schemas"]["PendingUsersListResponse"];
type UserStatusChangeResponse =
  components["schemas"]["UserStatusChangeResponse"];

/**
 * Chave única para a query de cadastros pendentes. Centralizada para que
 * as mutations invalidem exatamente o mesmo bucket de cache.
 */
const PENDING_USERS_KEY = ["admin", "pending-users"] as const;

/**
 * Lista os cadastros aguardando moderação.
 *
 * O endpoint exige role ADMIN ou SUPER_ADMIN; a tela que consome já fica
 * atrás de `<ProtectedRoute requiredRole="ADMIN">`. Em caso de requisição
 * feita por alguém sem permissão (bug de roteamento, token defasado), o
 * `api-client` lança um `ApiError` com status 401/403 que o componente
 * trata como erro regular da query.
 */
export function useAdminPendingUsers(): UseQueryResult<
  PendingUsersListResponse,
  ApiError
> {
  return useQuery<PendingUsersListResponse, ApiError>({
    queryKey: PENDING_USERS_KEY,
    queryFn: () => apiGet<PendingUsersListResponse>("/admin/users/pending"),
  });
}

/**
 * Aprova um cadastro pendente.
 *
 * Em sucesso invalida `PENDING_USERS_KEY` — isso faz o usuário aprovado
 * sumir da lista sem precisar de um refetch manual. Erros de negócio
 * (`USER_NOT_PENDING`, `USER_NOT_FOUND`) caem no `onError` do chamador,
 * que decide a mensagem.
 *
 * Mesmo em erros que significam "esse user saiu do estado PENDING entre
 * o load e o clique" (409), invalidamos também pra forçar a lista a
 * refletir a realidade — evita o usuário aparecer duas vezes como
 * pendente.
 */
export function useApproveUserMutation(): UseMutationResult<
  UserStatusChangeResponse,
  ApiError,
  string // user_id
> {
  const queryClient = useQueryClient();

  return useMutation<UserStatusChangeResponse, ApiError, string>({
    mutationFn: (userId) =>
      apiPost<UserStatusChangeResponse>(`/admin/users/${userId}/approve`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_USERS_KEY });
    },
  });
}

interface RejectUserInput {
  userId: string;
  reason?: string;
}

/**
 * Rejeita um cadastro pendente.
 *
 * `reason` é opcional. Se ausente ou vazio, o backend gera um email
 * genérico (ver backend user_service.reject_user). O frontend NÃO precisa
 * normalizar string vazia — o backend já trata isso.
 *
 * Igual ao approve, invalidamos a lista em `onSettled` para refletir o
 * estado real do servidor mesmo em 409 (caso raro de race entre dois
 * admins moderando o mesmo cadastro).
 */
export function useRejectUserMutation(): UseMutationResult<
  UserStatusChangeResponse,
  ApiError,
  RejectUserInput
> {
  const queryClient = useQueryClient();

  return useMutation<UserStatusChangeResponse, ApiError, RejectUserInput>({
    mutationFn: ({ userId, reason }) =>
      apiPost<UserStatusChangeResponse>(
        `/admin/users/${userId}/reject`,
        reason ? { reason } : {},
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_USERS_KEY });
    },
  });
}
