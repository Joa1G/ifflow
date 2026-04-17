import { useState } from "react";

import { Button } from "../ui/button";
import { ApproveUserDialog } from "./approve-user-dialog";
import { RejectUserDialog } from "./reject-user-dialog";

export interface PendingUserCardUser {
  id: string;
  name: string;
  email: string;
  siape: string;
  sector: string;
  created_at: string;
}

interface PendingUserCardProps {
  user: PendingUserCardUser;
  index: number;
}

/**
 * Formata um ISO timestamp como "há X dias" para datas recentes (<7d) ou
 * como "12 abr 2026" caso contrário. Mantido inline aqui porque é o único
 * consumidor — extrair para lib/ no primeiro segundo uso.
 */
function formatRegisteredAt(iso: string): string {
  const now = new Date();
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 1) return "hoje";
  if (diffDays === 1) return "há 1 dia";
  if (diffDays < 7) return `há ${diffDays} dias`;

  return then.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Linha de um cadastro pendente.
 *
 * Projetada para viver dentro de um card único com `divide-y` — não tem
 * borda própria. A numeração "01." vem do index e dá sensação de fila
 * ordenada (o backend retorna created_at asc, então 01 é quem esperou mais).
 *
 * Os dialogs de aprovação/rejeição são montados em estado local para
 * ficar colocalizados com os botões que os disparam. Cada linha carrega
 * seus dois dialogs fechados — só um abre por vez, e o Radix cuida do
 * unmount quando fecha.
 */
export function PendingUserCard({ user, index }: PendingUserCardProps) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <li className="group flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="mt-0.5 w-8 shrink-0 font-serif text-sm tabular-nums text-ifflow-muted"
        >
          {String(index + 1).padStart(2, "0")}.
        </span>

        <div className="min-w-0">
          <p className="truncate font-serif text-lg font-medium text-ifflow-ink">
            {user.name}
          </p>
          <p className="truncate text-sm text-ifflow-muted">{user.email}</p>

          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted">
            SIAPE {user.siape} <span aria-hidden>·</span> {user.sector}
          </p>
          <p className="mt-0.5 text-xs text-ifflow-muted">
            Solicitado {formatRegisteredAt(user.created_at)}
          </p>
        </div>
      </div>

      <div className="flex gap-2 md:shrink-0">
        <Button
          type="button"
          variant="outline"
          className="h-9 flex-1 border-ifflow-rule text-red-700 hover:bg-red-50 hover:text-red-700 md:flex-none"
          onClick={() => setRejectOpen(true)}
        >
          Rejeitar
        </Button>
        <Button
          type="button"
          className="h-9 flex-1 bg-ifflow-green font-medium text-white hover:bg-ifflow-green-hover md:flex-none"
          onClick={() => setApproveOpen(true)}
        >
          Aprovar
        </Button>
      </div>

      <ApproveUserDialog
        user={user}
        open={approveOpen}
        onOpenChange={setApproveOpen}
      />
      <RejectUserDialog
        user={user}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />
    </li>
  );
}
