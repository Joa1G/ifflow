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
type ProcessesManagementListResponse =
  components["schemas"]["ProcessesManagementListResponse"];
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
 * Hooks de gestão de processos.
 *
 * Após a regra "USER cria processos / ADMIN aprova" (2026-04-25), o CRUD vive em
 * `/processes/*` e é compartilhado entre autor e admin; `/admin/processes` ficou
 * reduzido a moderação (lista IN_REVIEW + approve).
 *
 * Convenções:
 * - Cada mutation invalida `["process-management", id]` no `onSettled` para que
 *   a página recarregue o estado canônico do servidor — evita UI dessincronizada
 *   quando, por exemplo, o backend incrementa `updated_at`.
 * - Resources e steps usam o mesmo bucket `["process-management", id]` porque o
 *   endpoint de management já retorna tudo embutido.
 * - `created_by` nunca aparece no payload — vem do JWT no backend.
 */

export const processManagementQueryKey = (processId: string | undefined) =>
  ["process-management", processId] as const;

// Mantemos o mesmo prefixo `["admin-processes-list", ...]` para que
// `invalidateQueries({ queryKey: ["admin-processes-list"] })` derrube
// todas as variantes de filtro (status/category) de uma só vez. O bucket
// é compartilhado com `useAdminNotifications` (badge de moderação).
export const adminProcessesListQueryKey = (
  filters: AdminProcessesListFilters = {},
) => ["admin-processes-list", filters] as const;

export const myProcessesQueryKey = (
  filters: AdminProcessesListFilters = {},
) => ["my-processes", filters] as const;

/**
 * Lista admin de moderação — vê todos os processos em qualquer status,
 * opcionalmente filtrados. O backend exige role ADMIN/SUPER_ADMIN.
 */
export function useAdminProcessesList(
  filters: AdminProcessesListFilters = {},
): UseQueryResult<ProcessesManagementListResponse, ApiError> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  const qs = params.toString();
  const path = qs ? `/admin/processes?${qs}` : "/admin/processes";

  return useQuery<ProcessesManagementListResponse, ApiError>({
    queryKey: adminProcessesListQueryKey(filters),
    queryFn: () => apiGet<ProcessesManagementListResponse>(path),
  });
}

/**
 * Detalhe de um processo para edição — autor (qualquer status do próprio)
 * ou admin (qualquer processo). O backend retorna 403 PROCESS_NOT_OWNED se
 * o requester não for autor nem admin.
 */
export function useProcessForManagement(
  processId: string | undefined,
): UseQueryResult<ProcessAdminView, ApiError> {
  return useQuery<ProcessAdminView, ApiError>({
    queryKey: processManagementQueryKey(processId),
    queryFn: () =>
      apiGet<ProcessAdminView>(`/processes/${processId}/management`),
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
    mutationFn: (body) => apiPost<ProcessAdminView>("/processes", body),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-processes-list"] });
      queryClient.invalidateQueries({ queryKey: ["my-processes"] });
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
      apiPatch<ProcessAdminView>(`/processes/${processId}`, patch),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: processManagementQueryKey(variables.processId),
      });
      queryClient.invalidateQueries({ queryKey: ["admin-processes-list"] });
      queryClient.invalidateQueries({ queryKey: ["my-processes"] });
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
      apiPost<FlowStepAdminView>(`/processes/${processId}/steps`, body),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: processManagementQueryKey(variables.processId),
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
        `/processes/${processId}/steps/${stepId}`,
        patch,
      ),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: processManagementQueryKey(variables.processId),
      });
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
      apiDelete<void>(`/processes/${processId}/steps/${stepId}`),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: processManagementQueryKey(variables.processId),
      });
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
        `/processes/${processId}/steps/${stepId}/resources`,
        body,
      ),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: processManagementQueryKey(variables.processId),
      });
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
        `/processes/${processId}/steps/${stepId}/resources/${resourceId}`,
      ),
    onSettled: (_d, _e, variables) => {
      queryClient.invalidateQueries({
        queryKey: processManagementQueryKey(variables.processId),
      });
      queryClient.invalidateQueries({
        queryKey: ["process-flow", variables.processId],
      });
    },
  });
}

// ---------- Transições de status ----------
//
// Helper compartilhado de invalidação. Toda transição altera o status
// do processo, e PUBLISHED/ARCHIVED também afetam o que aparece na
// listagem pública e no detalhe público — invalidar tudo de uma vez é
// mais simples (e barato) do que decidir caso a caso pelo status alvo.
function invalidateProcessCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  processId: string,
) {
  queryClient.invalidateQueries({
    queryKey: processManagementQueryKey(processId),
  });
  queryClient.invalidateQueries({ queryKey: ["admin-processes-list"] });
  queryClient.invalidateQueries({ queryKey: ["my-processes"] });
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
        `/processes/${processId}/submit-for-review`,
        {},
      ),
    onSettled: (_d, _e, variables) =>
      invalidateProcessCaches(queryClient, variables.processId),
  });
}

/**
 * Retira um processo IN_REVIEW de volta para DRAFT (autor desistiu da
 * submissão para poder editar). Endpoint exclusivo do autor; admin que
 * queira reverter usa o fluxo normal de approve/archive.
 */
export function useWithdrawProcess(): UseMutationResult<
  ProcessAdminView,
  ApiError,
  ProcessTransitionInput
> {
  const queryClient = useQueryClient();
  return useMutation<ProcessAdminView, ApiError, ProcessTransitionInput>({
    mutationFn: ({ processId }) =>
      apiPost<ProcessAdminView>(`/processes/${processId}/withdraw`, {}),
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
    // DELETE no /processes/{id} é soft delete — backend devolve o
    // ProcessAdminView já com status=ARCHIVED, então tratamos como
    // mutation de retorno. Autor só consegue arquivar DRAFT/IN_REVIEW
    // (PUBLISHED requer admin); o backend devolve 403 caso contrário.
    mutationFn: ({ processId }) =>
      apiDelete<ProcessAdminView>(`/processes/${processId}`),
    onSettled: (_d, _e, variables) =>
      invalidateProcessCaches(queryClient, variables.processId),
  });
}
