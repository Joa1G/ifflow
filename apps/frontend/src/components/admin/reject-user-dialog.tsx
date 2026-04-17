import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useRejectUserMutation } from "../../hooks/use-admin-users";
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
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import type { PendingUserCardUser } from "./pending-user-card";

interface RejectUserDialogProps {
  user: PendingUserCardUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_REASON_LENGTH = 500;

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
 * Dialog de rejeição com campo de motivo opcional.
 *
 * O textarea é local (useState) e zerado quando o dialog fecha, pra não
 * vazar motivo entre dois usuários rejeitados em sequência. A validação
 * de tamanho é só `maxLength` do input — o backend já limita em 500 via
 * schema, e essa é apenas uma proteção de UX antes do round-trip.
 */
export function RejectUserDialog({
  user,
  open,
  onOpenChange,
}: RejectUserDialogProps) {
  const [reason, setReason] = useState("");
  const mutation = useRejectUserMutation();

  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  const handleReject = () => {
    const trimmed = reason.trim();
    mutation.mutate(
      { userId: user.id, reason: trimmed || undefined },
      {
        onSuccess: () => {
          toast.success(`Cadastro de ${user.name} rejeitado.`);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(errorMessage(err));
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-medium tracking-tight text-ifflow-ink">
            Rejeitar cadastro
          </DialogTitle>
          <DialogDescription className="text-sm text-ifflow-muted">
            O cadastro de{" "}
            <span className="font-medium text-ifflow-ink">{user.name}</span>{" "}
            ficará marcado como rejeitado e um email será enviado. O motivo é
            opcional; se informado, aparecerá no corpo do email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label
            htmlFor="reject-reason"
            className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
          >
            Motivo (opcional)
          </Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={MAX_REASON_LENGTH}
            rows={4}
            placeholder="Ex: SIAPE não confere com os registros da DGP."
            className="resize-none border-ifflow-rule bg-transparent text-[15px] placeholder:text-ifflow-muted/60 focus-visible:ring-ifflow-green"
            disabled={mutation.isPending}
          />
          <p className="text-right text-xs tabular-nums text-ifflow-muted">
            {reason.length}/{MAX_REASON_LENGTH}
          </p>
        </div>

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
            variant="outline"
            className="h-9 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
            onClick={handleReject}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rejeitando…
              </>
            ) : (
              "Rejeitar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
