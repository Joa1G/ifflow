import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useApproveUserMutation } from "../../hooks/use-admin-users";
import type { ApiError } from "../../lib/api-error";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { PendingUserCardUser } from "./pending-user-card";

interface ApproveUserDialogProps {
  user: PendingUserCardUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Traduz códigos de erro específicos da moderação para mensagens humanas.
 * Qualquer outro código cai no fallback da mensagem que o backend já manda
 * em `err.message` (pt-BR por contrato do CONTRACTS.md).
 */
function errorMessage(err: ApiError): string {
  switch (err.code) {
    case "USER_NOT_PENDING":
      return "Este cadastro já foi moderado por outro administrador.";
    case "USER_NOT_FOUND":
      return "Cadastro não encontrado. A lista foi atualizada.";
    case "CANNOT_MODERATE_SELF":
      return "Não é possível moderar o próprio cadastro.";
    default:
      return err.message;
  }
}

/**
 * Dialog de confirmação da aprovação.
 *
 * A aprovação é idempotente do ponto de vista da UX: se o admin clica em
 * cima de um cadastro que outro admin já aprovou, recebe `USER_NOT_PENDING`
 * e a lista é invalidada pela mutation — o item some e o admin vê a
 * realidade. Por isso o dialog fecha mesmo em erro.
 */
export function ApproveUserDialog({
  user,
  open,
  onOpenChange,
}: ApproveUserDialogProps) {
  const mutation = useApproveUserMutation();

  const handleApprove = () => {
    mutation.mutate(user.id, {
      onSuccess: () => {
        toast.success(`Cadastro de ${user.name} aprovado.`);
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(errorMessage(err));
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-medium tracking-tight text-ifflow-ink">
            Aprovar cadastro
          </DialogTitle>
          <DialogDescription className="text-sm text-ifflow-muted">
            Confirmar aprovação de{" "}
            <span className="font-medium text-ifflow-ink">{user.name}</span>?
            Será enviado um email avisando que o acesso ao portal foi
            liberado.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 border-ifflow-rule"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-9 bg-ifflow-green font-medium text-white hover:bg-ifflow-green-hover"
            onClick={handleApprove}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aprovando…
              </>
            ) : (
              "Aprovar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
