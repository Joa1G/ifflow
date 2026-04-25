import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
} from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";

type ProcessAdminView = components["schemas"]["ProcessAdminView"];
type ProcessCreate = components["schemas"]["ProcessCreate"];
type ProcessUpdate = components["schemas"]["ProcessUpdate"];
type ProcessesAdminListResponse =
  components["schemas"]["ProcessesAdminListResponse"];
type ProcessStatus = components["schemas"]["ProcessStatus"];
type ProcessCategory = components["schemas"]["ProcessCategory"];
type FlowStepAdminView = components["schemas"]["FlowStepAdminView"];
type FlowStepCreate = components["schemas"]["FlowStepCreate"];
type FlowStepUpdate = components["schemas"]["FlowStepUpdate"];
type StepResourceAdminView = components["schemas"]["StepResourceAdminView"];
type StepResourceCreate = components["schemas"]["StepResourceCreate"];

export interface AdminProcessesListFilters {
  status?: ProcessStatus;
  category?: ProcessCategory;
}

/**
 * Hooks do editor admin de processos (F-22).
 *
 * Convenções:
 * - Cada mutation invalida `["admin-process", id]` no `onSettled` para que
 *   a página recarregue o estado canônico do servidor — evita UI dessincronizada
 *   quando, por exemplo, o backend incrementa `updated_at`.
 * - Resources e steps usam o mesmo bucket `["admin-process", id]` porque o
 *   endpoint admin de processo já retorna tudo embutido.
 * - `user_id` / `created_by` nunca aparecem aqui — vêm do JWT no backend.
 */

export const adminProcessQueryKey = (processId: string | undefined) =>
  ["admin-process", processId] as const;

// Mantemos o mesmo prefixo `["admin-processes-list", ...]` para que
// `invalidateQueries({ queryKey: ["admin-processes-list"] })` derrube
// todas as variantes de filtro (status/category) de uma só vez.
export const adminProcessesListQueryKey = (
  filters: AdminProcessesListFilters = {},
) => ["admin-processes-list", filters] as const;

/**
 * Lista admin de processos (F-23) — vê todos os status, opcionalmente
 * filtrados por status e/ou category. O backend exige role ADMIN/SUPER_ADMIN.
 *
 * As contagens por status para os filtros vêm da própria lista quando
 * `filters.status` é undefined; o componente pode aplicar `Array.filter`
 * em cima do `data.processes` para popular badges sem nova requisição.
 */
export function useAdminProcessesList(
  filters: AdminProcessesListFilters = {},
): UseQueryResult<ProcessesAdminListResponse, ApiError> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  const qs = params.toString();
  const path = qs ? `/admin/processes?${qs}` : "/admin/processes";

  return useQuery<ProcessesAdminListResponse, ApiError>({
    queryKey: adminProcessesListQueryKey(filters),
    queryFn: () => apiGet<ProcessesAdminListResponse>(path),
  });
}

export function useAdminProcess(
  processId: string | undefined,
): UseQueryResult<ProcessAdminView, ApiError> {
  return useQuery<ProcessAdminView, ApiError>({
    queryKey: adminProcessQueryKey(processId),
    queryFn: () =>
      apiGet<ProcessAdminView>(`/admin/processes/${processId}`),
    enabled: Boolean(processId),
  });
}

export function useCreateProcess(): UseMutationResult<
  ProcessAdminView,
  ApiError,
  ProcessCreate
> {
  const queryClient = useQueryClient();
  return useMutation<ProcessAdminView, ApiError, ProcessCreate>({
    mutationFn: (body) =>
      apiPost<ProcessAdminView>("/admin/processes", body),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-processes-list"] });
    },
  });
}

interface UpdateProcessInput {
  processId: string;
  patch: ProcessUpdate;
}

export function useUpdateProcess(): UseMutationResult<
  ProcessAdminView,
  ApiError,
  UpdateProcessInput
> {
  const queryClient = useQueryClient();
  return useMutation<ProcessAdminView, ApiError, UpdateProcessInput>({
    mutationFn: ({ processId, patch }) =>
      apiPatch<ProcessAdminView>(`/admin/processes/${processId}`, patch),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminProcessQueryKey(variables.processId),
      });
      queryClient.invalidateQueries({ queryKey: ["admin-processes-list"] });
    },
  });
}

interface CreateStepInput {
  processId: string;
  body: FlowStepCreate;
}

export function useCreateStep(): UseMutationResult<
  FlowStepAdminView,
  ApiError,
  CreateStepInput
> {
  const queryClient = useQueryClient();
  return useMutation<FlowStepAdminView, ApiError, CreateStepInput>({
    mutationFn: ({ processId, body }) =>
      apiPost<FlowStepAdminView>(
        `/admin/processes/${processId}/steps`,
        body,
      ),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminProcessQueryKey(variables.processId),
      });
      // O editor mostra steps + resources via useProcessFlow, então
      // mutar qualquer step/resource também precisa revalidar o flow.
      queryClient.invalidateQueries({
        queryKey: ["process-flow", variables.processId],
      });
    },
  });
}

interface UpdateStepInput {
  processId: string;
  stepId: string;
  patch: FlowStepUpdate;
}

export function useUpdateStep(): UseMutationResult<
  FlowStepAdminView,
  ApiError,
  UpdateStepInput
> {
  const queryClient = useQueryClient();
  return useMutation<FlowStepAdminView, ApiError, UpdateStepInput>({
    mutationFn: ({ processId, stepId, patch }) =>
      apiPatch<FlowStepAdminView>(
        `/admin/processes/${processId}/steps/${stepId}`,
        patch,
      ),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminProcessQueryKey(variables.processId),
      });
      // O editor mostra steps + resources via useProcessFlow, então
      // mutar qualquer step/resource também precisa revalidar o flow.
      queryClient.invalidateQueries({
        queryKey: ["process-flow", variables.processId],
      });
    },
  });
}

interface DeleteStepInput {
  processId: string;
  stepId: string;
}

export function useDeleteStep(): UseMutationResult<
  void,
  ApiError,
  DeleteStepInput
> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, DeleteStepInput>({
    mutationFn: ({ processId, stepId }) =>
      apiDelete<void>(`/admin/processes/${processId}/steps/${stepId}`),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminProcessQueryKey(variables.processId),
      });
      // O editor mostra steps + resources via useProcessFlow, então
      // mutar qualquer step/resource também precisa revalidar o flow.
      queryClient.invalidateQueries({
        queryKey: ["process-flow", variables.processId],
      });
    },
  });
}

interface CreateResourceInput {
  processId: string;
  stepId: string;
  body: StepResourceCreate;
}

export function useCreateResource(): UseMutationResult<
  StepResourceAdminView,
  ApiError,
  CreateResourceInput
> {
  const queryClient = useQueryClient();
  return useMutation<StepResourceAdminView, ApiError, CreateResourceInput>({
    mutationFn: ({ processId, stepId, body }) =>
      apiPost<StepResourceAdminView>(
        `/admin/processes/${processId}/steps/${stepId}/resources`,
        body,
      ),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminProcessQueryKey(variables.processId),
      });
      // O editor mostra steps + resources via useProcessFlow, então
      // mutar qualquer step/resource também precisa revalidar o flow.
      queryClient.invalidateQueries({
        queryKey: ["process-flow", variables.processId],
      });
    },
  });
}

interface DeleteResourceInput {
  processId: string;
  stepId: string;
  resourceId: string;
}

export function useDeleteResource(): UseMutationResult<
  void,
  ApiError,
  DeleteResourceInput
> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, DeleteResourceInput>({
    mutationFn: ({ processId, stepId, resourceId }) =>
      apiDelete<void>(
        `/admin/processes/${processId}/steps/${stepId}/resources/${resourceId}`,
      ),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: adminProcessQueryKey(variables.processId),
      });
      // O editor mostra steps + resources via useProcessFlow, então
      // mutar qualquer step/resource também precisa revalidar o flow.
      queryClient.invalidateQueries({
        queryKey: ["process-flow", variables.processId],
      });
    },
  });
}

// ---------- Transições de status (F-23) ----------
//
// Helper compartilhado de invalidação. Toda transição altera o status
// admin, e PUBLISHED/ARCHIVED também afetam o que aparece na listagem
// pública e no detalhe público — invalidar tudo de uma vez é mais
// simples (e barato) do que decidir caso a caso pelo status alvo.
function invalidateProcessCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  processId: string,
) {
  queryClient.invalidateQueries({
    queryKey: adminProcessQueryKey(processId),
  });
  queryClient.invalidateQueries({ queryKey: ["admin-processes-list"] });
  queryClient.invalidateQueries({ queryKey: ["processes"] });
  queryClient.invalidateQueries({ queryKey: ["process", processId] });
}

interface ProcessTransitionInput {
  processId: string;
}

export function useSubmitProcessForReview(): UseMutationResult<
  ProcessAdminView,
  ApiError,
  ProcessTransitionInput
> {
  const queryClient = useQueryClient();
  return useMutation<ProcessAdminView, ApiError, ProcessTransitionInput>({
    mutationFn: ({ processId }) =>
      apiPost<ProcessAdminView>(
        `/admin/processes/${processId}/submit-for-review`,
        {},
      ),
    onSettled: (_d, _e, variables) =>
      invalidateProcessCaches(queryClient, variables.processId),
  });
}

export function useApproveProcess(): UseMutationResult<
  ProcessAdminView,
  ApiError,
  ProcessTransitionInput
> {
  const queryClient = useQueryClient();
  return useMutation<ProcessAdminView, ApiError, ProcessTransitionInput>({
    mutationFn: ({ processId }) =>
      apiPost<ProcessAdminView>(
        `/admin/processes/${processId}/approve`,
        {},
      ),
    onSettled: (_d, _e, variables) =>
      invalidateProcessCaches(queryClient, variables.processId),
  });
}

export function useArchiveProcess(): UseMutationResult<
  ProcessAdminView,
  ApiError,
  ProcessTransitionInput
> {
  const queryClient = useQueryClient();
  return useMutation<ProcessAdminView, ApiError, ProcessTransitionInput>({
    // DELETE no admin é soft delete — backend devolve o ProcessAdminView
    // já com status=ARCHIVED, então tratamos como mutation de retorno.
    mutationFn: ({ processId }) =>
      apiDelete<ProcessAdminView>(`/admin/processes/${processId}`),
    onSettled: (_d, _e, variables) =>
      invalidateProcessCaches(queryClient, variables.processId),
  });
}
