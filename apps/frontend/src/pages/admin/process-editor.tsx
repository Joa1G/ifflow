import { AlertCircle, Lock } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ProcessMetadataForm } from "../../components/admin/process-metadata-form";
import { ProcessTransitionBar } from "../../components/admin/process-transition-bar";
import type { ProcessRowMode } from "../../components/admin/process-row-actions";
import { SectionEyebrow } from "../../components/admin/section-eyebrow";
import { StepsSection } from "../../components/admin/steps-section";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import {
  useCreateProcess,
  useProcessForManagement,
  useUpdateProcess,
} from "../../hooks/use-processes-management";
import { useProcessFlow } from "../../hooks/use-processes";
import type { ProcessMetadataInput } from "../../lib/validators/process";
import type { components } from "../../types/api";

type ProcessAdminView = components["schemas"]["ProcessAdminView"];
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

/**
 * Editor de processo, montado em 4 rotas:
 *   /processes/new            → owner mode, create
 *   /processes/:id/edit       → owner mode, edit
 *   /admin/processes/new      → admin mode, create
 *   /admin/processes/:id/edit → admin mode, edit
 *
 * O `mode` é decidido pelo prefixo da URL — quem chega via /admin/* já
 * passou pelo `<ProtectedRoute requiredRole="ADMIN">`. Em /processes/* o
 * backend ainda checa ownership (`useProcessForManagement` devolve 403
 * `PROCESS_NOT_OWNED` se um USER tentar abrir o editor de outro autor).
 */
export default function ProcessEditorPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const mode: ProcessRowMode = location.pathname.startsWith("/admin/")
    ? "admin"
    : "owner";
  const isCreate = id === undefined;

  if (isCreate) {
    return <CreateView mode={mode} />;
  }
  return <EditView processId={id} mode={mode} />;
}

interface ModeProps {
  mode: ProcessRowMode;
}

function CreateView({ mode }: ModeProps) {
  const navigate = useNavigate();
  const createMutation = useCreateProcess();
  const editPathPrefix = mode === "admin" ? "/admin/processes" : "/processes";
  const trail =
    mode === "admin"
      ? ["Admin", "Processos", "Novo"]
      : ["Processos", "Novo"];

  const handleSubmit = async (values: ProcessMetadataInput) => {
    return new Promise<void>((resolve, reject) => {
      createMutation.mutate(values, {
        onSuccess: (created) => {
          toast.success("Processo criado");
          navigate(`${editPathPrefix}/${created.id}/edit`, { replace: true });
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
        <Breadcrumb trail={trail} />
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

interface EditViewProps extends ModeProps {
  processId: string;
}

function EditView({ processId, mode }: EditViewProps) {
  const adminQuery = useProcessForManagement(processId);
  const flowQuery = useProcessFlow(processId);
  const updateMutation = useUpdateProcess();
  const trail =
    mode === "admin"
      ? ["Admin", "Processos", "Editar"]
      : ["Processos", "Editar"];

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
          <Breadcrumb trail={trail} />
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
  const editable = process?.status === "DRAFT";
  const lockMessage = process ? lockMessageFor(process, mode) : null;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
      <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
        <Breadcrumb trail={trail} />

        <header className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ifflow-ink md:text-4xl">
              {process ? process.title : "Carregando..."}
            </h1>
            <p className="mt-2 text-sm text-ifflow-muted">
              {mode === "admin"
                ? "Edição administrativa. Use a barra de ações para mover entre rascunho, revisão e publicação."
                : "Edite os metadados e o fluxo do processo. Submeta para revisão quando estiver pronto."}
            </p>
          </div>
          {process ? (
            <div className="flex flex-col items-start gap-3 md:items-end">
              <Badge
                variant={STATUS_VARIANT[process.status]}
                className="self-start md:self-auto"
              >
                {STATUS_LABEL[process.status]}
              </Badge>
              <ProcessTransitionBar process={process} mode={mode} />
            </div>
          ) : null}
        </header>

        <SectionEyebrow index="01" label="Metadados" className="mt-12" />
        <section
          aria-labelledby="metadados-heading"
          className="mt-4 overflow-hidden rounded-lg border border-ifflow-rule bg-ifflow-paper shadow-[0_1px_2px_rgba(15,27,18,0.04),0_12px_32px_-12px_rgba(15,27,18,0.08)]"
        >
          <h3 id="metadados-heading" className="sr-only">
            Metadados do processo
          </h3>
          {lockMessage ? (
            <Alert className="m-6 border-ifflow-rule bg-ifflow-bone/40">
              <Lock className="h-4 w-4" aria-hidden />
              <AlertTitle>Edição bloqueada</AlertTitle>
              <AlertDescription>{lockMessage}</AlertDescription>
            </Alert>
          ) : null}
          <div className="p-6">
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
                disabled={!editable}
              />
            ) : null}
          </div>
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
              editable={Boolean(editable)}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function lockMessageFor(
  process: ProcessAdminView,
  mode: ProcessRowMode,
): string | null {
  switch (process.status) {
    case "DRAFT":
      return null;
    case "IN_REVIEW":
      return mode === "owner"
        ? "Este processo está em revisão. Para editar, use \"Retirar da revisão\" e o processo voltará para rascunho."
        : "Este processo está aguardando aprovação. Aprove a publicação ou aguarde o autor retirar da revisão para editar.";
    case "PUBLISHED":
      return "Processo publicado. Para alterar, arquive uma nova versão ou crie um processo separado.";
    case "ARCHIVED":
      return "Processo arquivado. Apenas leitura.";
    default: {
      const _exhaustive: never = process.status;
      return _exhaustive;
    }
  }
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
