import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X } from "lucide-react";
import { useForm } from "react-hook-form";

import {
  RESOURCE_TYPES,
  stepResourceSchema,
  type StepResourceInput,
} from "../../lib/validators/process";
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

const EMPTY: StepResourceInput = {
  type: "DOCUMENT",
  title: "",
  url: "",
  content: "",
};

interface ResourceInlineFormProps {
  mode: "create" | "edit";
  initialValues?: Partial<StepResourceInput>;
  isPending: boolean;
  onSubmit: (values: StepResourceInput) => void;
  onCancel: () => void;
  /** Identificador único para os htmlFor dos labels — evita colisão quando
   * múltiplos forms convivem na mesma árvore (ex: editar o resource A
   * enquanto outro resource B tem seu form aberto). */
  formId: string;
}

/**
 * Form inline reusável para criar OU editar um StepResource. A lógica de
 * `useMutation` (create vs update) e o controle de abertura ficam no
 * componente pai — este aqui só lida com os campos e validação.
 *
 * Usa <Label> plain em vez de <FormLabel> shadcn porque o form é isolado
 * (próprio useForm, não está aninhado num FormProvider) — shadcn FormField
 * exige a hierarquia completa e atrapalharia a reutilização.
 */
export function ResourceInlineForm({
  mode,
  initialValues,
  isPending,
  onSubmit,
  onCancel,
  formId,
}: ResourceInlineFormProps) {
  const form = useForm<StepResourceInput>({
    resolver: zodResolver(stepResourceSchema),
    defaultValues: { ...EMPTY, ...initialValues },
    mode: "onSubmit",
  });

  const titleError = form.formState.errors.title?.message;
  const urlError = form.formState.errors.url?.message;
  const contentError = form.formState.errors.content?.message;

  const ariaLabel =
    mode === "create" ? "Adicionar recurso à etapa" : "Editar recurso";
  const submitLabel = mode === "create" ? "Adicionar recurso" : "Salvar";
  const heading = mode === "create" ? "Novo recurso" : "Editar recurso";

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      aria-label={ariaLabel}
      className="space-y-3 rounded-md border border-ifflow-rule bg-ifflow-bone/40 p-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-ifflow-muted">
          {heading}
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancelar edição de recurso"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-type`}>Tipo</Label>
        <Select
          value={form.watch("type")}
          onValueChange={(v) =>
            form.setValue("type", v as StepResourceInput["type"])
          }
        >
          <SelectTrigger id={`${formId}-type`}>
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
        <Label htmlFor={`${formId}-title`}>Título</Label>
        <Input
          id={`${formId}-title`}
          {...form.register("title")}
          placeholder="Ex: Formulário de Solicitação"
          aria-invalid={Boolean(titleError)}
        />
        {titleError ? (
          <p className="text-sm font-medium text-destructive">{titleError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-url`}>
          URL (opcional se houver conteúdo)
        </Label>
        <Input
          id={`${formId}-url`}
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
        <Label htmlFor={`${formId}-content`}>
          Conteúdo (opcional, ex: trecho de lei)
        </Label>
        <Textarea
          id={`${formId}-content`}
          rows={3}
          {...form.register("content")}
          aria-invalid={Boolean(contentError)}
        />
        {contentError ? (
          <p className="text-sm font-medium text-destructive">{contentError}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 aria-hidden className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
