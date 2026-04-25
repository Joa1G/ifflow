import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { apiGet } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { components } from "../types/api";

type SectorsListResponse = components["schemas"]["SectorsListResponse"];

export const SECTORS_QUERY_KEY = ["sectors"] as const;

/**
 * Lista os setores institucionais cadastrados (B-26).
 *
 * Catálogo é gerenciado via seed no backend (não há CRUD por endpoint),
 * então o staleTime padrão do TanStack Query (30s) é mais que suficiente
 * — em pratica os dados quase nunca mudam durante a sessão.
 */
export function useSectors(): UseQueryResult<SectorsListResponse, ApiError> {
  return useQuery<SectorsListResponse, ApiError>({
    queryKey: SECTORS_QUERY_KEY,
    queryFn: () => apiGet<SectorsListResponse>("/sectors"),
  });
}
