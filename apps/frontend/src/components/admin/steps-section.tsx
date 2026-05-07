import { ListPlus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { StepDetailModal } from "../flow/step-detail-modal";
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
  /**
   * Quando `false`, esconde os CTAs de editar/criar etapa. Default `true`
   * para manter o comportamento dos call sites antigos. O bloqueio em
   * status !== DRAFT é decidido pela página pai.
   */
  editable?: boolean;
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
  editable = true,
}: StepsSectionProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  // Guardamos só o ID do step em edição — o objeto vem sempre do `sortedSteps`
  // derivado da prop. Sem isso, mutations em recurso (create/update/delete)
  // invalidam o cache do TanStack Query e a lista atualiza, mas o snapshot
  // antigo permanece em `editing` e o modal exibe `step.resources` stale —
  // forçando o usuário a fechar/reabrir para ver a mudança.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const sortedSteps = useMemo(() => {
    if (!steps) return [];
    return [...steps].sort((a, b) => a.order - b.order);
  }, [steps]);

  const nextOrder = useMemo(() => {
    if (sortedSteps.length === 0) return 1;
    return sortedSteps[sortedSteps.length - 1]!.order + 1;
  }, [sortedSteps]);

  const editingStep = useMemo(
    () =>
      editingId ? sortedSteps.find((s) => s.id === editingId) ?? null : null,
    [editingId, sortedSteps],
  );
  const detailStep = useMemo(
    () =>
      detailId ? sortedSteps.find((s) => s.id === detailId) ?? null : null,
    [detailId, sortedSteps],
  );

  const openCreate = () => {
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (step: FlowStepRead) => {
    setEditingId(step.id);
    setEditorOpen(true);
  };

  const openDetails = (step: FlowStepRead) => {
    setDetailId(step.id);
    setDetailOpen(true);
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
            {editable
              ? "Adicione a primeira etapa do fluxo para começar. Você poderá reordenar e editar a qualquer momento antes de submeter para revisão."
              : "Este processo ainda não tem etapas cadastradas."}
          </p>
          {editable ? (
            <Button className="mt-6" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nova etapa
            </Button>
          ) : null}
        </div>
        {editable ? (
          <StepEditorDialog
            processId={processId}
            step={editingStep}
            nextOrder={nextOrder}
            open={editorOpen}
            onOpenChange={setEditorOpen}
          />
        ) : null}
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
            onViewDetails={openDetails}
            editable={editable}
          />
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-dashed border-ifflow-rule px-6 py-4">
        <p className="text-xs text-ifflow-muted">
          {sortedSteps.length}{" "}
          {sortedSteps.length === 1 ? "etapa cadastrada" : "etapas cadastradas"}
        </p>
        {editable ? (
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova etapa
          </Button>
        ) : null}
      </div>
      {editable ? (
        <StepEditorDialog
          processId={processId}
          step={editingStep}
          nextOrder={nextOrder}
          open={editorOpen}
          onOpenChange={setEditorOpen}
        />
      ) : null}
      <StepDetailModal
        step={detailStep}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
