import { ArrowDown, ArrowUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  useDeleteStep,
  useUpdateStep,
} from "../../hooks/use-processes-management";
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
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";

type FlowStepRead = components["schemas"]["FlowStepRead"];

interface AdminStepCardProps {
  processId: string;
  step: FlowStepRead;
  /** Step imediatamente acima na ordem atual, se houver. */
  previousStep: FlowStepRead | null;
  /** Step imediatamente abaixo na ordem atual, se houver. */
  nextStep: FlowStepRead | null;
  onEdit: (step: FlowStepRead) => void;
  /**
   * Quando `false`, esconde reorder/edit/remove. Default `true` para
   * compatibilidade com call sites antigos.
   */
  editable?: boolean;
}

/**
 * Item da lista de etapas no editor admin.
 *
 * Reorder: como o backend NÃO tem unique constraint em (process_id, order),
 * o swap é direto — duas mutations com PATCH trocando os `order` entre si.
 * `onSettled` invalida o cache do flow, então a UI reflete a nova ordem
 * após ambas voltarem.
 */
export function AdminStepCard({
  processId,
  step,
  previousStep,
  nextStep,
  onEdit,
  editable = true,
}: AdminStepCardProps) {
  const updateMutation = useUpdateStep();
  const deleteMutation = useDeleteStep();

  const paddedOrder = String(step.order).padStart(2, "0");
  const resourceCount = step.resources.length;
  const isFirst = previousStep === null;
  const isLast = nextStep === null;

  const swap = (other: FlowStepRead) => {
    updateMutation.mutate({
      processId,
      stepId: step.id,
      patch: { order: other.order },
    });
    updateMutation.mutate({
      processId,
      stepId: other.id,
      patch: { order: step.order },
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { processId, stepId: step.id },
      {
        onSuccess: () => toast.success("Etapa removida"),
        onError: (err) =>
          toast.error(err.message ?? "Não foi possível remover a etapa."),
      },
    );
  };

  return (
    <li className="group grid grid-cols-[auto_1fr_auto] items-start gap-x-5 border-t border-ifflow-rule px-1 py-5 first:border-t-0">
      <div className="flex flex-col items-end gap-1 pt-1">
        <span className="font-mono text-3xl font-light leading-none tabular-nums text-ifflow-ink/80">
          {paddedOrder}
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ifflow-muted">
          {step.sector.acronym}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="font-serif text-base font-medium leading-snug text-ifflow-ink">
          {step.title}
        </h3>
        <p className="mt-1 text-xs text-ifflow-muted">{step.sector.name}</p>
        <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ifflow-muted">
          <span>
            <dt className="sr-only">Responsável</dt>
            <dd>{step.responsible}</dd>
          </span>
          <span aria-hidden>·</span>
          <span>
            <dt className="sr-only">Tempo estimado</dt>
            <dd>{step.estimated_time}</dd>
          </span>
          <span aria-hidden>·</span>
          <span>
            {resourceCount} {resourceCount === 1 ? "recurso" : "recursos"}
          </span>
        </dl>
      </div>

      {editable ? (
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Mover etapa ${step.order} para cima`}
              disabled={isFirst || updateMutation.isPending}
              onClick={() => previousStep && swap(previousStep)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Mover etapa ${step.order} para baixo`}
              disabled={isLast || updateMutation.isPending}
              onClick={() => nextStep && swap(nextStep)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(step)}
            >
              <Pencil aria-hidden className="mr-1 h-3.5 w-3.5" />
              Editar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 aria-hidden className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 aria-hidden className="mr-1 h-3.5 w-3.5" />
                  )}
                  Remover
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-serif">
                    Remover esta etapa?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Os recursos vinculados a “{step.title}” também serão removidos.
                    Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remover etapa
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div aria-hidden />
      )}
    </li>
  );
}
