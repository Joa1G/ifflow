import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { apiGet } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";
import {
  myProcessesQueryKey,
  type AdminProcessesListFilters,
} from "./use-processes-management";

type ProcessesManagementListResponse =
  components["schemas"]["ProcessesManagementListResponse"];

/**
 * Lista os processos criados pelo usuário autenticado (qualquer status).
 *
 * Backend filtra por `created_by = JWT.sub`, então a query é segura para
 * USER comum: nenhum filtro de ownership precisa ser duplicado aqui.
 *
 * Compartilha o tipo `AdminProcessesListFilters` com a lista de moderação
 * porque o envelope e os filtros suportados (status/category) são iguais —
 * o que muda é só o escopo de quais processos o backend devolve.
 */
export function useMyProcesses(
  filters: AdminProcessesListFilters = {},
): UseQueryResult<ProcessesManagementListResponse, ApiError> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  const qs = params.toString();
  const path = qs ? `/processes/mine?${qs}` : "/processes/mine";

  return useQuery<ProcessesManagementListResponse, ApiError>({
    queryKey: myProcessesQueryKey(filters),
    queryFn: () => apiGet<ProcessesManagementListResponse>(path),
  });
}
