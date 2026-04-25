import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  useCreateStep,
  useUpdateStep,
} from "../../hooks/use-admin-processes";
import { useSectors } from "../../hooks/use-sectors";
import {
  flowStepSchema,
  type FlowStepInput,
} from "../../lib/validators/process";
import type { components } from "../../types/api";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { AddResourceInlineForm } from "./add-resource-inline-form";
import { SectionEyebrow } from "./section-eyebrow";
import { StepResourcesList } from "./step-resources-list";

type FlowStepRead = components["schemas"]["FlowStepRead"];

interface StepEditorDialogProps {
  processId: string;
  /** Step a editar; null = criar novo. */
  step: FlowStepRead | null;
  /** Próximo `order` disponível, usado quando criando do zero. */
  nextOrder: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function buildDefaults(
  step: FlowStepRead | null,
  nextOrder: number,
): FlowStepInput {
  if (step) {
    return {
      sector_id: step.sector.id,
      order: step.order,
      title: step.title,
      description: step.description,
      responsible: step.responsible,
      estimated_time: step.estimated_time,
    };
  }
  return {
    sector_id: "",
    order: nextOrder,
    title: "",
    description: "",
    responsible: "",
    estimated_time: "",
  };
}

/**
 * Modal de criação/edição de etapa.
 *
 * Em modo CREATE: só o subform — recursos só são gerenciáveis após o step
 * existir no backend (precisamos de step_id). Após salvar, o dialog fecha;
 * o usuário pode reabri-lo no modo edit para anexar recursos.
 *
 * Em modo EDIT: subform + subseção "Recursos" com lista + form inline.
 */
export function StepEditorDialog({
  processId,
  step,
  nextOrder,
  open,
  onOpenChange,
}: StepEditorDialogProps) {
  const isCreate = step === null;
  const createMutation = useCreateStep();
  const updateMutation = useUpdateStep();
  const sectorsQuery = useSectors();

  const form = useForm<FlowStepInput>({
    resolver: zodResolver(flowStepSchema),
    defaultValues: buildDefaults(step, nextOrder),
    mode: "onBlur",
  });

  // Quando trocar de step alvo (ou de modo), reseta o form com os defaults
  // novos. Sem isso, abrir o dialog para editar A e depois B mostraria os
  // dados de A.
  useEffect(() => {
    if (open) {
      form.reset(buildDefaults(step, nextOrder));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step?.id, nextOrder]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (values: FlowStepInput) => {
    if (isCreate) {
      createMutation.mutate(
        { processId, body: values },
        {
          onSuccess: () => {
            toast.success("Etapa criada");
            onOpenChange(false);
          },
          onError: (err) =>
            toast.error(err.message ?? "Não foi possível criar a etapa."),
        },
      );
    } else {
      updateMutation.mutate(
        { processId, stepId: step.id, patch: values },
        {
          onSuccess: () => {
            toast.success("Etapa atualizada");
            onOpenChange(false);
          },
          onError: (err) =>
            toast.error(err.message ?? "Não foi possível atualizar a etapa."),
        },
      );
    }
  };

  const paddedOrder = String(form.watch("order") || nextOrder).padStart(2, "0");
  const formId = "step-editor-form";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DialogHeader className="space-y-2 border-b border-ifflow-rule px-6 pb-5 pt-6 text-left">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-ifflow-muted">
              Etapa {paddedOrder}
            </span>
            <DialogTitle className="font-serif text-2xl font-medium tracking-tight">
              {isCreate ? "Nova etapa" : step.title}
            </DialogTitle>
            <DialogDescription className="text-sm text-ifflow-muted">
              {isCreate
                ? "Defina o escopo e o setor responsável. Recursos podem ser adicionados após salvar."
                : "Revise os dados da etapa e gerencie os recursos abaixo."}
            </DialogDescription>
          </DialogHeader>

          <FormProvider {...form}>
            <form
              id={formId}
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid gap-5 px-6 py-6"
              aria-label={isCreate ? "Nova etapa" : "Editar etapa"}
            >
              <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
                <FormField
                  control={form.control}
                  name="sector_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Setor responsável</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value || undefined}
                          onValueChange={field.onChange}
                          disabled={!sectorsQuery.isSuccess}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                sectorsQuery.isSuccess
                                  ? "Selecione o setor..."
                                  : "Carregando setores..."
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {sectorsQuery.data?.sectors.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.acronym} — {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ordem</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: Autuar processo no SIPAC"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea rows={4} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="responsible"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsável</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Servidor interessado"
                          {...field}
                        />
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
                        <Input placeholder="Ex: 1 dia útil" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </FormProvider>

          {!isCreate && step ? (
            <div className="border-t border-ifflow-rule px-6 py-5">
              <SectionEyebrow index="·" label="Recursos" />
              <StepResourcesList
                resources={step.resources}
                processId={processId}
                stepId={step.id}
              />
              <AddResourceInlineForm processId={processId} stepId={step.id} />
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-ifflow-rule bg-ifflow-bone/40 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? (
              <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {isCreate ? "Criar etapa" : "Salvar etapa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
