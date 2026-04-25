import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  RESOURCE_TYPES,
  stepResourceSchema,
  type StepResourceInput,
} from "../../lib/validators/process";
import { useCreateResource } from "../../hooks/use-admin-processes";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";

const RESOURCE_LABEL: Record<(typeof RESOURCE_TYPES)[number], string> = {
  DOCUMENT: "Documento",
  LEGAL_BASIS: "Base legal",
  POP: "POP — Procedimento Operacional",
  LINK: "Link externo",
};

interface AddResourceInlineFormProps {
  processId: string;
  stepId: string;
}

const EMPTY: StepResourceInput = {
  type: "DOCUMENT",
  title: "",
  url: "",
  content: "",
};

/**
 * Form colapsável para adicionar um recurso a uma etapa. Começa fechado
 * mostrando só o botão "+ Recurso"; clicar expande inline com os campos.
 *
 * NÃO usa <Dialog> aninhado dentro do StepEditorDialog — focus trap em
 * dialogs aninhados tem quirks no Radix e UX confusa. Inline é mais limpo.
 *
 * Usa `<Label>` plain em vez de `<FormLabel>` shadcn porque este form é
 * isolado (próprio useForm), não está aninhado num FormProvider — e
 * shadcn `FormField` exige a hierarquia completa.
 */
export function AddResourceInlineForm({
  processId,
  stepId,
}: AddResourceInlineFormProps) {
  const [open, setOpen] = useState(false);
  const mutation = useCreateResource();

  const form = useForm<StepResourceInput>({
    resolver: zodResolver(stepResourceSchema),
    defaultValues: EMPTY,
    mode: "onSubmit",
  });

  const handleClose = () => {
    setOpen(false);
    form.reset(EMPTY);
  };

  const onSubmit = (values: StepResourceInput) => {
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
          handleClose();
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

  const titleError = form.formState.errors.title?.message;
  const urlError = form.formState.errors.url?.message;
  const contentError = form.formState.errors.content?.message;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      aria-label="Adicionar recurso à etapa"
      className="mt-3 space-y-3 rounded-md border border-ifflow-rule bg-ifflow-bone/40 p-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-ifflow-muted">
          Novo recurso
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancelar adição de recurso"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="resource-type">Tipo</Label>
        <Select
          value={form.watch("type")}
          onValueChange={(v) =>
            form.setValue("type", v as StepResourceInput["type"])
          }
        >
          <SelectTrigger id="resource-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {RESOURCE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="resource-title">Título</Label>
        <Input
          id="resource-title"
          {...form.register("title")}
          placeholder="Ex: Formulário de Solicitação"
          aria-invalid={Boolean(titleError)}
        />
        {titleError ? (
          <p className="text-sm font-medium text-destructive">{titleError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="resource-url">
          URL (opcional se houver conteúdo)
        </Label>
        <Input
          id="resource-url"
          type="url"
          {...form.register("url")}
          placeholder="https://..."
          aria-invalid={Boolean(urlError)}
        />
        {urlError ? (
          <p className="text-sm font-medium text-destructive">{urlError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="resource-content">
          Conteúdo (opcional, ex: trecho de lei)
        </Label>
        <Textarea
          id="resource-content"
          rows={3}
          {...form.register("content")}
          aria-invalid={Boolean(contentError)}
        />
        {contentError ? (
          <p className="text-sm font-medium text-destructive">{contentError}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 aria-hidden className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Adicionar recurso
        </Button>
      </div>
    </form>
  );
}
