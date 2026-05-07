import {
  AlertCircle,
  ArrowLeft,
  GalleryVerticalEnd,
  Inbox,
  Info,
  Rows3,
  Table2,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import {
  FlowViewer,
  type FlowViewMode,
} from "../components/flow/flow-viewer";
import { ProgressSummary } from "../components/flow/progress-summary";
import { StatusSelector } from "../components/flow/status-selector";
import { StepDetailModal } from "../components/flow/step-detail-modal";
import { ProcessOverviewSection } from "../components/processes/process-overview-section";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useProcess, useProcessFlow } from "../hooks/use-processes";
import { useProgress, useUpdateStepStatus } from "../hooks/use-progress";
import type { components } from "../types/api";

type FlowStepRead = components["schemas"]["FlowStepRead"];
type StepStatus = components["schemas"]["StepStatus"];

function FlowSkeleton() {
  return (
    <div
      aria-hidden
      className="mt-10 space-y-6 rounded-md border border-border p-6"
    >
      <Skeleton className="h-4 w-40" />
      <div className="space-y-4">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="flex items-center gap-6">
            <Skeleton className="h-12 w-24" />
            <Skeleton className="h-36 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Aviso literal do REQ-102 — inegociável na tela de fluxograma.
 * O texto exato consta em DESIGN_SYSTEM.md > "Textos institucionais
 * obrigatórios". Um teste garante que ele permanece renderizado.
 */
const CHECKLIST_DISCLAIMER =
  "Este checklist é pessoal e não altera o processo oficial no SIPAC. Use-o para acompanhar seu próprio andamento.";

export default function ProcessFlowPage() {
  const { id } = useParams<{ id: string }>();
  const flowQuery = useProcessFlow(id);
  // Detail roda em paralelo com o flow — TanStack faz cache de cada um
  // separado, e a página exibe a ficha (categoria/descrição/prazo/
  // requisitos) que o ProcessFullFlow não traz. Erro silencioso: se o
  // detail falhar mas o flow vier, o usuário ainda vê o fluxograma.
  const detailQuery = useProcess(id);
  const progressQuery = useProgress(id);
  const updateStatus = useUpdateStepStatus();
  const [selectedStep, setSelectedStep] = useState<FlowStepRead | null>(null);
  const [viewMode, setViewMode] = useState<FlowViewMode>("swimlane");

  const stepStatuses = progressQuery.data?.step_statuses ?? {};
  const updatingStepId = updateStatus.isPending
    ? updateStatus.variables?.stepId
    : undefined;

  const handleChangeStatus = (stepId: string, next: StepStatus) => {
    if (!id) return;
    updateStatus.mutate(
      { processId: id, stepId, status: next },
      {
        onSuccess: () => toast.success("Status atualizado"),
        onError: (err) =>
          toast.error(err.message ?? "Não foi possível atualizar o status."),
      },
    );
  };

  const renderStatusControl = (step: FlowStepRead) => {
    const status = stepStatuses[step.id] ?? "PENDING";
    return (
      <StatusSelector
        status={status}
        onChange={(next) => handleChangeStatus(step.id, next)}
        stepLabel={`${step.order} — ${step.title}`}
        isUpdating={updatingStepId === step.id}
        disabled={progressQuery.isError}
      />
    );
  };

  const viewModeDescription =
    viewMode === "swimlane"
      ? "Raias agrupadas por setor responsável."
      : viewMode === "linear"
        ? "Etapas em sequência, lado a lado."
        : "Lista em tabela — ideal para fluxos longos.";

  return (
    <main className="container mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Voltar para processos
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-3.5 w-0.5 rounded-sm bg-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Fluxograma oficial
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {flowQuery.isSuccess ? (
            <>
              Fluxo:{" "}
              <span className="text-foreground/80">
                {flowQuery.data.process.title}
              </span>
            </>
          ) : (
            "Fluxo do processo"
          )}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Consulta interna — o andamento real do processo permanece no SIPAC.
        </p>
      </header>

      <Alert className="mt-8">
        <Info aria-hidden className="h-4 w-4" />
        <AlertTitle>Checklist pessoal</AlertTitle>
        <AlertDescription>{CHECKLIST_DISCLAIMER}</AlertDescription>
      </Alert>

      {flowQuery.isSuccess && flowQuery.data.steps.length > 0 ? (
        <div className="mt-6">
          <ProgressSummary
            totalSteps={flowQuery.data.steps.length}
            stepStatuses={stepStatuses}
            lastUpdated={progressQuery.data?.last_updated ?? null}
            isLoading={progressQuery.isPending}
          />
        </div>
      ) : null}

      <ProcessOverviewSection
        process={detailQuery.isSuccess ? detailQuery.data : undefined}
        isLoading={detailQuery.isPending}
      />

      {flowQuery.isPending ? <FlowSkeleton /> : null}

      {flowQuery.isError ? (
        <Alert variant="destructive" className="mt-10">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar o fluxo</AlertTitle>
          <AlertDescription>
            {flowQuery.error.message ??
              "Tente novamente em instantes ou atualize a página."}
          </AlertDescription>
        </Alert>
      ) : null}

      {flowQuery.isSuccess && flowQuery.data.steps.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16 text-center">
          <Inbox aria-hidden className="mb-4 h-12 w-12 text-muted-foreground/60" />
          <h2 className="text-lg font-semibold">Fluxo ainda não publicado</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Este processo não possui etapas cadastradas no momento.
          </p>
        </div>
      ) : null}

      {flowQuery.isSuccess && flowQuery.data.steps.length > 0 ? (
        <section aria-label="Fluxograma do processo" className="mt-10">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Visualização
              </p>
              <p className="text-lg text-foreground/90">
                {viewModeDescription}
              </p>
            </div>

            <Tabs
              value={viewMode}
              onValueChange={(value) => setViewMode(value as FlowViewMode)}
              className="w-full lg:w-auto"
            >
              <TabsList className="h-auto justify-start gap-1 rounded-xl border border-border bg-card p-1 lg:justify-end">
                <TabsTrigger
                  value="swimlane"
                  className="gap-2 rounded-lg px-4 py-2 text-sm"
                >
                  <Rows3 aria-hidden className="h-4 w-4" />
                  Raias por setor
                </TabsTrigger>
                <TabsTrigger
                  value="linear"
                  className="gap-2 rounded-lg px-4 py-2 text-sm"
                >
                  <GalleryVerticalEnd aria-hidden className="h-4 w-4" />
                  Sequência linear
                </TabsTrigger>
                <TabsTrigger
                  value="table"
                  className="gap-2 rounded-lg px-4 py-2 text-sm"
                >
                  <Table2 aria-hidden className="h-4 w-4" />
                  Tabela
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <FlowViewer
            flow={flowQuery.data}
            viewMode={viewMode}
            onSelectStep={setSelectedStep}
            renderStatusControl={renderStatusControl}
          />
        </section>
      ) : null}

      <StepDetailModal
        step={selectedStep}
        open={selectedStep !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedStep(null);
        }}
      />

      <p
        aria-hidden
        className="mt-12 text-right font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50"
      >
        Fluxo · v1 · PROAD IFAM
      </p>
    </main>
  );
}
