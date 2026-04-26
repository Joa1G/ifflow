import {
  Archive,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import {
  useApproveProcess,
  useArchiveProcess,
  useSubmitProcessForReview,
  useWithdrawProcess,
} from "../../hooks/use-processes-management";
import { transitionErrorMessage } from "../../lib/transition-error-message";
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

export type ProcessRowMode = "admin" | "owner";

interface ProcessRowActionsProps {
  process: ProcessAdminView;
  /**
   * Quem está olhando a linha. Define quais transições aparecem e para
   * onde o link de edição aponta. Default `"admin"` para compatibilidade
   * com a página de moderação que já usa este componente.
   */
  mode?: ProcessRowMode;
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
export function ProcessRowActions({
  process,
  mode = "admin",
}: ProcessRowActionsProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  const submitMutation = useSubmitProcessForReview();
  const approveMutation = useApproveProcess();
  const withdrawMutation = useWithdrawProcess();
  const archiveMutation = useArchiveProcess();

  const isPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    withdrawMutation.isPending ||
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

  const handleWithdraw = () => {
    withdrawMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () =>
          toast.success(
            `"${process.title}" voltou para rascunho. Ajuste e re-submeta.`,
          ),
        onError: (err) =>
          toast.error(
            transitionErrorMessage(
              err,
              "Não foi possível retirar da revisão.",
            ),
          ),
      },
    );
  };

  const isOwner = mode === "owner";
  const editHref = isOwner
    ? `/processes/${process.id}/edit`
    : `/admin/processes/${process.id}/edit`;

  const canSubmit = process.status === "DRAFT";
  // Approve só faz sentido na visão de moderação; autor não aprova o
  // próprio processo. Withdraw é o inverso: só do autor.
  const canApprove = !isOwner && process.status === "IN_REVIEW";
  const canWithdraw = isOwner && process.status === "IN_REVIEW";
  // Autor não consegue arquivar processos PUBLISHED (backend devolve
  // PROCESS_ARCHIVE_REQUIRES_ADMIN); admin arquiva qualquer não-arquivado.
  const canArchive = isOwner
    ? process.status === "DRAFT" || process.status === "IN_REVIEW"
    : process.status !== "ARCHIVED";

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
            <Link to={editHref}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden />
              Editar
            </Link>
          </DropdownMenuItem>

          {(canSubmit || canApprove || canWithdraw) && (
            <DropdownMenuSeparator />
          )}

          {canSubmit && (
            <DropdownMenuItem onSelect={handleSubmit}>
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Submeter para revisão
            </DropdownMenuItem>
          )}

          {canWithdraw && (
            <DropdownMenuItem onSelect={handleWithdraw}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
              Retirar da revisão
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
