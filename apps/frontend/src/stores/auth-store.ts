import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  apiGet,
  setAuthTokenProvider,
  setUnauthorizedHandler,
} from "../lib/api-client";
import { ApiError } from "../lib/api-error";
import type { components } from "../types/api";

/**
 * Store de autenticação do IFFLOW (Zustand + persist).
 *
 * Regras (ADR-011 e CLAUDE.md do frontend):
 *   - É o ÚNICO lugar onde token e user autenticado vivem.
 *   - Dados vindos da API (processos, progresso, etc) NÃO entram aqui —
 *     vão para o cache do TanStack Query.
 *   - Apenas o `token` é persistido em localStorage. O `user` é recarregado
 *     via `GET /auth/me` a cada hidratação (fluxo bootstrap, F-06).
 */

export type UserMe = components["schemas"]["UserMe"];

interface AuthState {
  token: string | null;
  user: UserMe | null;
  isHydrating: boolean;

  setAuth: (token: string, user: UserMe) => void;
  setUser: (user: UserMe) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

const STORAGE_KEY = "ifflow-auth";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isHydrating: false,

      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),

      hydrate: async () => {
        const { token } = get();
        if (!token) {
          set({ isHydrating: false });
          return;
        }

        set({ isHydrating: true });
        try {
          const user = await apiGet<UserMe>("/auth/me");
          set({ user, isHydrating: false });
        } catch (err) {
          // Falha ao validar token: limpa a sessão local. O usuário
          // será redirecionado para /login pelo fluxo de rotas
          // protegidas (F-07).
          if (err instanceof ApiError) {
            console.warn(
              "[auth-store] Falha ao hidratar sessão:",
              err.code,
            );
          }
          set({ token: null, user: null, isHydrating: false });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Persistimos APENAS o token. O user é sempre recarregado via
      // /auth/me no bootstrap — garante que dados de perfil (role,
      // status) refletem o estado atual do backend, não um snapshot
      // possivelmente stale do localStorage.
      partialize: (state) => ({ token: state.token }),
    },
  ),
);

/**
 * Conecta o store ao api-client:
 *   - Expõe o token atual para o header Authorization.
 *   - Faz logout automático quando o backend devolve 401
 *     UNAUTHENTICATED / INVALID_TOKEN.
 *
 * É chamada como side-effect ao importar o módulo, então qualquer
 * consumidor (bootstrap do App, hooks, testes após reset) tem os
 * providers registrados automaticamente.
 */
export function wireAuthStoreToApiClient(): void {
  setAuthTokenProvider(() => useAuthStore.getState().token);
  setUnauthorizedHandler(() => useAuthStore.getState().logout());
}

wireAuthStoreToApiClient();
