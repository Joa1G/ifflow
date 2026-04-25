import { AlertCircle, ArrowRight, Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { useProcess } from "../../hooks/use-processes";
import { useAuthStore } from "../../stores/auth-store";
import type { components } from "../../types/api";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Separator } from "../ui/separator";
import { Skeleton } from "../ui/skeleton";

type ProcessCategory = components["schemas"]["ProcessCategory"];

const categoryBadgeClass: Record<ProcessCategory, string> = {
  RH: "bg-blue-100 text-blue-900",
  MATERIAIS: "bg-amber-100 text-amber-900",
  FINANCEIRO: "bg-emerald-100 text-emerald-900",
  TECNOLOGIA: "bg-violet-100 text-violet-900",
  INFRAESTRUTURA: "bg-orange-100 text-orange-900",
  CONTRATACOES: "bg-rose-100 text-rose-900",
};

const categoryLabel: Record<ProcessCategory, string> = {
  RH: "Recursos Humanos",
  MATERIAIS: "Materiais",
  FINANCEIRO: "Financeiro",
  TECNOLOGIA: "Tecnologia",
  INFRAESTRUTURA: "Infraestrutura",
  CONTRATACOES: "Contratações",
};

function buildReferenceCode(id: string): string {
  const slug = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `PROC-${slug}`;
}

interface ProcessDetailModalProps {
  processId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProcessDetailModal({
  processId,
  open,
  onOpenChange,
}: ProcessDetailModalProps) {
  const query = useProcess(open && processId ? processId : undefined);
  const isAuthenticated = useAuthStore((state) => Boolean(state.token));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-0 overflow-hidden p-0">
        {query.isPending ? <ModalSkeleton /> : null}

        {query.isError ? (
          <ModalError
            message={query.error.message}
            onClose={() => onOpenChange(false)}
          />
        ) : null}

        {query.isSuccess && query.data ? (
          <ModalSuccess
            process={query.data}
            isAuthenticated={isAuthenticated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EyebrowRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="h-3.5 w-0.5 rounded-sm bg-primary" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ModalSuccess({
  process,
  isAuthenticated,
}: {
  process: components["schemas"]["ProcessPublicDetail"];
  isAuthenticated: boolean;
}) {
  const stepLabel =
    process.step_count === 1 ? "1 etapa" : `${process.step_count} etapas`;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-6">
        <div className="flex items-center justify-between gap-4">
          <EyebrowRule label="Ficha do processo" />
          <span
            aria-hidden
            className="font-mono text-xs tracking-wider text-muted-foreground"
          >
            {buildReferenceCode(process.id)}
          </span>
        </div>

        <DialogHeader className="mt-5 space-y-3 text-left">
          <Badge
            variant="outline"
            className={`w-fit border-transparent ${categoryBadgeClass[process.category]}`}
          >
            {categoryLabel[process.category]}
          </Badge>
          <DialogTitle className="text-2xl font-semibold leading-[1.2] tracking-tight">
            {process.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detalhes do processo {process.title}
          </DialogDescription>
        </DialogHeader>

        <Separator className="my-5" />

        <p className="text-[15px] leading-[1.7] text-foreground/90">
          {process.full_description}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-0">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Prazo estimado
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {process.estimated_time}
            </dd>
          </div>
          <div className="border-l border-border pl-4">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Etapas do fluxo
            </dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {stepLabel}
            </dd>
          </div>
        </dl>

        {process.requirements.length > 0 ? (
          <section aria-labelledby="process-requirements" className="mt-6">
            <div id="process-requirements">
              <EyebrowRule label="Pré-requisitos" />
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              {process.requirements.map((item, index) => (
                <div key={index} className="contents">
                  <dt className="font-mono text-xs leading-[1.7] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </dt>
                  <dd className="text-sm leading-[1.7] text-foreground/90">
                    {item}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <p
          aria-hidden
          className="mt-6 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50"
        >
          PROAD · IFAM
        </p>
      </div>

      <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-5 sm:items-center sm:justify-between sm:space-x-4">
        <p className="max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
          Esta ficha é consulta pública — o acompanhamento no SIPAC permanece
          obrigatório.
        </p>
        {isAuthenticated ? (
          <Button asChild>
            <Link to={`/processes/${process.id}/flow`} className="group">
              Ver fluxo completo
              <ArrowRight
                aria-hidden
                className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link to="/login">
              <Lock aria-hidden className="mr-2 h-4 w-4" />
              Fazer login para ver o fluxo
            </Link>
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function ModalSkeleton() {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-6">
        <DialogHeader className="sr-only">
          <DialogTitle>Carregando detalhes do processo</DialogTitle>
          <DialogDescription>
            Aguarde enquanto buscamos os dados do processo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="mt-5 space-y-3">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-7 w-1/2" />
        </div>
        <Separator className="my-5" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-0">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-12 w-32" />
        </div>
      </div>
      <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-5">
        <Skeleton className="h-10 w-40" />
      </DialogFooter>
    </>
  );
}

function ModalError({
  message,
  onClose,
}: {
  message?: string;
  onClose: () => void;
}) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-6">
        <DialogHeader className="sr-only">
          <DialogTitle>Erro ao carregar processo</DialogTitle>
          <DialogDescription>
            Ocorreu um erro ao buscar os dados deste processo.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar esta ficha</AlertTitle>
          <AlertDescription>
            {message ?? "Tente novamente em instantes ou atualize a página."}
          </AlertDescription>
        </Alert>
      </div>
      <DialogFooter className="shrink-0 border-t bg-muted/30 px-6 py-5">
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </DialogFooter>
    </>
  );
}
