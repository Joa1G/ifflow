import {
  Archive,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  useApproveProcess,
  useArchiveProcess,
  useSubmitProcessForReview,
} from "../../hooks/use-admin-processes";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type ProcessAdminView = components["schemas"]["ProcessAdminView"];

interface ProcessRowActionsProps {
  process: ProcessAdminView;
}

// Códigos específicos das transições; o backend devolve mensagens em
// pt-BR, mas alguns códigos justificam um texto contextual mais claro.
function transitionErrorMessage(err: ApiError, fallback: string): string {
  switch (err.code) {
    case "PROCESS_NOT_FOUND":
      return "Processo não encontrado. A lista foi atualizada.";
    case "PROCESS_INVALID_STATUS":
    case "INVALID_STATUS_TRANSITION":
      return "O processo já mudou de estado. Atualizando a lista…";
    default:
      return err.message || fallback;
  }
}

/**
 * Menu de ações por linha da tabela admin (F-23).
 *
 * Decisões:
 * - Dropdown único `MoreHorizontal` em vez de botões inline. Mantém a
 *   tabela respirando e esconde a ação destrutiva (arquivar) atrás de um
 *   clique deliberado.
 * - As ações de transição aparecem só quando aplicáveis ao status atual
 *   (ex: "Submeter para revisão" só em DRAFT). Isso é UX — o backend
 *   continua sendo a fonte da verdade para autorizar a transição (ADR-008).
 * - Arquivar abre AlertDialog conforme DESIGN_SYSTEM ("Modal de
 *   confirmação destrutiva"), com texto institucional explicando o efeito.
 */
export function ProcessRowActions({ process }: ProcessRowActionsProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  const submitMutation = useSubmitProcessForReview();
  const approveMutation = useApproveProcess();
  const archiveMutation = useArchiveProcess();

  const isPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    archiveMutation.isPending;

  const handleSubmit = () => {
    submitMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () =>
          toast.success(`"${process.title}" enviado para revisão.`),
        onError: (err) =>
          toast.error(
            transitionErrorMessage(
              err,
              "Não foi possível submeter o processo.",
            ),
          ),
      },
    );
  };

  const handleApprove = () => {
    approveMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () =>
          toast.success(`"${process.title}" publicado.`),
        onError: (err) =>
          toast.error(
            transitionErrorMessage(err, "Não foi possível publicar."),
          ),
      },
    );
  };

  const handleArchive = () => {
    archiveMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () => {
          toast.success(`"${process.title}" arquivado.`);
          setArchiveOpen(false);
        },
        onError: (err) => {
          toast.error(
            transitionErrorMessage(err, "Não foi possível arquivar."),
          );
          setArchiveOpen(false);
        },
      },
    );
  };

  const canSubmit = process.status === "DRAFT";
  const canApprove = process.status === "IN_REVIEW";
  const canArchive = process.status !== "ARCHIVED";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-ifflow-muted hover:bg-ifflow-bone hover:text-ifflow-ink"
            aria-label={`Ações para ${process.title}`}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link to={`/admin/processes/${process.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden />
              Editar
            </Link>
          </DropdownMenuItem>

          {(canSubmit || canApprove) && <DropdownMenuSeparator />}

          {canSubmit && (
            <DropdownMenuItem onSelect={handleSubmit}>
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Submeter para revisão
            </DropdownMenuItem>
          )}

          {canApprove && (
            <DropdownMenuItem onSelect={handleApprove}>
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
              Aprovar publicação
            </DropdownMenuItem>
          )}

          {canArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setArchiveOpen(true);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Archive className="mr-2 h-4 w-4" aria-hidden />
                Arquivar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium tracking-tight text-ifflow-ink">
              Arquivar este processo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-ifflow-muted">
              <span className="font-medium text-ifflow-ink">
                {process.title}
              </span>{" "}
              deixará de aparecer para os servidores. O progresso já registrado
              pelos usuários é preservado e pode ser consultado por
              administradores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={archiveMutation.isPending}
              className="border-ifflow-rule"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Sem o preventDefault, o Radix fecha o dialog antes da
                // mutation terminar e perde o estado de loading.
                event.preventDefault();
                handleArchive();
              }}
              disabled={archiveMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Arquivando…
                </>
              ) : (
                "Arquivar processo"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
