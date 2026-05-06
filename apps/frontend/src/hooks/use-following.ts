import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { apiGet } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";

type UserProgressListResponse =
  components["schemas"]["UserProgressListResponse"];

/**
 * Chave de cache da listagem "Processos que acompanho".
 *
 * Centralizada porque qualquer mutation que mude o conjunto de processos
 * acompanhados (futuramente: marcar etapa, deixar de acompanhar) precisa
 * invalidar exatamente esta chave para forçar refetch.
 */
export const followingQueryKey = () => ["progress", "mine"] as const;

/**
 * Lista os processos que o usuário autenticado está acompanhando.
 *
 * `user_id` é inferido do JWT pelo backend — nada vai na URL ou body,
 * mantendo o mesmo padrão de IDOR-safe usado em `useProgress`.
 *
 * Retorna o envelope com `following` para alinhar com o contrato do
 * backend (`ProcessesManagementListResponse` adota o mesmo formato).
 */
export function useFollowing(): UseQueryResult<
  UserProgressListResponse,
  ApiError
> {
  return useQuery<UserProgressListResponse, ApiError>({
    queryKey: followingQueryKey(),
    queryFn: () => apiGet<UserProgressListResponse>("/progress/mine"),
  });
}
