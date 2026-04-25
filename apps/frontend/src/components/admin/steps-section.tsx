import { ListPlus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import type { components } from "../../types/api";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { AdminStepCard } from "./admin-step-card";
import { StepEditorDialog } from "./step-editor-dialog";

type FlowStepRead = components["schemas"]["FlowStepRead"];

interface StepsSectionProps {
  processId: string;
  steps: FlowStepRead[] | undefined;
  isLoading: boolean;
}

/**
 * Seção "Etapas do fluxo" no editor admin. Gerencia o estado do
 * StepEditorDialog (open/close + step alvo) e ordena os steps por
 * `order` antes de renderizar — não confia que o backend já mande
 * ordenado.
 */
export function StepsSection({
  processId,
  steps,
  isLoading,
}: StepsSectionProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FlowStepRead | null>(null);

  const sortedSteps = useMemo(() => {
    if (!steps) return [];
    return [...steps].sort((a, b) => a.order - b.order);
  }, [steps]);

  const nextOrder = useMemo(() => {
    if (sortedSteps.length === 0) return 1;
    return sortedSteps[sortedSteps.length - 1]!.order + 1;
  }, [sortedSteps]);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (step: FlowStepRead) => {
    setEditing(step);
    setEditorOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (sortedSteps.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-ifflow-rule bg-ifflow-bone">
            <ListPlus aria-hidden className="h-5 w-5 text-ifflow-muted" />
          </div>
          <h3 className="font-serif text-lg font-medium text-ifflow-ink">
            Sem etapas cadastradas
          </h3>
          <p className="mt-2 max-w-sm text-sm text-ifflow-muted">
            Adicione a primeira etapa do fluxo para começar. Você poderá
            reordenar e editar a qualquer momento antes de submeter para revisão.
          </p>
          <Button className="mt-6" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova etapa
          </Button>
        </div>
        <StepEditorDialog
          processId={processId}
          step={editing}
          nextOrder={nextOrder}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      </>
    );
  }

  return (
    <>
      <ol
        className="px-6 pb-2 pt-2"
        aria-label="Etapas do fluxo do processo"
      >
        {sortedSteps.map((step, index) => (
          <AdminStepCard
            key={step.id}
            processId={processId}
            step={step}
            previousStep={index > 0 ? sortedSteps[index - 1]! : null}
            nextStep={
              index < sortedSteps.length - 1 ? sortedSteps[index + 1]! : null
            }
            onEdit={openEdit}
          />
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-dashed border-ifflow-rule px-6 py-4">
        <p className="text-xs text-ifflow-muted">
          {sortedSteps.length}{" "}
          {sortedSteps.length === 1 ? "etapa cadastrada" : "etapas cadastradas"}
        </p>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nova etapa
        </Button>
      </div>
      <StepEditorDialog
        processId={processId}
        step={editing}
        nextOrder={nextOrder}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </>
  );
}
