import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { apiGet } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";

type ProcessCategory = components["schemas"]["ProcessCategory"];
type ProcessesPublicListResponse =
  components["schemas"]["ProcessesPublicListResponse"];
type ProcessPublicDetail = components["schemas"]["ProcessPublicDetail"];
type ProcessFullFlow = components["schemas"]["ProcessFullFlow"];

export interface ProcessesFilters {
  search?: string;
  category?: ProcessCategory;
}

/**
 * Monta a query string sem enviar chaves vazias. `search=""` e `category`
 * ausente viram URLs sem o parâmetro — isso mantém a chave de cache
 * consistente (veja `buildProcessesQueryKey`) e evita refetch desnecessário
 * quando o usuário limpa o campo de busca.
 */
function buildProcessesQuery(filters: ProcessesFilters | undefined): string {
  const params = new URLSearchParams();
  const search = filters?.search?.trim();
  if (search) {
    params.set("search", search);
  }
  if (filters?.category) {
    params.set("category", filters.category);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function buildProcessesQueryKey(filters: ProcessesFilters | undefined) {
  const search = filters?.search?.trim() ?? "";
  const category = filters?.category ?? null;
  return ["processes", { search, category }] as const;
}

/**
 * Lista os processos públicos, opcionalmente filtrados por termo de busca
 * e categoria. Endpoint público — não exige autenticação.
 */
export function useProcesses(
  filters?: ProcessesFilters,
): UseQueryResult<ProcessesPublicListResponse, ApiError> {
  return useQuery<ProcessesPublicListResponse, ApiError>({
    queryKey: buildProcessesQueryKey(filters),
    queryFn: () =>
      apiGet<ProcessesPublicListResponse>(
        `/processes${buildProcessesQuery(filters)}`,
      ),
  });
}

/**
 * Detalhe público de um processo (sem o fluxo). Cada GET incrementa
 * `access_count` no backend (ADR-008) — é comportamento esperado e
 * não precisa ser controlado no frontend.
 *
 * O parâmetro `id` pode vir indefinido (ex: `useParams()` antes do mount).
 * Nesse caso a query fica desabilitada e não dispara requisição.
 */
export function useProcess(
  id: string | undefined,
): UseQueryResult<ProcessPublicDetail, ApiError> {
  return useQuery<ProcessPublicDetail, ApiError>({
    queryKey: ["process", id] as const,
    queryFn: () => apiGet<ProcessPublicDetail>(`/processes/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Fluxo completo de um processo. Exige autenticação (ADR-006) — em uso
 * real a tela já está atrás de `<ProtectedRoute>`, mas se o token
 * expirar o `api-client` propaga `ApiError` com status 401 e o handler
 * global de auth-store desloga o usuário.
 */
export function useProcessFlow(
  id: string | undefined,
): UseQueryResult<ProcessFullFlow, ApiError> {
  return useQuery<ProcessFullFlow, ApiError>({
    queryKey: ["process-flow", id] as const,
    queryFn: () => apiGet<ProcessFullFlow>(`/processes/${id}/flow`),
    enabled: Boolean(id),
  });
}
