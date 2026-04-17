import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { apiGet, apiPost } from "../lib/api-client";
import type { ApiError } from "../lib/api-error";
import type { LoginInput, RegisterInput } from "../lib/validators/auth";
import { useAuthStore, type UserMe } from "../stores/auth-store";
import type { components } from "../types/api";

/**
 * Hook de acesso à sessão de autenticação.
 *
 * Expõe o estado atual (token, user, flags) e as ações do auth-store
 * (login, logout) em uma API estável. Componentes devem importar
 * daqui em vez de acessar `useAuthStore` diretamente — isso isola a
 * dependência do Zustand e facilita migração futura.
 */
export function useAuth(): {
  token: string | null;
  user: UserMe | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  login: (token: string, user: UserMe) => void;
  logout: () => void;
} {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);

  return {
    token,
    user,
    isAuthenticated: Boolean(token && user),
    isHydrating,
    login: setAuth,
    logout,
  };
}

type LoginResponse = components["schemas"]["LoginResponse"];

/**
 * Mutation de login.
 *
 * Fluxo em duas etapas para popular o store com um `UserMe` completo:
 *   1. `POST /auth/login` devolve token + `LoginUserInfo` (forma reduzida).
 *   2. Salvamos o token no store para habilitar o header Authorization do
 *      api-client, e em seguida chamamos `GET /auth/me` para obter o
 *      `UserMe` completo (siape, status, created_at etc).
 *
 * Se o segundo passo falhar, limpamos o token para evitar uma sessão
 * inconsistente (token válido, user ausente) e propagamos o erro.
 *
 * Usamos `useAuthStore.setState` diretamente em vez de `setAuth` porque
 * temos o token antes do user — evita um valor intermediário falso.
 */
export function useLoginMutation(): UseMutationResult<
  LoginResponse,
  ApiError,
  LoginInput
> {
  return useMutation<LoginResponse, ApiError, LoginInput>({
    mutationFn: async (credentials) => {
      const res = await apiPost<LoginResponse>("/auth/login", credentials);
      useAuthStore.setState({ token: res.access_token });
      try {
        const me = await apiGet<UserMe>("/auth/me");
        useAuthStore.setState({ user: me });
      } catch (err) {
        useAuthStore.setState({ token: null, user: null });
        throw err;
      }
      return res;
    },
  });
}

type RegisterResponse = components["schemas"]["RegisterResponse"];

/**
 * Mutation de cadastro.
 *
 * Chama `POST /auth/register` e devolve o `RegisterResponse` (id, status=PENDING,
 * mensagem). Deliberadamente NÃO faz login automático: o usuário recém-criado
 * está em status PENDING e não tem permissão para acessar o app — deixar isso
 * explícito evita o anti-padrão "criei conta, por que não entro?" e mantém o
 * fluxo de aprovação do administrador como única porta de entrada.
 *
 * O componente que consome essa mutation é responsável por redirecionar para
 * /pending em sucesso e traduzir os códigos de erro do backend.
 */
export function useRegisterMutation(): UseMutationResult<
  RegisterResponse,
  ApiError,
  RegisterInput
> {
  return useMutation<RegisterResponse, ApiError, RegisterInput>({
    mutationFn: (input) => apiPost<RegisterResponse>("/auth/register", input),
  });
}
