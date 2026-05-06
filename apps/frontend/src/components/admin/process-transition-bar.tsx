import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  useApproveProcess,
  useArchiveProcess,
  usePermanentlyDeleteProcess,
  useRestoreProcess,
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
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);

  const submitMutation = useSubmitProcessForReview();
  const approveMutation = useApproveProcess();
  const withdrawMutation = useWithdrawProcess();
  const archiveMutation = useArchiveProcess();
  const restoreMutation = useRestoreProcess();
  const hardDeleteMutation = usePermanentlyDeleteProcess();

  const isOwner = mode === "owner";
  const isProposal = Boolean(process.proposed_change_for);
  const canSubmit = process.status === "DRAFT";
  const canApprove = !isOwner && process.status === "IN_REVIEW";
  const canWithdraw = isOwner && process.status === "IN_REVIEW";
  const canArchive = isOwner
    ? process.status === "DRAFT" || process.status === "IN_REVIEW"
    : process.status !== "ARCHIVED";
  // Restore + hard delete são privilégios exclusivos de admin sobre processos
  // já arquivados. O backend exige role admin (FORBIDDEN para USER) e status
  // ARCHIVED (409 caso contrário) — espelhamos as duas restrições aqui pra
  // não oferecer botão que seria recusado.
  const canRestore = !isOwner && process.status === "ARCHIVED";
  const canHardDelete = !isOwner && process.status === "ARCHIVED";

  const isAnyPending =
    submitMutation.isPending ||
    approveMutation.isPending ||
    withdrawMutation.isPending ||
    archiveMutation.isPending ||
    restoreMutation.isPending ||
    hardDeleteMutation.isPending;

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
        onSuccess: (result) => {
          // Aprovar proposta de edição (B-30) faz o backend mesclar no
          // original e devolver o original como response — id do response
          // diferente do id que mandamos. Navega pra view do original
          // pra evitar 404 ao refetch (a proposta foi hard-deletada).
          if (result.id !== process.id) {
            toast.success(
              "Proposta aprovada. Mudanças mescladas na versão publicada.",
            );
            navigate(`/admin/processes/${result.id}/edit`, {
              replace: true,
            });
            return;
          }
          toast.success("Processo publicado.");
        },
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
          toast.success(
            isProposal ? "Proposta rejeitada." : "Processo arquivado.",
          );
          setArchiveOpen(false);
          // Após rejeitar uma proposta como admin, navega para o editor
          // do original — que volta a ficar editável agora que o slot
          // foi liberado. Caso contrário, lista padrão do mode.
          if (isProposal && !isOwner && process.proposed_change_for) {
            navigate(
              `/admin/processes/${process.proposed_change_for}/edit`,
              { replace: true },
            );
            return;
          }
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

  const handleRestore = () => {
    restoreMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () =>
          toast.success(
            "Processo restaurado para rascunho. Edite e re-publique quando estiver pronto.",
          ),
        onError: (err) =>
          toast.error(transitionErrorMessage(err, "Não foi possível restaurar.")),
      },
    );
  };

  const handleHardDelete = () => {
    hardDeleteMutation.mutate(
      { processId: process.id },
      {
        onSuccess: () => {
          toast.success("Processo excluído definitivamente.");
          setHardDeleteOpen(false);
          // Sempre admin (canHardDelete exige !isOwner). Volta pra fila de
          // moderação porque a página atual aponta pra um id que sumiu.
          navigate("/admin/processes", { replace: true });
        },
        onError: (err) => {
          toast.error(
            transitionErrorMessage(err, "Não foi possível excluir o processo."),
          );
          setHardDeleteOpen(false);
        },
      },
    );
  };

  const noActions =
    !canSubmit &&
    !canApprove &&
    !canWithdraw &&
    !canArchive &&
    !canRestore &&
    !canHardDelete;
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
            {isProposal ? "Aprovar proposta" : "Aprovar publicação"}
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
            {isProposal ? "Rejeitar proposta" : "Arquivar"}
          </Button>
        )}

        {canRestore && (
          <Button
            type="button"
            onClick={handleRestore}
            disabled={isAnyPending}
            className="bg-ifflow-green text-white hover:bg-ifflow-green-hover"
          >
            {restoreMutation.isPending ? (
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArchiveRestore aria-hidden className="mr-2 h-4 w-4" />
            )}
            Restaurar
          </Button>
        )}

        {canHardDelete && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setHardDeleteOpen(true)}
            disabled={isAnyPending}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden className="mr-2 h-4 w-4" />
            Excluir definitivamente
          </Button>
        )}
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium tracking-tight text-ifflow-ink">
              {isProposal
                ? "Rejeitar esta proposta de edição?"
                : "Arquivar este processo?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-ifflow-muted">
              <span className="font-medium text-ifflow-ink">
                {process.title}
              </span>{" "}
              {isProposal
                ? "será arquivada e a versão publicada permanecerá inalterada. O autor pode submeter uma nova proposta depois."
                : "deixará de aparecer para os servidores. O progresso já registrado pelos usuários é preservado e pode ser consultado por administradores."}
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
                  {isProposal ? "Rejeitando…" : "Arquivando…"}
                </>
              ) : isProposal ? (
                "Rejeitar proposta"
              ) : (
                "Arquivar processo"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={hardDeleteOpen} onOpenChange={setHardDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl font-medium tracking-tight text-ifflow-ink">
              Excluir este processo definitivamente?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-ifflow-muted">
              <span className="font-medium text-ifflow-ink">
                {process.title}
              </span>
              , suas etapas e o progresso individual de todos os usuários que
              acompanharam serão removidos permanentemente. Esta ação{" "}
              <span className="font-medium text-ifflow-ink">
                não pode ser desfeita
              </span>
              . Para reverter, use “Restaurar” em vez de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={hardDeleteMutation.isPending}
              className="border-ifflow-rule"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleHardDelete();
              }}
              disabled={hardDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hardDeleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo…
                </>
              ) : (
                "Excluir definitivamente"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
