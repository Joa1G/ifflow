import { AlertCircle, ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Skeleton } from "../components/ui/skeleton";
import { useProcess } from "../hooks/use-processes";
import { useAuthStore } from "../stores/auth-store";
import { categoryColors, categoryLabel } from "../lib/category-colors";
import type { components } from "../types/api";

type ProcessPublicDetail = components["schemas"]["ProcessPublicDetail"];

/**
 * Página pública de detalhe de um processo.
 *
 * O fluxo principal de descoberta passa pelo modal aberto a partir da
 * Home (F-16) — mas a rota `/processes/:id` precisa ser navegável
 * diretamente: middle-click no ProcessCard, links externos, e o redirect
 * pós-login da rota `/processes/:id/flow` quando o usuário não está
 * autenticado também acaba caindo aqui depois.
 *
 * Mantemos o mesmo conteúdo informativo do modal — categoria, descrição,
 * prazo, etapas, requisitos — em layout de página plena, com o Header
 * institucional global em cima (esta rota não está em AUTH_SHELL_ROUTES).
 */
export default function ProcessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useProcess(id);
  const isAuthenticated = useAuthStore((state) => Boolean(state.token));

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Voltar para processos
        </Link>
      </div>

      {query.isPending ? <DetailSkeleton /> : null}

      {query.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar este processo</AlertTitle>
          <AlertDescription>
            {query.error.message ??
              "Tente novamente em instantes ou volte para o catálogo."}
          </AlertDescription>
        </Alert>
      ) : null}

      {query.isSuccess ? (
        <DetailBody
          process={query.data}
          isAuthenticated={isAuthenticated}
        />
      ) : null}
    </main>
  );
}

function buildReferenceCode(id: string): string {
  const slug = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `PROC-${slug}`;
}

function EyebrowRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="h-3.5 w-0.5 rounded-sm bg-primary" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

interface DetailBodyProps {
  process: ProcessPublicDetail;
  isAuthenticated: boolean;
}

function DetailBody({ process, isAuthenticated }: DetailBodyProps) {
  const stepLabel =
    process.step_count === 1 ? "1 etapa" : `${process.step_count} etapas`;

  return (
    <article>
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <EyebrowRule label="Ficha do processo" />
          <span
            aria-hidden
            className="font-mono text-xs tracking-wider text-muted-foreground"
          >
            {buildReferenceCode(process.id)}
          </span>
        </div>

        <Badge
          variant="outline"
          className={`w-fit border-transparent ${categoryColors[process.category]}`}
        >
          {categoryLabel[process.category]}
        </Badge>

        <h1 className="text-3xl font-bold leading-[1.15] tracking-tight md:text-4xl">
          {process.title}
        </h1>
      </header>

      <Separator className="my-6" />

      <p className="text-[15px] leading-[1.7] text-foreground/90 md:text-base">
        {process.full_description}
      </p>

      <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-0">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Prazo estimado
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {process.estimated_time}
          </dd>
        </div>
        <div className="sm:border-l sm:border-border sm:pl-4">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Etapas do fluxo
          </dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {stepLabel}
          </dd>
        </div>
      </dl>

      {process.requirements.length > 0 ? (
        <section aria-labelledby="process-requirements" className="mt-10">
          <div id="process-requirements">
            <EyebrowRule label="Pré-requisitos" />
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
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

      <Separator className="mt-10" />

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
          Esta ficha é consulta pública — o acompanhamento no SIPAC
          permanece obrigatório.
        </p>
        {isAuthenticated ? (
          <Button asChild className="w-full sm:w-auto">
            <Link to={`/processes/${process.id}/flow`} className="group">
              Ver fluxo completo
              <ArrowRight
                aria-hidden
                className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </Button>
        ) : (
          <Button asChild className="w-full sm:w-auto">
            <Link to="/login">
              <Lock aria-hidden className="mr-2 h-4 w-4" />
              Fazer login para ver o fluxo
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-9 w-1/2" />
      <Separator className="my-6" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-12 w-32" />
      </div>
    </div>
  );
}
