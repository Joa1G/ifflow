import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { __resetApiClientForTests } from "../../lib/api-client";
import { useAuthStore, wireAuthStoreToApiClient } from "../../stores/auth-store";
import type { components } from "../../types/api";
import { AdminProcessesTable } from "./admin-processes-table";

type ProcessAdminView = components["schemas"]["ProcessAdminView"];

const baseProcess: ProcessAdminView = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Solicitação de Capacitação",
  short_description: "Curta",
  full_description: "Completa",
  category: "RH",
  estimated_time: "30 dias",
  requirements: [],
  status: "PUBLISHED",
  access_count: 0,
  created_by: "00000000-0000-4000-8000-000000000000",
  approved_by: null,
  created_at: "2026-04-21T10:00:00Z",
  updated_at: "2026-04-21T10:00:00Z",
};

let queryClient: QueryClient;

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: "t", user: null, isHydrating: false });
  __resetApiClientForTests();
  wireAuthStoreToApiClient();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

function renderTable(processes: ProcessAdminView[]) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminProcessesTable processes={processes} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("<AdminProcessesTable />", () => {
  it("renderiza uma linha por processo com título clicável para o editor", () => {
    renderTable([
      baseProcess,
      {
        ...baseProcess,
        id: "22222222-2222-4222-8222-222222222222",
        title: "Aquisição de Materiais",
        category: "MATERIAIS",
        status: "DRAFT",
      },
    ]);

    // Os títulos aparecem como links para o editor (em desktop e mobile,
    // por isso usamos getAllBy).
    const linksTitulo1 = screen.getAllByRole("link", {
      name: "Solicitação de Capacitação",
    });
    expect(linksTitulo1.length).toBeGreaterThan(0);
    expect(linksTitulo1[0]).toHaveAttribute(
      "href",
      `/admin/processes/${baseProcess.id}/edit`,
    );

    const linksTitulo2 = screen.getAllByRole("link", {
      name: "Aquisição de Materiais",
    });
    expect(linksTitulo2.length).toBeGreaterThan(0);
  });

  it("mostra badges de status traduzidos para português", () => {
    renderTable([
      { ...baseProcess, status: "DRAFT" },
      {
        ...baseProcess,
        id: "22222222-2222-4222-8222-222222222222",
        status: "IN_REVIEW",
      },
    ]);

    // Cada status aparece duas vezes (mobile card + desktop row).
    expect(screen.getAllByText("Rascunho").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Em revisão").length).toBeGreaterThan(0);
  });

  it("expõe um botão de ações por processo, com aria-label nominal", () => {
    renderTable([baseProcess]);

    // 2 botões de ação no DOM (mobile + desktop), ambos com o mesmo nome
    // — usamos getAllBy para garantir presença sem depender do viewport.
    const actionButtons = screen.getAllByRole("button", {
      name: /Ações para Solicitação de Capacitação/i,
    });
    expect(actionButtons.length).toBeGreaterThan(0);
  });
});
