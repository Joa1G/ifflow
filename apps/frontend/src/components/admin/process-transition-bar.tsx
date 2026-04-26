import {
  Archive,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import type { ProcessRowMode } from "./process-row-actions";

type ProcessAdminView = components["schemas"]["ProcessAdminView"];

interface ProcessTransitionBarProps {
  process: ProcessAdminView;
  /**
   * Define o conjunto de transições visíveis e para onde o usuário volta
   * após arquivar:
   *  - `"admin"`: aprovar (IN_REVIEW), submeter (DRAFT), arquivar; volta
   *    para a fila de moderação.
   *  - `"owner"`: submeter (DRAFT), retirar da revisão (IN_REVIEW),
   *    arquivar (somente DRAFT/IN_REVIEW); volta para /processes/mine.
   */
  mode: ProcessRowMode;
}

/**
 * Barra de ações de transição na header do editor (F-26).
 *
 * O botão de arquivar abre um AlertDialog (segue DESIGN_SYSTEM
 * "Modal de confirmação destrutiva"). As outras transições disparam
 * direto, com toast de sucesso/erro — não pedem confirmação porque o
 * efeito é reversível (DRAFT⇄IN_REVIEW; admin pode rearquivar/voltar).
 *
 * Os hooks por baixo já invalidam todos os caches relevantes (lista
 * admin, lista do autor, detalhes públicos), então a UI atualiza sozinha
 * sem precisar de `refetch` explícito aqui.
 */
export function ProcessTransitionBar({
  process,
  mode,
}: ProcessTransitionBarProps) {
  const navigate = useNavigate();
  const [archiveOpen, setArchiveOpen] = useState(false);

  const submitMutation = useSubmitProcessForReview();
  const approveMutation = useApproveProcess();
  const withdrawMutation = useWithdrawProcess();
  const archiveMutation = useArchiveProcess();

  const isOwner = mode === "owner";
  const canSubmit = process.status === "DRAFT";
  const canApprove = !isOwner && process.status === "IN_REVIEW";
  const canWithdraw = isOwner && process.status === "IN_REVIEW";
  const canArchive = isOwner
    ? process.status === "DRAFT" || process.status === "IN_REVIEW"
    : process.status !== "ARCHIVED";

  const isAnyPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    withdrawMutation.isPending ||
    archiveMutation.isPending;

  const handleSubmit = () => {
    submitMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () =>
          toast.success("Processo enviado para revisão."),
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
        onSuccess: () => toast.success("Processo publicado."),
        onError: (err) =>
          toast.error(transitionErrorMessage(err, "Não foi possível publicar.")),
      },
    );
  };

  const handleWithdraw = () => {
    withdrawMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () =>
          toast.success(
            "Processo retirado da revisão. Edite e re-submeta quando estiver pronto.",
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

  const handleArchive = () => {
    archiveMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () => {
          toast.success("Processo arquivado.");
          setArchiveOpen(false);
          navigate(isOwner ? "/processes/mine" : "/admin/processes", {
            replace: true,
          });
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

  const noActions = !canSubmit && !canApprove && !canWithdraw && !canArchive;
  if (noActions) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canSubmit && (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isAnyPending}
            className="bg-ifflow-green text-white hover:bg-ifflow-green-hover"
          >
            {submitMutation.isPending ? (
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send aria-hidden className="mr-2 h-4 w-4" />
            )}
            Submeter para revisão
          </Button>
        )}

        {canApprove && (
          <Button
            type="button"
            onClick={handleApprove}
            disabled={isAnyPending}
            className="bg-ifflow-green text-white hover:bg-ifflow-green-hover"
          >
            {approveMutation.isPending ? (
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 aria-hidden className="mr-2 h-4 w-4" />
            )}
            Aprovar publicação
          </Button>
        )}

        {canWithdraw && (
          <Button
            type="button"
            variant="outline"
            onClick={handleWithdraw}
            disabled={isAnyPending}
            className="border-ifflow-rule"
          >
            {withdrawMutation.isPending ? (
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw aria-hidden className="mr-2 h-4 w-4" />
            )}
            Retirar da revisão
          </Button>
        )}

        {canArchive && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            disabled={isAnyPending}
            className="border-ifflow-rule text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Archive aria-hidden className="mr-2 h-4 w-4" />
            Arquivar
          </Button>
        )}
      </div>

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
                // Sem o preventDefault o Radix fecha o dialog antes da
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
