import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";

import {
  PROCESS_CATEGORIES,
  processMetadataSchema,
  type ProcessMetadataInput,
} from "../../lib/validators/process";
import { categoryColors, categoryLabel } from "../../lib/category-colors";
import { Button } from "../ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { RequirementsListInput } from "./requirements-list-input";

interface ProcessMetadataFormProps {
  /** Valores iniciais — em modo edit, vêm do GET /processes/:id/management. */
  defaultValues?: ProcessMetadataInput;
  onSubmit: (values: ProcessMetadataInput) => Promise<unknown>;
  isPending?: boolean;
  /** Texto do botão primário ("Criar processo" no /new, "Salvar metadados" no /edit). */
  submitLabel: string;
  /**
   * Quando `true`, todos os campos viram read-only e o botão de submit some.
   * Usado no editor para travar processos fora de DRAFT (IN_REVIEW exige
   * withdraw; PUBLISHED/ARCHIVED não são editáveis).
   */
  disabled?: boolean;
}

const EMPTY_DEFAULTS: ProcessMetadataInput = {
  title: "",
  short_description: "",
  full_description: "",
  category: "RH",
  estimated_time: "",
  requirements: [],
};

/**
 * Form compartilhado entre /admin/processes/new (criar) e /edit (atualizar).
 *
 * Categoria é renderizada como linha de pílulas selecionáveis em vez de
 * Select — segue o padrão visual editorial (chips de cor por categoria já
 * existentes em `categoryColors`) e dá feedback imediato. Acessível via
 * radiogroup nativo (cada pílula é um <label> envolvendo um radio).
 */
export function ProcessMetadataForm({
  defaultValues,
  onSubmit,
  isPending = false,
  submitLabel,
  disabled = false,
}: ProcessMetadataFormProps) {
  const form = useForm<ProcessMetadataInput>({
    resolver: zodResolver(processMetadataSchema),
    defaultValues: defaultValues ?? EMPTY_DEFAULTS,
    mode: "onBlur",
  });

  const isDirty = form.formState.isDirty;
  const submittable = !isPending && (defaultValues ? isDirty : true);

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(values))}
        aria-label="Formulário de metadados do processo"
        className="grid gap-6"
      >
        {/* `<fieldset disabled>` propaga `disabled` para todos os inputs,
            radios e botões descendentes — evita ter que repetir a flag em
            cada FormField (incluindo o sub-formulário de requirements). */}
        <fieldset
          disabled={disabled}
          className="grid gap-6 disabled:opacity-70"
        >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ex: Solicitação de Capacitação"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="short_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição curta</FormLabel>
              <p className="text-xs text-ifflow-muted">
                Aparece no card da listagem pública. Até 280 caracteres.
              </p>
              <FormControl>
                <Textarea
                  rows={2}
                  maxLength={280}
                  placeholder="Resumo de uma frase do processo."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="full_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição completa</FormLabel>
              <p className="text-xs text-ifflow-muted">
                Texto exibido no detalhe do processo. Pode ter múltiplos parágrafos.
              </p>
              <FormControl>
                <Textarea rows={6} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoria</FormLabel>
              <FormControl>
                <fieldset
                  className="flex flex-wrap gap-2"
                  aria-label="Categoria do processo"
                >
                  {PROCESS_CATEGORIES.map((cat) => {
                    const checked = field.value === cat;
                    return (
                      <label
                        key={cat}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          checked
                            ? `${categoryColors[cat]} border-transparent`
                            : "border-ifflow-rule bg-transparent text-ifflow-muted hover:border-ifflow-ink/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="category"
                          value={cat}
                          checked={checked}
                          onChange={() => field.onChange(cat)}
                          className="sr-only"
                        />
                        {categoryLabel[cat]}
                      </label>
                    );
                  })}
                </fieldset>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estimated_time"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tempo estimado</FormLabel>
              <FormControl>
                <Input placeholder="Ex: 30 a 45 dias" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <RequirementsListInput />
        </fieldset>

        {disabled ? null : (
          <div className="flex items-center justify-between gap-4 border-t border-ifflow-rule pt-5">
            <p className="text-xs text-ifflow-muted">
              {defaultValues && !isDirty
                ? "Sem mudanças não salvas."
                : "Mudanças não salvas serão perdidas ao sair."}
            </p>
            <Button type="submit" disabled={!submittable}>
              {isPending ? (
                <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </FormProvider>
  );
}
