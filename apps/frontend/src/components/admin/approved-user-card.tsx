import { ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  useDemoteUser,
  usePromoteUser,
} from "../../hooks/use-super-admin-users";
import { cn } from "../../lib/utils";
import type { ApiError } from "../../lib/api-error";
import type { components } from "../../types/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { RoleBadge } from "./role-badge";

type ApprovedUserView = components["schemas"]["ApprovedUserView"];

interface ApprovedUserCardProps {
  user: ApprovedUserView;
  /**
   * ID do usuário logado, para sinalizar visualmente "este é você" e
   * desabilitar a ação no próprio card. Backend também bloqueia
   * (CANNOT_DEMOTE_SELF), mas a UX é mais clara se nunca chegar lá.
   */
  currentUserId: string | null;
}

/**
 * Extrai até 2 letras maiúsculas a partir do nome — usadas como
 * monograma editorial à esquerda do card. Regras:
 *  - Primeira inicial da primeira palavra
 *  - Primeira inicial da última palavra (se houver mais de 1 palavra)
 *  - Ignora preposições comuns (de, do, da, dos, das)
 */
function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => !["de", "do", "da", "dos", "das"].includes(p.toLowerCase()));
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function transitionErrorMessage(err: ApiError): string {
  switch (err.code) {
    case "CANNOT_DEMOTE_SELF":
      return "Não é possível rebaixar a si mesmo.";
    case "CANNOT_DEMOTE_SUPER_ADMIN":
      return "Super administradores não podem ser rebaixados pelo painel.";
    case "INVALID_ROLE_TRANSITION":
      return "Este usuário já está nesse papel. A lista foi atualizada.";
    case "USER_NOT_FOUND":
      return "Usuário não encontrado. A lista foi atualizada.";
    case "USER_NOT_APPROVED":
      return "Apenas usuários aprovados podem ter o papel alterado.";
    default:
      return err.message;
  }
}

export function ApprovedUserCard({
  user,
  currentUserId,
}: ApprovedUserCardProps) {
  const isSelf = currentUserId !== null && user.id === currentUserId;

  return (
    <li
      className={cn(
        "relative grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 rounded-md border border-ifflow-rule bg-ifflow-paper p-5 md:grid-cols-[auto_1fr_auto] md:gap-x-5 md:p-6",
        // Fio à esquerda em ifflow-ink marca o card do próprio user
        // — é uma marca topológica, não cromática.
        isSelf && "border-l-[3px] border-l-ifflow-ink",
      )}
    >
      {isSelf && (
        <span
          aria-label="Este é você"
          className="absolute right-4 top-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ifflow-muted"
        >
          Você
        </span>
      )}

      {/* Monograma — substitui a numeração editorial do pending-user-card.
          Iniciais ancoram a identidade da pessoa, não a posição na fila. */}
      <span
        aria-hidden
        className="row-span-2 flex h-10 w-10 items-center justify-center rounded-md border border-ifflow-rule bg-ifflow-bone font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ifflow-ink md:row-span-1"
      >
        {initials(user.name)}
      </span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="truncate font-serif text-lg font-medium text-ifflow-ink">
            {user.name}
          </h3>
          <RoleBadge role={user.role} />
        </div>
        <p className="mt-0.5 truncate text-sm text-ifflow-muted">
          {user.email}
        </p>

        <Separator className="my-3 bg-ifflow-rule" />

        <p className="text-xs uppercase tracking-[0.08em] text-ifflow-muted">
          SIAPE {user.siape}
          <span aria-hidden className="mx-1.5 text-ifflow-rule">
            /
          </span>
          {user.sector}
        </p>
      </div>

      <div className="col-span-2 md:col-span-1 md:col-start-3 md:self-center">
        <RoleAction user={user} isSelf={isSelf} />
      </div>
    </li>
  );
}

interface RoleActionProps {
  user: ApprovedUserView;
  isSelf: boolean;
}

function RoleAction({ user, isSelf }: RoleActionProps) {
  if (user.role === "SUPER_ADMIN") {
    // A ausência de botão É a mensagem. A nota italic em muted estabelece
    // registro tipográfico de "informação meta" vs "ação".
    return (
      <p className="max-w-[180px] text-left text-xs italic text-ifflow-muted md:text-right">
        Papel não gerenciado por este painel.
      </p>
    );
  }

  if (isSelf) {
    return (
      <div className="flex flex-col gap-1.5 md:items-end">
        <Button
          variant="outline"
          disabled
          aria-disabled="true"
          className="h-9 w-full cursor-not-allowed border-ifflow-rule text-ifflow-muted md:w-auto"
        >
          {user.role === "USER"
            ? "Promover a administrador"
            : "Rebaixar a servidor"}
        </Button>
        <p className="text-[11px] text-ifflow-muted">
          Não é possível alterar o próprio papel.
        </p>
      </div>
    );
  }

  return user.role === "USER" ? (
    <PromoteAction user={user} />
  ) : (
    <DemoteAction user={user} />
  );
}

function PromoteAction({ user }: { user: ApprovedUserView }) {
  const [open, setOpen] = useState(false);
  const mutation = usePromoteUser();

  const handleConfirm = () => {
    mutation.mutate(user.id, {
      onSuccess: () => {
        toast.success(`${user.name} agora é administrador.`);
        setOpen(false);
      },
      onError: (err) => {
        toast.error(transitionErrorMessage(err));
        setOpen(false);
      },
    });
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 w-full bg-ifflow-green font-medium text-white hover:bg-ifflow-green-hover md:w-auto"
      >
        <ArrowUpCircle className="mr-2 h-4 w-4" aria-hidden />
        Promover a administrador
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium tracking-tight text-ifflow-ink">
              Promover a administrador?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-ifflow-muted">
              <span className="font-medium text-ifflow-ink">{user.name}</span>{" "}
              poderá criar e editar processos administrativos, e moderar
              cadastros pendentes. A mudança vale imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={mutation.isPending}
              className="border-ifflow-rule"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Sem preventDefault o Radix fecha o dialog antes da
                // mutation terminar e perde o estado de loading.
                event.preventDefault();
                handleConfirm();
              }}
              disabled={mutation.isPending}
              className="bg-ifflow-green text-white hover:bg-ifflow-green-hover"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Promovendo…
                </>
              ) : (
                "Promover"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DemoteAction({ user }: { user: ApprovedUserView }) {
  const [open, setOpen] = useState(false);
  const mutation = useDemoteUser();

  const handleConfirm = () => {
    mutation.mutate(user.id, {
      onSuccess: () => {
        toast.success(`${user.name} voltou a ser servidor.`);
        setOpen(false);
      },
      onError: (err) => {
        toast.error(transitionErrorMessage(err));
        setOpen(false);
      },
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-full border-ifflow-rule font-medium md:w-auto"
      >
        <ArrowDownCircle className="mr-2 h-4 w-4" aria-hidden />
        Rebaixar a servidor
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium tracking-tight text-ifflow-ink">
              Rebaixar a servidor?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-ifflow-muted">
              <span className="font-medium text-ifflow-ink">{user.name}</span>{" "}
              perderá acesso ao painel administrativo, mas mantém o cadastro
              ativo no portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={mutation.isPending}
              className="border-ifflow-rule"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirm();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rebaixando…
                </>
              ) : (
                "Rebaixar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

