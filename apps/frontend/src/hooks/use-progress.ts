import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { apiGet, apiPatch } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";

type UserProgressRead = components["schemas"]["UserProgressRead"];
type StepStatus = components["schemas"]["StepStatus"];

/**
 * Chave de cache do progresso de um processo específico. Centralizada para
 * que a mutation invalide exatamente o mesmo bucket em `onSettled`.
 */
export function progressQueryKey(processId: string | undefined) {
  return ["progress", processId] as const;
}

/**
 * Busca o progresso do usuário autenticado em um processo.
 *
 * O backend (B-23) faz auto-create com todas as etapas em `PENDING` na
 * primeira chamada, então o frontend não precisa de um endpoint separado
 * de "criar progresso". `user_id` é inferido do JWT — nunca passamos no
 * request (ver checklist de segurança da F-19).
 *
 * A query fica desabilitada se `processId` ainda não estiver disponível
 * (ex: `useParams()` antes do mount), seguindo o mesmo padrão de
 * `useProcess`.
 */
export function useProgress(
  processId: string | undefined,
): UseQueryResult<UserProgressRead, ApiError> {
  return useQuery<UserProgressRead, ApiError>({
    queryKey: progressQueryKey(processId),
    queryFn: () => apiGet<UserProgressRead>(`/progress/${processId}`),
    enabled: Boolean(processId),
  });
}

interface UpdateStepStatusInput {
  processId: string;
  stepId: string;
  status: StepStatus;
}

/**
 * Atualiza o status de uma etapa no checklist pessoal.
 *
 * `PATCH /progress/{process_id}/steps/{step_id}` aceita apenas `{status}`
 * no body — o backend tem `extra="forbid"`, qualquer tentativa de mandar
 * `user_id` ou `process_id` no body é rejeitada lá. O `process_id` vai
 * pela URL e o `user_id` pelo JWT.
 *
 * `onSettled` invalida a query do progresso (mesmo em erro) para forçar
 * o cache a refletir o estado real do servidor — evita UI dessincronizada
 * em casos de race ou conflito de negócio.
 */
export function useUpdateStepStatus(): UseMutationResult<
  UserProgressRead,
  ApiError,
  UpdateStepStatusInput
> {
  const queryClient = useQueryClient();

  return useMutation<UserProgressRead, ApiError, UpdateStepStatusInput>({
    mutationFn: ({ processId, stepId, status }) =>
      apiPatch<UserProgressRead>(
        `/progress/${processId}/steps/${stepId}`,
        { status },
      ),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: progressQueryKey(variables.processId),
      });
    },
  });
}
