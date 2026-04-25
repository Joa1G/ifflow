import { Clock3 } from "lucide-react";
import { Link } from "react-router-dom";

import { categoryColors, categoryLabel } from "../../lib/category-colors";
import { formatRelativeTime } from "../../lib/relative-time";
import type { components } from "../../types/api";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ProcessRowActions } from "./process-row-actions";
import { ProcessStatusBadge } from "./process-status-badge";

type ProcessAdminView = components["schemas"]["ProcessAdminView"];

interface AdminProcessesTableProps {
  processes: ProcessAdminView[];
}

/**
 * Tabela admin de processos (F-23).
 *
 * Em desktop (md+) renderiza uma <Table> shadcn densa com 6 colunas.
 * Em mobile vira lista de cards verticais com a mesma informação
 * reorganizada por hierarquia de triagem (status no topo, título grande,
 * metadados densos, timestamp no rodapé).
 *
 * O título da linha é sempre um <Link> para o editor — reduz fricção
 * do fluxo mais comum (editar) sem precisar abrir o dropdown de ações.
 */
export function AdminProcessesTable({ processes }: AdminProcessesTableProps) {
  return (
    <>
      {/* Mobile: lista de cards */}
      <ul className="space-y-3 md:hidden" aria-label="Processos">
        {processes.map((process) => (
          <li
            key={process.id}
            className="rounded-lg border border-ifflow-rule bg-ifflow-paper p-4 shadow-[0_1px_2px_rgba(15,27,18,0.04)]"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <ProcessStatusBadge status={process.status} />
              <ProcessRowActions process={process} />
            </div>

            <Link
              to={`/admin/processes/${process.id}/edit`}
              className="block font-serif text-base font-medium leading-tight text-ifflow-ink underline-offset-4 hover:underline focus-visible:underline"
            >
              {process.title}
            </Link>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ifflow-muted">
              <Badge
                variant="secondary"
                className={cn(
                  "border-transparent font-normal",
                  categoryColors[process.category],
                )}
              >
                {categoryLabel[process.category]}
              </Badge>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {process.estimated_time}
              </span>
            </div>

            <Separator className="my-3 bg-ifflow-rule" />
            <p
              className="text-xs text-ifflow-muted"
              title={process.updated_at}
            >
              Atualizado {formatRelativeTime(process.updated_at)}
            </p>
          </li>
        ))}
      </ul>

      {/* Desktop: tabela */}
      <div className="hidden overflow-hidden rounded-lg border border-ifflow-rule bg-ifflow-paper md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-ifflow-rule hover:bg-transparent">
              <TableHead className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted">
                Processo
              </TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted">
                Categoria
              </TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted">
                Status
              </TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted">
                Tempo estimado
              </TableHead>
              <TableHead className="text-[11px] font-medium uppercase tracking-[0.14em] text-ifflow-muted">
                Atualizado
              </TableHead>
              <TableHead className="w-12 text-right">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processes.map((process) => (
              <TableRow
                key={process.id}
                className="border-ifflow-rule transition-colors hover:bg-ifflow-bone/60"
              >
                <TableCell className="max-w-md">
                  <Link
                    to={`/admin/processes/${process.id}/edit`}
                    className="font-serif text-[15px] font-medium text-ifflow-ink underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {process.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "border-transparent font-normal",
                      categoryColors[process.category],
                    )}
                  >
                    {categoryLabel[process.category]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ProcessStatusBadge status={process.status} />
                </TableCell>
                <TableCell className="text-sm text-ifflow-muted">
                  {process.estimated_time}
                </TableCell>
                <TableCell
                  className="text-sm text-ifflow-muted"
                  title={process.updated_at}
                >
                  {formatRelativeTime(process.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <ProcessRowActions process={process} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
