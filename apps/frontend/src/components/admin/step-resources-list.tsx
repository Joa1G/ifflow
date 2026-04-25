import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useDeleteResource } from "../../hooks/use-admin-processes";
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
import { ResourceTypeBadge } from "./resource-type-badge";

type StepResourceRead = components["schemas"]["StepResourceRead"];

interface StepResourcesListProps {
  resources: StepResourceRead[];
  processId: string;
  stepId: string;
}

export function StepResourcesList({
  resources,
  processId,
  stepId,
}: StepResourcesListProps) {
  if (resources.length === 0) {
    return (
      <p className="mt-3 rounded-md border border-dashed border-ifflow-rule bg-ifflow-bone/40 px-4 py-5 text-center text-xs text-ifflow-muted">
        Nenhum recurso ainda. Adicione documentos, base legal ou links abaixo.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {resources.map((resource) => (
        <ResourceRow
          key={resource.id}
          resource={resource}
          processId={processId}
          stepId={stepId}
        />
      ))}
    </ul>
  );
}

function ResourceRow({
  resource,
  processId,
  stepId,
}: {
  resource: StepResourceRead;
  processId: string;
  stepId: string;
}) {
  const mutation = useDeleteResource();

  const handleDelete = () => {
    mutation.mutate(
      { processId, stepId, resourceId: resource.id },
      {
        onSuccess: () => toast.success("Recurso removido"),
        onError: (err) =>
          toast.error(err.message ?? "Não foi possível remover o recurso."),
      },
    );
  };

  return (
    <li className="flex items-start gap-3 rounded-md border border-ifflow-rule bg-ifflow-paper px-3 py-2.5">
      <ResourceTypeBadge type={resource.type} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-medium text-ifflow-ink">
          {resource.title}
        </p>
        {resource.url ? (
          <p className="mt-0.5 truncate font-mono text-[11px] text-ifflow-muted">
            {resource.url}
          </p>
        ) : null}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remover recurso ${resource.title}`}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {mutation.isPending ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 aria-hidden className="h-4 w-4" />
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">
              Remover este recurso?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os usuários deixarão de ver “{resource.title}” no detalhe da etapa.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover recurso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
