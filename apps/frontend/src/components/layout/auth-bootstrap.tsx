import { Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useAuthStore } from "../../stores/auth-store";

interface AuthBootstrapProps {
  children: ReactNode;
}

/**
 * Bootstrap da sessão de autenticação.
 *
 * Ao montar, dispara `hydrate()` do auth-store, que valida o token
 * persistido em localStorage chamando `GET /auth/me`. Enquanto a
 * validação não termina (e o user ainda não foi carregado), renderiza
 * um indicador de loading em tela cheia. Isso evita um "flash" de
 * conteúdo anônimo antes da sessão ser restaurada.
 *
 * Quando não há token persistido, renderiza children imediatamente.
 */
export function AuthBootstrap({ children }: AuthBootstrapProps) {
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const hydrate = useAuthStore((s) => s.hydrate);

  const [hadInitialToken] = useState(() =>
    Boolean(useAuthStore.getState().token),
  );
  const [hydrationFinished, setHydrationFinished] = useState(false);

  useEffect(() => {
    // Se não havia token persistido, não há sessão a restaurar — evita
    // um setState desnecessário (e o warning de act() em testes).
    if (!hadInitialToken) return;
    void hydrate().finally(() => setHydrationFinished(true));
  }, [hydrate, hadInitialToken]);

  const waitingFirstHydration = hadInitialToken && !hydrationFinished;

  if (isHydrating || waitingFirstHydration) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          <span className="text-sm">Carregando sessão...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
