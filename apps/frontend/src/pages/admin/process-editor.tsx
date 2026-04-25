import { AlertCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ProcessMetadataForm } from "../../components/admin/process-metadata-form";
import { SectionEyebrow } from "../../components/admin/section-eyebrow";
import { StepsSection } from "../../components/admin/steps-section";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import {
  useAdminProcess,
  useCreateProcess,
  useUpdateProcess,
} from "../../hooks/use-admin-processes";
import { useProcessFlow } from "../../hooks/use-processes";
import type { ProcessMetadataInput } from "../../lib/validators/process";
import type { components } from "../../types/api";

type ProcessStatus = components["schemas"]["ProcessStatus"];

const STATUS_LABEL: Record<ProcessStatus, string> = {
  DRAFT: "Rascunho",
  IN_REVIEW: "Em revisão",
  PUBLISHED: "Publicado",
  ARCHIVED: "Arquivado",
};

const STATUS_VARIANT: Record<
  ProcessStatus,
  "default" | "secondary" | "outline"
> = {
  DRAFT: "secondary",
  IN_REVIEW: "outline",
  PUBLISHED: "default",
  ARCHIVED: "secondary",
};

export default function ProcessEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isCreate = id === undefined;

  if (isCreate) {
    return <CreateView />;
  }
  return <EditView processId={id} />;
}

function CreateView() {
  const navigate = useNavigate();
  const createMutation = useCreateProcess();

  const handleSubmit = async (values: ProcessMetadataInput) => {
    return new Promise<void>((resolve, reject) => {
      createMutation.mutate(values, {
        onSuccess: (created) => {
          toast.success("Processo criado");
          navigate(`/admin/processes/${created.id}/edit`, { replace: true });
          resolve();
        },
        onError: (err) => {
          toast.error(err.message ?? "Não foi possível criar o processo.");
          reject(err);
        },
      });
    });
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
      <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
        <Breadcrumb trail={["Admin", "Processos", "Novo"]} />
        <header className="mt-3">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-ifflow-ink md:text-4xl">
            Novo processo
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ifflow-muted">
            Preencha os metadados para criar o processo em rascunho. Você poderá
            adicionar etapas e recursos logo em seguida.
          </p>
        </header>

        <SectionEyebrow index="01" label="Metadados" className="mt-12" />
        <section
          aria-labelledby="metadados"
          className="mt-4 overflow-hidden rounded-lg border border-ifflow-rule bg-ifflow-paper p-6 shadow-[0_1px_2px_rgba(15,27,18,0.04),0_12px_32px_-12px_rgba(15,27,18,0.08)]"
        >
          <h3 id="metadados" className="sr-only">
            Metadados do processo
          </h3>
          <ProcessMetadataForm
            onSubmit={handleSubmit}
            isPending={createMutation.isPending}
            submitLabel="Criar processo"
          />
        </section>
      </div>
    </main>
  );
}

function EditView({ processId }: { processId: string }) {
  const adminQuery = useAdminProcess(processId);
  const flowQuery = useProcessFlow(processId);
  const updateMutation = useUpdateProcess();

  const handleSubmitMetadata = async (values: ProcessMetadataInput) => {
    return new Promise<void>((resolve, reject) => {
      updateMutation.mutate(
        { processId, patch: values },
        {
          onSuccess: () => {
            toast.success("Metadados atualizados");
            resolve();
          },
          onError: (err) => {
            toast.error(err.message ?? "Não foi possível salvar os metadados.");
            reject(err);
          },
        },
      );
    });
  };

  if (adminQuery.isError) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
        <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
          <Breadcrumb trail={["Admin", "Processos", "Editar"]} />
          <Alert variant="destructive" className="mt-8">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Não foi possível carregar o processo</AlertTitle>
            <AlertDescription>
              {adminQuery.error.message ??
                "Tente novamente em instantes ou volte para a lista de processos."}
            </AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  const process = adminQuery.data;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
      <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
        <Breadcrumb trail={["Admin", "Processos", "Editar"]} />

        <header className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ifflow-ink md:text-4xl">
              {process ? process.title : "Carregando..."}
            </h1>
            <p className="mt-2 text-sm text-ifflow-muted">
              Edite os metadados e o fluxo do processo. Mudanças permanecem em
              rascunho até serem submetidas para revisão.
            </p>
          </div>
          {process ? (
            <Badge
              variant={STATUS_VARIANT[process.status]}
              className="self-start md:self-auto"
            >
              {STATUS_LABEL[process.status]}
            </Badge>
          ) : null}
        </header>

        <SectionEyebrow index="01" label="Metadados" className="mt-12" />
        <section
          aria-labelledby="metadados-heading"
          className="mt-4 overflow-hidden rounded-lg border border-ifflow-rule bg-ifflow-paper p-6 shadow-[0_1px_2px_rgba(15,27,18,0.04),0_12px_32px_-12px_rgba(15,27,18,0.08)]"
        >
          <h3 id="metadados-heading" className="sr-only">
            Metadados do processo
          </h3>
          {adminQuery.isPending ? (
            <div className="space-y-4" aria-hidden>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : process ? (
            <ProcessMetadataForm
              key={process.updated_at}
              defaultValues={{
                title: process.title,
                short_description: process.short_description,
                full_description: process.full_description,
                category: process.category,
                estimated_time: process.estimated_time,
                requirements: process.requirements,
              }}
              onSubmit={handleSubmitMetadata}
              isPending={updateMutation.isPending}
              submitLabel="Salvar metadados"
            />
          ) : null}
        </section>

        <SectionEyebrow
          index="02"
          label="Etapas do fluxo"
          className="mt-12"
        />
        <section
          aria-labelledby="etapas-heading"
          className="mt-4 overflow-hidden rounded-lg border border-ifflow-rule bg-ifflow-paper shadow-[0_1px_2px_rgba(15,27,18,0.04),0_12px_32px_-12px_rgba(15,27,18,0.08)]"
        >
          <h3 id="etapas-heading" className="sr-only">
            Etapas do fluxo
          </h3>
          {flowQuery.isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Não foi possível carregar as etapas</AlertTitle>
                <AlertDescription>
                  {flowQuery.error.message ??
                    "Tente novamente em instantes."}
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <StepsSection
              processId={processId}
              steps={flowQuery.data?.steps}
              isLoading={flowQuery.isPending}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function Breadcrumb({ trail }: { trail: string[] }) {
  return (
    <nav
      aria-label="Caminho"
      className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
    >
      {trail.map((item, idx) => (
        <span key={item}>
          {item}
          {idx < trail.length - 1 ? <span aria-hidden> / </span> : null}
        </span>
      ))}
    </nav>
  );
}
