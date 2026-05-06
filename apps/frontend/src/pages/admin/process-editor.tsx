import {
  AlertCircle,
  GitPullRequest,
  Loader2,
  Lock,
  PencilLine,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ProcessMetadataForm } from "../../components/admin/process-metadata-form";
import { ProcessTransitionBar } from "../../components/admin/process-transition-bar";
import type { ProcessRowMode } from "../../components/admin/process-row-actions";
import { SectionEyebrow } from "../../components/admin/section-eyebrow";
import { StepsSection } from "../../components/admin/steps-section";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import {
  useCreateProcess,
  useProcessForManagement,
  useProposeEdit,
  useUpdateProcess,
} from "../../hooks/use-processes-management";
import { useProcessFlow } from "../../hooks/use-processes";
import { transitionErrorMessage } from "../../lib/transition-error-message";
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
  // Admin pode editar PUBLISHED direto (F-27), exceto quando existe proposta
  // de edição pendente apontando pro processo (decisão 6A no backend) — aí
  // travamos pra evitar 409 no save e deixamos a barra de banner explicar.
  const editable =
    process?.status === "DRAFT" ||
    (mode === "admin" &&
      process?.status === "PUBLISHED" &&
      !process?.pending_proposal_id);
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

        {/*
          Banners de proposta de edição (B-30/F-28). A ordem precede as
          seções de metadados e etapas para deixar o contexto claro
          assim que a página carrega — antes do usuário tentar interagir
          com o form e tomar um 409 do backend.
        */}
        {process?.proposed_change_for ? (
          <div className="mt-8">
            <EditProposalBanner originalId={process.proposed_change_for} />
          </div>
        ) : null}
        {process &&
        process.status === "PUBLISHED" &&
        mode === "admin" &&
        process.pending_proposal_id ? (
          <div className="mt-8">
            <PendingProposalBanner
              proposalId={process.pending_proposal_id}
              mode={mode}
            />
          </div>
        ) : null}
        {process &&
        process.status === "PUBLISHED" &&
        mode === "owner" &&
        !process.proposed_change_for ? (
          <div className="mt-8">
            <OwnerProposeEditCta
              processId={process.id}
              pendingProposalId={process.pending_proposal_id}
            />
          </div>
        ) : null}

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
      // Admin edita PUBLISHED direto (F-27). Banners abaixo lidam com
      // os outros casos: proposta pendente (admin) e CTA propor edição
      // (owner) — não cabe lock genérico aqui.
      return null;
    case "ARCHIVED":
      return "Processo arquivado. Apenas leitura.";
    default: {
      const _exhaustive: never = process.status;
      return _exhaustive;
    }
  }
}

/**
 * Banner mostrado quando o processo aberto É uma proposta de edição
 * (`proposed_change_for` setado). Aparece tanto pro autor (que está
 * editando o DRAFT) quanto pro admin (que abriu a proposta para
 * revisar/aprovar/rejeitar). Link "Ver versão publicada" usa a rota
 * pública para que o admin possa comparar lado a lado.
 */
function EditProposalBanner({ originalId }: { originalId: string }) {
  return (
    <Alert className="mb-6 border-ifflow-rule bg-ifflow-bone/40">
      <GitPullRequest className="h-4 w-4" aria-hidden />
      <AlertTitle>Proposta de edição</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Este registro é uma proposta de edição do processo publicado.
          Ao submeter, um administrador vai analisar e poderá aprovar
          (mesclando as mudanças no original) ou rejeitar.
        </p>
        <Link
          to={`/processes/${originalId}`}
          className="inline-flex items-center text-sm font-medium text-ifflow-green underline-offset-4 hover:underline"
        >
          Ver versão publicada
        </Link>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Banner mostrado pro admin quando o processo aberto é o ORIGINAL
 * publicado e existe uma proposta de edição pendente apontando pra ele
 * (decisão 6A: workflow linear). Edição direta fica bloqueada até a
 * proposta ser resolvida (aprovar = merge ou rejeitar = arquivar).
 */
function PendingProposalBanner({
  proposalId,
  mode,
}: {
  proposalId: string;
  mode: ProcessRowMode;
}) {
  const editPathPrefix = mode === "admin" ? "/admin/processes" : "/processes";
  return (
    <Alert className="mb-6 border-ifflow-rule bg-ifflow-bone/40">
      <Lock className="h-4 w-4" aria-hidden />
      <AlertTitle>Proposta de edição em andamento</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Existe uma proposta de edição pendente para este processo.
          Resolva-a (aprovar para mesclar ou rejeitar) antes de editar
          aqui — o backend bloqueia mudanças no original enquanto a
          proposta existe.
        </p>
        <Link
          to={`${editPathPrefix}/${proposalId}/edit`}
          className="inline-flex items-center text-sm font-medium text-ifflow-green underline-offset-4 hover:underline"
        >
          Ver proposta
        </Link>
      </AlertDescription>
    </Alert>
  );
}

/**
 * CTA mostrado pro autor (mode=owner) que está vendo seu próprio
 * processo PUBLISHED. Substitui o lock antigo: em vez de "arquive uma
 * nova versão", oferece o fluxo formal de propor edição. Click chama
 * POST /processes/:id/propose-edit e navega para a proposta.
 *
 * Idempotente do lado do backend: se já existe proposta pendente, a
 * chamada devolve a existente — equivalentemente, se `pending_proposal_id`
 * já está set, mostramos um link direto ("Continuar proposta") em vez
 * do botão.
 */
function OwnerProposeEditCta({
  processId,
  pendingProposalId,
}: {
  processId: string;
  pendingProposalId: string | null | undefined;
}) {
  const navigate = useNavigate();
  const proposeEditMutation = useProposeEdit();

  if (pendingProposalId) {
    return (
      <Alert className="mb-6 border-ifflow-rule bg-ifflow-bone/40">
        <PencilLine className="h-4 w-4" aria-hidden />
        <AlertTitle>Você tem uma proposta de edição em andamento</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Continue editando sua proposta. Ao submeter, um administrador
            vai revisar.
          </p>
          <Link
            to={`/processes/${pendingProposalId}/edit`}
            className="inline-flex items-center text-sm font-medium text-ifflow-green underline-offset-4 hover:underline"
          >
            Abrir proposta
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const handleClick = () => {
    proposeEditMutation.mutate(
      { processId },
      {
        onSuccess: (proposal) => {
          toast.success("Proposta de edição criada.");
          navigate(`/processes/${proposal.id}/edit`, { replace: true });
        },
        onError: (err) => {
          toast.error(
            transitionErrorMessage(
              err,
              "Não foi possível abrir uma proposta de edição.",
            ),
          );
        },
      },
    );
  };

  return (
    <Alert className="mb-6 border-ifflow-rule bg-ifflow-bone/40">
      <PencilLine className="h-4 w-4" aria-hidden />
      <AlertTitle>Para alterar este processo, proponha uma edição</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Você é o autor deste processo publicado. Edições passam por uma
          revisão de administrador — clique abaixo para abrir uma cópia
          editável; ao submeter, ela será analisada e mesclada na versão
          publicada.
        </p>
        <Button
          type="button"
          onClick={handleClick}
          disabled={proposeEditMutation.isPending}
          className="bg-ifflow-green text-white hover:bg-ifflow-green-hover"
        >
          {proposeEditMutation.isPending ? (
            <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GitPullRequest aria-hidden className="mr-2 h-4 w-4" />
          )}
          Propor edição
        </Button>
      </AlertDescription>
    </Alert>
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
