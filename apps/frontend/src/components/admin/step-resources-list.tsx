import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  useDeleteResource,
  useUpdateResource,
} from "../../hooks/use-processes-management";
import type { StepResourceInput } from "../../lib/validators/process";
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
import { ResourceInlineForm } from "./resource-inline-form";
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
  const [isEditing, setIsEditing] = useState(false);
  const deleteMutation = useDeleteResource();
  const updateMutation = useUpdateResource();

  const handleDelete = () => {
    deleteMutation.mutate(
      { processId, stepId, resourceId: resource.id },
      {
        onSuccess: () => toast.success("Recurso removido"),
        onError: (err) =>
          toast.error(err.message ?? "Não foi possível remover o recurso."),
      },
    );
  };

  const handleSubmitEdit = (values: StepResourceInput) => {
    updateMutation.mutate(
      {
        processId,
        stepId,
        resourceId: resource.id,
        patch: {
          type: values.type,
          title: values.title,
          url: values.url ? values.url : null,
          content: values.content ? values.content : null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Recurso atualizado");
          setIsEditing(false);
        },
        onError: (err) =>
          toast.error(err.message ?? "Não foi possível atualizar o recurso."),
      },
    );
  };

  if (isEditing) {
    return (
      <li>
        <ResourceInlineForm
          mode="edit"
          formId={`edit-resource-${resource.id}`}
          isPending={updateMutation.isPending}
          initialValues={{
            type: resource.type,
            title: resource.title,
            url: resource.url ?? "",
            content: resource.content ?? "",
          }}
          onSubmit={handleSubmitEdit}
          onCancel={() => setIsEditing(false)}
        />
      </li>
    );
  }

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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Editar recurso ${resource.title}`}
        onClick={() => setIsEditing(true)}
      >
        <Pencil aria-hidden className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remover recurso ${resource.title}`}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {deleteMutation.isPending ? (
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
