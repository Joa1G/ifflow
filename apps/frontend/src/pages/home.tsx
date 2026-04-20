import { AlertCircle, Inbox } from "lucide-react";
import { useState } from "react";

import { ProcessCard } from "../components/processes/process-card";
import type { ProcessCardData } from "../components/processes/process-card";
import { ProcessDetailModal } from "../components/processes/process-detail-modal";
import { SearchBar } from "../components/processes/search-bar";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { Skeleton } from "../components/ui/skeleton";
import { useProcesses } from "../hooks/use-processes";

/**
 * Cards curados da seção "Novo na PROAD?". São recomendações institucionais
 * baseadas nos pedidos mais frequentes de servidores recém-chegados; os IDs
 * reais serão definidos pelo stakeholder (ver F-15 — hardcoded no MVP).
 */
const NEW_COMER_RECOMMENDATIONS: ReadonlyArray<ProcessCardData> = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Solicitação de capacitação",
    short_description:
      "Afastamento para cursos, especializações e outras ações de desenvolvimento.",
    category: "RH",
    estimated_time: "Até 30 dias",
    step_count: 8,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    title: "Pedido de diárias e passagens",
    short_description:
      "Autorização e prestação de contas de viagens a serviço fora da sede.",
    category: "FINANCEIRO",
    estimated_time: "Até 15 dias",
    step_count: 6,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    title: "Concessão de férias",
    short_description:
      "Marcação, interrupção e remarcação do período de férias regulamentares.",
    category: "RH",
    estimated_time: "Até 10 dias",
    step_count: 5,
  },
];

/**
 * Eyebrow tipográfico reusável: régua vertical verde + texto institucional.
 * É o "selo" da marca e aparece tanto no hero quanto nos H2 de seção.
 */
function EyebrowRule({
  label,
  tone = "subdued",
}: {
  label: string;
  tone?: "subdued" | "bold";
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="h-3.5 w-0.5 rounded-sm bg-primary" />
      <span
        className={
          tone === "bold"
            ? "text-xs font-semibold uppercase tracking-[0.2em] text-foreground"
            : "text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        }
      >
        {label}
      </span>
    </div>
  );
}

function ProcessGridSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-48 w-full rounded-lg border border-border/50"
        />
      ))}
    </div>
  );
}

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    null,
  );
  const query = useProcesses(search ? { search } : undefined);

  const isSearching = search.trim().length > 0;
  const total = query.data?.total ?? 0;
  const processes = query.data?.processes ?? [];

  /**
   * Intercepta o click no ProcessCard (que é um <Link>) para abrir o modal.
   * Preserva cmd/ctrl/middle-click para quem quiser abrir a rota em nova aba
   * — a rota `/processes/:id` continua funcional (stub por enquanto).
   */
  const handleCardCapture = (id: string) => (event: React.MouseEvent) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    setSelectedProcessId(id);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <section aria-labelledby="home-hero" className="max-w-3xl space-y-6">
          <EyebrowRule label="PROAD · IFAM" />

          <div className="space-y-4">
            <h1
              id="home-hero"
              className="text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl"
            >
              Consulte qualquer processo da PROAD, do início ao fim.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Etapas, documentos necessários e base legal de cada processo
              administrativo do IFAM. Acompanhe seu próprio andamento com um
              checklist pessoal — sem substituir o SIPAC.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <SearchBar onDebouncedChange={setSearch} />
            <p className="text-xs text-muted-foreground">
              Piloto PROAD ·{" "}
              {query.isSuccess
                ? `${total} ${total === 1 ? "processo publicado" : "processos publicados"}`
                : "carregando catálogo"}
            </p>
          </div>
        </section>

        <section aria-labelledby="processes-heading" className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <EyebrowRule label="Catálogo" tone="bold" />
              <h2
                id="processes-heading"
                className="text-2xl font-semibold tracking-tight"
              >
                Processos publicados
              </h2>
            </div>
            {query.isSuccess ? (
              <span className="text-sm text-muted-foreground">
                {isSearching
                  ? `${total} ${total === 1 ? "resultado" : "resultados"} para "${search.trim()}"`
                  : `${total} ${total === 1 ? "processo" : "processos"}`}
              </span>
            ) : null}
          </div>
          <Separator className="mt-4" />

          <div className="mt-6">
            {query.isPending ? <ProcessGridSkeleton /> : null}

            {query.isError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro ao carregar processos</AlertTitle>
                <AlertDescription>
                  {query.error.message ??
                    "Não foi possível carregar os processos. Tente novamente em instantes."}
                </AlertDescription>
              </Alert>
            ) : null}

            {query.isSuccess && processes.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
                <Inbox
                  aria-hidden
                  className="mb-4 h-12 w-12 text-muted-foreground/60"
                />
                <h3 className="text-lg font-semibold">
                  Nenhum processo encontrado
                </h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  {isSearching
                    ? "Tente um termo mais curto ou remova os filtros."
                    : "Ainda não há processos publicados."}
                </p>
                {isSearching ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-6"
                    onClick={() => setSearch("")}
                  >
                    Limpar busca
                  </Button>
                ) : null}
              </div>
            ) : null}

            {query.isSuccess && processes.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                {processes.map((process) => (
                  <div
                    key={process.id}
                    onClickCapture={handleCardCapture(process.id)}
                  >
                    <ProcessCard process={process} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {!isSearching ? (
          <section aria-labelledby="newcomers-heading" className="mt-16">
            <div className="max-w-2xl space-y-2">
              <EyebrowRule label="Para começar" tone="bold" />
              <h2
                id="newcomers-heading"
                className="text-2xl font-semibold tracking-tight"
              >
                Novo na PROAD? Comece por aqui.
              </h2>
              <p className="text-sm text-muted-foreground">
                Três processos que todo servidor recém-chegado costuma precisar
                consultar nos primeiros meses.
              </p>
            </div>
            <Separator className="mt-4" />

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
              {NEW_COMER_RECOMMENDATIONS.map((process) => (
                <div
                  key={process.id}
                  onClickCapture={handleCardCapture(process.id)}
                >
                  <ProcessCard process={process} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <ProcessDetailModal
        processId={selectedProcessId}
        open={selectedProcessId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProcessId(null);
        }}
      />
    </div>
  );
}
