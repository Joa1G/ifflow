import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useCreateResource } from "../../hooks/use-processes-management";
import type { StepResourceInput } from "../../lib/validators/process";
import { Button } from "../ui/button";
import { ResourceInlineForm } from "./resource-inline-form";

interface AddResourceInlineFormProps {
  processId: string;
  stepId: string;
}

/**
 * Wrapper colapsável que mostra "+ Recurso" e expande inline para criar
 * um novo StepResource. Toda a UI de campos vive em <ResourceInlineForm>
 * (compartilhada com o caminho de edição).
 *
 * NÃO usa <Dialog> aninhado dentro do StepEditorDialog — focus trap em
 * dialogs aninhados tem quirks no Radix e UX confusa. Inline é mais limpo.
 */
export function AddResourceInlineForm({
  processId,
  stepId,
}: AddResourceInlineFormProps) {
  const [open, setOpen] = useState(false);
  const mutation = useCreateResource();

  const handleSubmit = (values: StepResourceInput) => {
    mutation.mutate(
      {
        processId,
        stepId,
        body: {
          type: values.type,
          title: values.title,
          url: values.url ? values.url : null,
          content: values.content ? values.content : null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Recurso adicionado");
          setOpen(false);
        },
        onError: (err) =>
          toast.error(err.message ?? "Não foi possível adicionar o recurso."),
      },
    );
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="mt-3"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Recurso
      </Button>
    );
  }

  return (
    <div className="mt-3">
      <ResourceInlineForm
        mode="create"
        formId="add-resource"
        isPending={mutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
