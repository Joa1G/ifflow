import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient global do IFFLOW.
 *
 * Configuração padrão acordada na task F-04:
 *   - retry: 1             → uma única tentativa após falha (evita cascata
 *                            de retries em 4xx, que o backend não vai resolver)
 *   - refetchOnWindowFocus: false → Evita refetches ao voltar pra aba; o
 *                                    usuário institucional alterna muito
 *                                    entre SIPAC e IFFLOW e isso poluiria
 *                                    a rede.
 *   - staleTime: 30_000    → 30s de "freshness" antes de considerar
 *                            os dados staled e permitir refetch.
 *
 * Invalidações explícitas (após mutations) continuam funcionando
 * normalmente — staleTime só afeta refetches *automáticos*.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
