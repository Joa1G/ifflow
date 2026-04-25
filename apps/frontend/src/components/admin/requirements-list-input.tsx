import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext, type Control } from "react-hook-form";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { ProcessMetadataInput } from "../../lib/validators/process";

/**
 * Subform editável de requirements (lista de strings).
 *
 * Vive dentro de um RHF FormProvider — usa `useFormContext` para evitar
 * passar `control` por prop, e `useFieldArray` para os fields dinâmicos.
 *
 * Usa `<Label>` plain em vez do `<FormLabel>` do shadcn porque este é um
 * grupo de campos, não um campo único — o `useFormField` do shadcn
 * pressupõe um `<FormField>` envolvente, que não se aplica aqui.
 */
export function RequirementsListInput() {
  const { control, register, formState } =
    useFormContext<ProcessMetadataInput>();
  const { fields, append, remove } = useFieldArray<
    ProcessMetadataInput,
    "requirements" extends keyof ProcessMetadataInput ? never : never
  >({
    // RHF tipa array de strings de forma esquisita — cast estreito aqui.
    control: control as unknown as Control<ProcessMetadataInput>,
    name: "requirements" as never,
  });

  const requirementsError = formState.errors.requirements;
  const groupErrorMessage =
    requirementsError && typeof requirementsError === "object"
      ? "message" in requirementsError && requirementsError.message
        ? String(requirementsError.message)
        : null
      : null;

  return (
    <div className="space-y-2">
      <Label>Requisitos</Label>
      <p className="text-xs text-ifflow-muted">
        Lista de pré-requisitos que o servidor precisa atender. Opcional.
      </p>

      {fields.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {fields.map((field, i) => (
            <li key={field.id} className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-6 shrink-0 text-right font-mono text-xs text-ifflow-muted"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <Input
                {...register(`requirements.${i}` as const)}
                placeholder="Ex: Ser servidor efetivo"
                className="flex-1"
                aria-label={`Requisito ${i + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover requisito ${i + 1}`}
                onClick={() => remove(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => append("")}
        className="mt-2"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Adicionar requisito
      </Button>

      {groupErrorMessage ? (
        <p className="text-sm font-medium text-destructive">
          {groupErrorMessage}
        </p>
      ) : null}
    </div>
  );
}
