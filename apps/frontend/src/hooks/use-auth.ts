import { useAuthStore, type UserMe } from "../stores/auth-store";

/**
 * Hook de acesso à sessão de autenticação.
 *
 * Expõe o estado atual (token, user, flags) e as ações do auth-store
 * (login, logout) em uma API estável. Componentes devem importar
 * daqui em vez de acessar `useAuthStore` diretamente — isso isola a
 * dependência do Zustand e facilita migração futura.
 *
 * A mutation de login de fato (chamada a `POST /auth/login`) vive na
 * F-09 como `useLoginMutation`. Aqui, `login(token, user)` é apenas o
 * callback que popula o store após a mutation ter sucesso.
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
