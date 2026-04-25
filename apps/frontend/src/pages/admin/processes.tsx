import { AlertCircle, ClipboardList, Plus, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { AdminProcessesTable } from "../../components/admin/admin-processes-table";
import {
  type AdminProcessesListFilters,
  useAdminProcessesList,
} from "../../hooks/use-admin-processes";
import { categoryLabel } from "../../lib/category-colors";
import { ApiError } from "../../lib/api-error";
import type { components } from "../../types/api";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";

type ProcessStatus = components["schemas"]["ProcessStatus"];
type ProcessCategory = components["schemas"]["ProcessCategory"];

const STATUS_TABS: ReadonlyArray<{
  value: "ALL" | ProcessStatus;
  label: string;
}> = [
  { value: "ALL", label: "Todos" },
  { value: "DRAFT", label: "Rascunho" },
  { value: "IN_REVIEW", label: "Em revisão" },
  { value: "PUBLISHED", label: "Publicado" },
  { value: "ARCHIVED", label: "Arquivado" },
];

const CATEGORY_OPTIONS: ReadonlyArray<ProcessCategory> = [
  "RH",
  "MATERIAIS",
  "FINANCEIRO",
  "TECNOLOGIA",
  "INFRAESTRUTURA",
  "CONTRATACOES",
];

/**
 * Tela admin de gestão de processos (F-23).
 *
 * Fica atrás de `<ProtectedRoute requiredRole="ADMIN">` em App.tsx — se
 * o usuário não for ADMIN/SUPER_ADMIN, nem chega aqui. Independente
 * disso, a autorização real é no backend (ADR-008): o frontend só usa o
 * role para decidir o que mostrar.
 *
 * Filtros vivem em estado local (não na URL); para um piloto com poucos
 * processos isso é suficiente e mantém o componente simples.
 */
export default function AdminProcessesPage() {
  const [statusFilter, setStatusFilter] = useState<"ALL" | ProcessStatus>(
    "ALL",
  );
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | ProcessCategory>(
    "ALL",
  );

  const filters: AdminProcessesListFilters = useMemo(
    () => ({
      ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      ...(categoryFilter !== "ALL" ? { category: categoryFilter } : {}),
    }),
    [statusFilter, categoryFilter],
  );

  const query = useAdminProcessesList(filters);
  const hasActiveFilter = statusFilter !== "ALL" || categoryFilter !== "ALL";

  const clearFilters = () => {
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-ifflow-bone">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
        <nav
          aria-label="Caminho"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted"
        >
          Admin <span aria-hidden>/</span> Processos
        </nav>

        <header className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ifflow-ink md:text-4xl">
              Processos administrativos
            </h1>
            <p className="mt-2 text-sm text-ifflow-muted">
              Gerencie o ciclo de vida dos processos: rascunho, revisão,
              publicação e arquivamento. Servidores só enxergam processos
              publicados.
            </p>
          </div>

          <Button
            asChild
            className="h-10 shrink-0 bg-ifflow-green font-medium text-white hover:bg-ifflow-green-hover"
          >
            <Link to="/admin/processes/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Novo processo
            </Link>
          </Button>
        </header>

        <section
          aria-label="Filtros"
          className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        >
          <Tabs
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as "ALL" | ProcessStatus)
            }
            className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0"
          >
            <TabsList className="h-auto justify-start gap-1 bg-transparent p-0">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-ifflow-muted data-[state=active]:border-ifflow-rule data-[state=active]:bg-ifflow-paper data-[state=active]:text-ifflow-ink data-[state=active]:shadow-sm"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3">
            <label
              htmlFor="category-filter"
              className="sr-only"
            >
              Filtrar por categoria
            </label>
            <Select
              value={categoryFilter}
              onValueChange={(value) =>
                setCategoryFilter(value as "ALL" | ProcessCategory)
              }
            >
              <SelectTrigger
                id="category-filter"
                className="h-10 w-full border-ifflow-rule bg-ifflow-paper md:w-[220px]"
              >
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as categorias</SelectItem>
                {CATEGORY_OPTIONS.map((category) => (
                  <SelectItem key={category} value={category}>
                    {categoryLabel[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="mt-6">
          <ProcessesContent
            query={query}
            hasActiveFilter={hasActiveFilter}
            onClearFilters={clearFilters}
          />
        </section>
      </div>
    </main>
  );
}

interface ProcessesContentProps {
  query: ReturnType<typeof useAdminProcessesList>;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
}

function ProcessesContent({
  query,
  hasActiveFilter,
  onClearFilters,
}: ProcessesContentProps) {
  if (query.isPending) {
    return <ProcessesSkeleton />;
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Erro ao carregar processos</AlertTitle>
        <AlertDescription>
          {query.error instanceof ApiError
            ? query.error.message
            : "Não foi possível carregar a lista de processos. Tente novamente."}
        </AlertDescription>
      </Alert>
    );
  }

  const processes = query.data.processes;

  if (processes.length === 0) {
    return hasActiveFilter ? (
      <EmptyFiltered onClearFilters={onClearFilters} />
    ) : (
      <EmptyZero />
    );
  }

  return (
    <>
      <p
        aria-live="polite"
        className="mb-3 text-xs text-ifflow-muted md:text-right"
      >
        {processes.length}{" "}
        {processes.length === 1 ? "processo" : "processos"}
      </p>
      <AdminProcessesTable processes={processes} />
    </>
  );
}

function ProcessesSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando processos"
      className="space-y-3"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-16 w-full rounded-lg bg-ifflow-rule/40"
        />
      ))}
    </div>
  );
}

function EmptyZero() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ifflow-rule bg-ifflow-paper py-16 text-center">
      <ClipboardList
        className="mb-4 h-12 w-12 text-ifflow-muted"
        aria-hidden
      />
      <h3 className="font-serif text-lg font-medium text-ifflow-ink">
        Nenhum processo cadastrado
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ifflow-muted">
        Comece criando o primeiro processo administrativo do IFFLOW.
      </p>
      <Button
        asChild
        className="mt-6 bg-ifflow-green text-white hover:bg-ifflow-green-hover"
      >
        <Link to="/admin/processes/new">
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Novo processo
        </Link>
      </Button>
    </div>
  );
}

function EmptyFiltered({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ifflow-rule bg-ifflow-paper py-16 text-center">
      <SearchX className="mb-4 h-12 w-12 text-ifflow-muted" aria-hidden />
      <h3 className="font-serif text-lg font-medium text-ifflow-ink">
        Nenhum processo encontrado
      </h3>
      <p className="mt-2 max-w-sm text-sm text-ifflow-muted">
        Ajuste os filtros para ver outros processos.
      </p>
      <Button
        variant="outline"
        className="mt-6 border-ifflow-rule"
        onClick={onClearFilters}
      >
        Limpar filtros
      </Button>
    </div>
  );
}
