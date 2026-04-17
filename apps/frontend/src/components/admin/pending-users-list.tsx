import { RefreshCw } from "lucide-react";

import { useAdminPendingUsers } from "../../hooks/use-admin-users";
import { Button } from "../ui/button";
import { PendingUserCard } from "./pending-user-card";

/**
 * Lista de cadastros pendentes com 4 estados visuais.
 *
 * Todos os estados vivem DENTRO do mesmo container (card externo no page)
 * pra o layout não dar pulo quando a query transita de loading → dados.
 * Os esqueletos imitam a altura real de uma linha (py-5 + nome + detalhes).
 */
export function PendingUsersList() {
  const query = useAdminPendingUsers();

  if (query.isLoading) {
    return (
      <ul
        aria-busy
        aria-label="Carregando cadastros pendentes"
        className="divide-y divide-ifflow-rule"
      >
        {[0, 1, 2].map((i) => (
          <li key={i} className="px-6 py-5">
            <div className="flex animate-pulse items-start gap-4">
              <div className="h-4 w-6 rounded bg-ifflow-rule/40" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-ifflow-rule/40" />
                <div className="h-3 w-64 rounded bg-ifflow-rule/30" />
                <div className="h-3 w-40 rounded bg-ifflow-rule/30" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 bg-ifflow-bone/40 px-6 py-8">
        <p className="font-serif text-lg text-ifflow-ink">
          Não foi possível carregar a lista.
        </p>
        <p className="text-sm text-ifflow-muted">
          {query.error.message ||
            "Verifique sua conexão e tente novamente em instantes."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-1 h-9 border-ifflow-rule"
          onClick={() => query.refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  const users = query.data?.users ?? [];

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="font-serif text-2xl font-medium tracking-tight text-ifflow-ink">
          Nenhum cadastro pendente.
        </p>
        <p className="max-w-sm text-sm text-ifflow-muted">
          Quando houver solicitações novas, elas aparecem aqui em ordem de
          chegada.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-ifflow-rule">
      {users.map((user, index) => (
        <PendingUserCard key={user.id} user={user} index={index} />
      ))}
    </ul>
  );
}
